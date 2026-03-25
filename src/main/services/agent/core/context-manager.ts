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
    const compacted = await compactHistoryIfNeeded({
      summarize: this.createSummarizeFn(),
      messages: params.messages,
      contextWindowTokens: this.options.contextTokens
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

    let firstKeptEntryId: string | undefined
    for (const msg of result.pruneResult.messages) {
      const candidate = this.options.sessionManager.resolveMessageEntryId(params.sessionKey, msg)
      if (candidate) {
        firstKeptEntryId = candidate
        break
      }
    }

    if (firstKeptEntryId) {
      const tokensBefore = estimateMessagesTokens(params.messages)
      await this.options.sessionManager.appendCompaction(
        params.sessionKey,
        result.summary,
        firstKeptEntryId,
        tokensBefore
      )

      // 1. 发出压缩元数据事件
      this.options.emit({
        type: 'chat:notice',
        runId: params.runId,
        sessionKey: params.sessionKey,
        summaryChars: result.summary.length,
        droppedMessages: result.pruneResult.droppedMessages.length,
        firstKeptEntryId
      })

      // 2. 发出总结消息事件（用于 UI 渲染总结卡片）
      if (result.summaryMessage) {
        this.options.emit({
          type: 'chat:userMessage',
          runId: params.runId,
          sessionKey: params.sessionKey,
          message: result.summaryMessage
        })
      }
    } else {
      console.warn('[ContextManager] 无法定位 compaction 的 firstKeptEntryId，已跳过持久化。')
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
}
