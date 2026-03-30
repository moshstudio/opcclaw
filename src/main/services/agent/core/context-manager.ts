import {
  compactHistoryIfNeeded,
  type PruneResult,
  type SummarizeFn
} from '@main/services/context/index'
import { completeSimple } from '@mariozechner/pi-ai'
import type { SessionManager, Message } from '@main/services/session/session'
import { estimateMessagesTokens } from '@main/services/context/index'
import type { Model, Api } from '@mariozechner/pi-ai'
import type { MiniAgentEvent } from '../agent-events'
import { CONTEXT_RESERVE_TOKENS } from '@shared/types/agent'
import { Logger } from '@main/services/common/logger'

export interface ContextManagerOptions {
  sessionManager: SessionManager
  contextTokens: number
  modelDef?: Model<Api>
  apiKey?: string
  emit: (event: MiniAgentEvent) => void
}

/**
 * Agent 上下文管理器
 *
 * 负责会话消息的压缩、裁剪与总结，确保不超出 LLM 的 Token 限制。
 */
export class AgentContextManager {
  private logger = new Logger('[ContextManager]')
  constructor(private options: ContextManagerOptions) {}

  /**
   * 为运行准备消息：执行压缩、修剪并生成可能的总结消息。
   */
  async prepareMessages(params: {
    messages: Message[]
    sessionKey: string
    runId: string
  }): Promise<{
    pruned: PruneResult
    summary?: string
    summaryMessage?: Message
  }> {
    const effectiveLimit = Math.max(0, this.options.contextTokens - CONTEXT_RESERVE_TOKENS)

    const compacted = await compactHistoryIfNeeded({
      summarize: this.createSummarizeFn(),
      messages: params.messages,
      contextWindowTokens: effectiveLimit
    })

    // 如果产生了总结，则执行持久化
    if (compacted.summary) {
      await this.persistCompaction(params, compacted)
    }

    return {
      pruned: compacted.pruneResult,
      summary: compacted.summary,
      summaryMessage: compacted.summaryMessage
    }
  }

  /**
   * 持久化压缩结果到会话管理器并触发事件
   */
  private async persistCompaction(
    params: { messages: Message[]; sessionKey: string; runId: string },
    result: { summary?: string; summaryMessage?: Message; pruneResult: PruneResult }
  ): Promise<void> {
    if (!result.summary) return

    let firstKeptId: string | undefined
    for (const msg of result.pruneResult.messages) {
      const candidate = this.options.sessionManager.resolveMessageEntryId(params.sessionKey, msg)
      if (candidate) {
        firstKeptId = msg.id || candidate
        break
      }
    }

    if (firstKeptId) {
      const tokensBefore = estimateMessagesTokens(params.messages)
      await this.options.sessionManager.appendCompaction(
        params.sessionKey,
        result.summary,
        firstKeptId,
        tokensBefore
      )

      // 1. 发出压缩元数据事件
      this.options.emit({
        type: 'notice:compact',
        runId: params.runId,
        sessionKey: params.sessionKey,
        summaryChars: result.summary.length,
        droppedMessages: result.pruneResult.droppedMessages.length,
        firstKeptId
      })

      // 2. 发出总结消息事件（用于 UI 渲染总结卡片）
      if (result.summaryMessage) {
        this.options.emit({
          type: 'chat:userMessage',
          runId: params.runId,
          sessionKey: params.sessionKey,
          message: result.summaryMessage,
          messageId: result.summaryMessage.id!
        })
      }
    } else {
      console.warn('[ContextManager] 无法定位 compaction 的 firstKeptId，已跳过持久化。')
    }
  }

  /**
   * 创建总结器函数，绑定当前 Agent 配置的模型
   */
  private createSummarizeFn(): SummarizeFn {
    const { modelDef, apiKey } = this.options
    if (!modelDef || !apiKey) {
      return async () => '无法进行总结（未配置模型）'
    }

    return async (params) => {
      const result = await completeSimple(
        modelDef,
        {
          systemPrompt: params.system,
          messages: [{ role: 'user', content: params.userPrompt, timestamp: Date.now() }]
        },
        { maxTokens: params.maxTokens, apiKey }
      )
      const text = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
      return text.trim()
    }
  }

  /** 更新配置（在 Agent 模型配置变更时调用） */
  updateConfig(
    config: Partial<Pick<ContextManagerOptions, 'modelDef' | 'apiKey' | 'contextTokens'>>
  ) {
    if (config.modelDef !== undefined) this.options.modelDef = config.modelDef
    if (config.apiKey !== undefined) this.options.apiKey = config.apiKey
    if (config.contextTokens !== undefined) this.options.contextTokens = config.contextTokens
  }

  /**
   * 统一的：上下文容量溢出检查、主动压缩与新消息注入的流水线。
   * 支持外部循环和主入口分别调用。
   */
  async enforceContextLimitsAndInject(params: {
    messages: Message[]
    pendingMessages: Message[]
    sessionKey: string
    runId: string
    protectLastMessage?: boolean
    compactionSummary?: Message
  }): Promise<{
    currentMessages: Message[]
    compactionSummary?: Message
  }> {
    const effectiveLimit = Math.max(0, this.options.contextTokens - CONTEXT_RESERVE_TOKENS)

    // 计算 Token (如果保护最后一条物理消息，则切出再算，并补充已有 summary的占用)
    const messagesToMeasure = params.protectLastMessage
      ? params.messages.slice(0, -1)
      : params.messages
    const historyTokens =
      estimateMessagesTokens(messagesToMeasure) +
      (params.compactionSummary ? estimateMessagesTokens([params.compactionSummary]) : 0)

    let compactionSummary = params.compactionSummary
    let currentMessages = [...params.messages]

    const shouldCompact = historyTokens >= effectiveLimit
    this.logger.debug(
      `[EnforceContext] 历史 Token: ${historyTokens}, 限制: ${effectiveLimit}, 是否需要压缩: ${shouldCompact}`
    )

    if (shouldCompact) {
      // 执行压缩
      const compact = await this.prepareMessages({
        messages: currentMessages,
        sessionKey: params.sessionKey,
        runId: params.runId
      })

      if (compact.summaryMessage) {
        compactionSummary = compact.summaryMessage
        // 重新挂载被 sessionManager 物理修剪过的内容，以确保当前内存和 DB 同步
        const updatedHistory = await this.options.sessionManager.load(params.sessionKey)
        currentMessages = [...updatedHistory.messages]

        const afterTokens = estimateMessagesTokens(currentMessages)
        this.logger.debug(
          `[EnforceContext] 压缩完成！压缩后历史 Token 为: ${afterTokens} (之前: ${historyTokens})`
        )
      }
    }

    // 正式注入并持久化所有新待办的消息
    if (params.pendingMessages.length > 0) {
      for (const msg of params.pendingMessages) {
        await this.options.sessionManager.append(params.sessionKey, msg)
        currentMessages.push(msg)
      }
    }

    return { currentMessages, compactionSummary }
  }
}
