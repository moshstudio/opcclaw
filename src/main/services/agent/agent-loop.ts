/**
 * Agent 主循环
 *
 * 对应 OpenClaw: pi-agent-core → agent-loop.ts — runLoop()
 *
 * 架构说明：
 * - 采用 Orchestrator 模式，负责协调 Context、LLM、Tools 和 Metrics。
 * - 采用双层循环结构：外层处理 Follow-ups，内层处理 Tools 和 Steering。
 * - 纯函数设计，不持有 Agent 实例状态，通过 params 接收依赖。
 */

import type { EventStream, Api, Usage } from '@mariozechner/pi-ai'
import type { Tool, ToolContext } from '@main/services/tools/types'
import type { Message, AgentPerformance } from '@main/services/agent/agent-events'
import type { Model, StreamFunction, ThinkingLevel } from '@mariozechner/pi-ai'
import { describeError, isContextOverflowError } from '@main/services/provider/errors'
import { createMiniAgentStream, type MiniAgentEvent, type MiniAgentResult } from './agent-events'
import { newShortId } from '@shared/utils/id'

// 导入解耦后的子模块
import { MetricsTracker } from './loop/metrics'
import { prepareContext, estimateMessagesTokens } from './loop/context-handler'
import { executeLlmCall, LlmResult } from './loop/llm-handler'
import { executeToolCalls } from './loop/tool-handler'

// ============== 类型定义 ==============

export interface UsageRecord {
  runId: string
  sessionKey: string
  agentId: string
  model: string
  timestamp: number
  usage: Usage
  performance: AgentPerformance
}

export interface AgentLoopParams {
  runId: string
  sessionKey: string
  agentId: string
  /** 可变: 循环中会 push 新消息 */
  currentMessages: Message[]
  compactionSummary: Message | undefined
  systemPrompt: string
  toolsForRun: Tool[]
  toolCtx: ToolContext
  modelDef: Model<Api>
  streamFn: StreamFunction
  apiKey?: string
  temperature?: number
  /** 思考级别: 传入后启用 extended thinking */
  reasoning?: ThinkingLevel
  maxTurns: number
  maxTokens?: number
  contextTokens: number
  /**
   * 获取 steering 消息
   * 每执行完一个工具后调用。返回非空数组时跳过剩余工具，注入到下一轮。
   */
  getSteeringMessages: () => Promise<Message[]>
  /**
   * 获取 follow-up 消息
   * 内层循环结束后调用。返回非空数组时继续外层循环（Outer Loop）。
   */
  getFollowUpMessages?: () => Promise<Message[]>
  /** 消息持久化回调 */
  appendMessage: (sessionKey: string, msg: Message) => Promise<void>
  /** Compaction 触发器 (供超限回退时调用) */
  prepareCompaction: (params: {
    messages: Message[]
    sessionKey: string
    runId: string
  }) => Promise<{
    summary?: string
    summaryMessage?: Message
    pruned?: { droppedMessages: any[] }
  }>
  /** 统一拦截和修剪消息容器 */
  enforceContextLimitsAndInject: (params: {
    messages: Message[]
    pendingMessages: Message[]
    sessionKey: string
    runId: string
    protectLastMessage?: boolean
    compactionSummary?: Message
  }) => Promise<{
    currentMessages: Message[]
    compactionSummary?: Message
  }>
  /** 记录用量统计 */
  recordUsage?: (record: UsageRecord) => Promise<void>
  /** 外部中止信号 */
  abortSignal: AbortSignal
}

// ============== 主循环 ==============

/**
 * Agent 主循环入口
 *
 * @param params 循环参数
 * @returns 返回一个异步可迭代的 EventStream
 */
export function runAgentLoop(
  params: AgentLoopParams
): EventStream<MiniAgentEvent, MiniAgentResult> {
  const stream = createMiniAgentStream()
  const metrics = new MetricsTracker()

  // IIFE 异步执行循环逻辑
  ;(async () => {
    const {
      runId,
      sessionKey,
      agentId,
      systemPrompt,
      toolsForRun,
      toolCtx,
      modelDef,
      streamFn,
      apiKey,
      temperature,
      reasoning,
      maxTurns,
      maxTokens,
      contextTokens,
      getSteeringMessages,
      getFollowUpMessages,
      appendMessage,
      prepareCompaction,
      enforceContextLimitsAndInject,
      recordUsage,
      abortSignal
    } = params

    let { compactionSummary, currentMessages } = params
    let turns = 0
    let finalText = ''
    let overflowCompactionAttempted = false

    try {
      // ========== OUTER LOOP (Follow-ups) ==========
      outerLoop: while (true) {
        // 初始检查 steering
        let pendingMessages = await getSteeringMessages()
        let hasMoreToolCalls = true

        // ========== INNER LOOP (LLM + Tools + Steering) ==========
        while (hasMoreToolCalls || pendingMessages.length > 0) {
          if (turns >= maxTurns || abortSignal.aborted) {
            break outerLoop
          }

          turns++
          metrics.startTurn()
          stream.push({ type: 'agent:turn-start', agentId, runId, sessionKey, turn: turns })

          // --- 主动 Token 溢出检查、压缩与待办消息注入 ---
          const enforced = await enforceContextLimitsAndInject({
            messages: currentMessages,
            pendingMessages,
            sessionKey,
            runId,
            protectLastMessage: true,
            compactionSummary
          })

          currentMessages = enforced.currentMessages
          if (enforced.compactionSummary) {
            compactionSummary = enforced.compactionSummary
          }

          // 新的待办消息已经被 enforceContextLimitsAndInject 物理持久化到了 sessionManager
          // 我们只需要进行 UI stream 的回放广播
          if (pendingMessages.length > 0) {
            for (const msg of pendingMessages) {
              stream.push({
                type: 'chat:userMessage',
                agentId,
                runId,
                sessionKey,
                message: msg,
                messageId: msg.id!
              })
            }
            pendingMessages = []
          }

          // 预测硬性溢出：单条最新消息 + System Prompt 若超出总限额，必须直接报错
          const baseTokens = estimateMessagesTokens([
            { id: 'system-base', role: 'user', content: systemPrompt, timestamp: 0 }
          ])
          const lastMsgTokens =
            currentMessages.length > 0
              ? estimateMessagesTokens([currentMessages[currentMessages.length - 1]])
              : 0

          if (baseTokens + lastMsgTokens > contextTokens) {
            throw new Error(
              `[ContextOverflow] Current message and system prompt (${baseTokens + lastMsgTokens}) exceed context limit (${contextTokens}).`
            )
          }

          // 1. 上下文准备 (由底层的 pruneContextMessages 保底)
          // 这里的修剪是针对内存数组的物理切断，以防最新加入的内容极大导致依然超限。
          // 真正的压缩已在历史溢出预检中完成。
          const { piContext } = prepareContext({
            currentMessages,
            compactionSummary,
            systemPrompt,
            contextTokens,
            toolsForRun,
            modelDef
          })

          // 2. LLM 流式调用
          const assistantMessageId = newShortId()

          // 发送正式的聊天启动事件，使得前端能够立即创建消息占位符
          stream.push({
            type: 'chat:start',
            agentId,
            runId,
            sessionKey,
            message: {
              id: assistantMessageId,
              role: 'assistant',
              content: [],
              timestamp: Date.now(),
              api: modelDef.api,
              provider: modelDef.provider as string,
              model: modelDef.id,
              stopReason: 'stop'
            } as Message,
            messageId: assistantMessageId
          })

          let llmOutput: LlmResult
          try {
            llmOutput = await executeLlmCall(
              {
                agentId,
                runId,
                sessionKey,
                messageId: assistantMessageId,
                modelDef,
                streamFn,
                apiKey,
                temperature,
                maxTokens,
                reasoning,
                abortSignal
              },
              piContext,
              stream,
              metrics
            )
          } catch (llmError) {
            // 上下文溢出自动压缩逻辑
            const errorText = describeError(llmError)
            if (isContextOverflowError(errorText) && !overflowCompactionAttempted) {
              overflowCompactionAttempted = true
              stream.push({
                type: 'agent:context-overflow',
                agentId,
                runId,
                sessionKey,
                error: llmError instanceof Error ? llmError.message : String(llmError)
              })
              const overflowPrep = await prepareCompaction({
                messages: currentMessages,
                sessionKey,
                runId
              })
              if (overflowPrep.summary && overflowPrep.summaryMessage) {
                compactionSummary = overflowPrep.summaryMessage
                turns-- // 回退 turn 计数，重新尝试
                continue
              }
            }
            throw llmError
          }

          // 3. 保存 Assistant 消息
          const assistantMsg = llmOutput.assistantMessage as Message
          assistantMsg.id = assistantMessageId // 强制使用流式过程中预生成的正式 ID
          assistantMsg.performance = metrics.getTurnPerformance(llmOutput.usage?.output)
          if (llmOutput.usage) assistantMsg.usage = llmOutput.usage
          await appendMessage(sessionKey, assistantMsg)
          currentMessages.push(assistantMsg)

          if (llmOutput.turnText) {
            stream.push({
              type: 'chat:final',
              agentId,
              runId,
              sessionKey,
              message: assistantMsg,
              text: llmOutput.turnText,
              messageId: assistantMessageId,
              usage: llmOutput.usage,
              performance: assistantMsg.performance
            })
          }

          hasMoreToolCalls = llmOutput.toolCalls.length > 0

          if (!hasMoreToolCalls) {
            // 本轮 LLM 没有工具调用，正常结束
            finalText = llmOutput.turnText
          } else {
            // 执行工具调用并保存结果
            const toolResults = await executeToolCalls(
              llmOutput.toolCalls,
              toolsForRun,
              toolCtx,
              agentId,
              runId,
              sessionKey,
              stream,
              metrics
            )

            for (const res of toolResults) {
              await appendMessage(sessionKey, res)
              currentMessages.push(res)
            }
          }

          // 统一结束本轮并广播事件
          stream.push({ type: 'agent:turn-end', agentId, runId, sessionKey, turn: turns })

          // 核心控制点：监听干预 (Steering)。如果有干预或工具产生，会自动进入下一轮 inner loop
          pendingMessages = await getSteeringMessages()
        } // end inner while

        // 检查 Follow-up
        if (getFollowUpMessages) {
          const followUp = await getFollowUpMessages()
          if (followUp.length > 0) {
            pendingMessages = followUp
            continue
          }
        }
        break
      } // end outer while
    } catch (err) {
      stream.push({
        type: 'agent:run-error',
        agentId,
        runId,
        sessionKey,
        error: describeError(err)
      })
    } finally {
      // ========== 结束前记录性能与用量 (总是执行) ==========
      const performance = metrics.getPerformance()
      const finalUsage = metrics.accumulatedUsage

      if (recordUsage && modelDef.id) {
        // 捕获异步记录，不阻塞流关闭
        recordUsage({
          runId,
          sessionKey,
          agentId,
          model: modelDef.id,
          timestamp: Date.now(),
          usage: finalUsage,
          performance
        }).catch((e) => console.error('[AgentLoop] Failed to record usage:', e))
      }

      stream.push({
        type: 'agent:run-end',
        agentId,
        runId,
        sessionKey,
        messages: currentMessages,
        usage: finalUsage,
        performance
      })

      stream.end({
        finalText,
        turns,
        totalToolCalls: metrics.totalToolCalls,
        messages: currentMessages,
        usage: finalUsage,
        performance
      })
    }
  })()

  return stream
}
