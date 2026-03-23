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
import { describeError, isContextOverflowError } from '@main/services/provider/errors.js'
import { createMiniAgentStream, type MiniAgentEvent, type MiniAgentResult } from './agent-events.js'

// 导入解耦后的子模块
import { MetricsTracker } from './loop/metrics'
import { prepareContext } from './loop/context-handler'
import { executeLlmCall } from './loop/llm-handler'
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
  /** Compaction 触发器 */
  prepareCompaction: (params: {
    messages: Message[]
    sessionKey: string
    runId: string
  }) => Promise<{
    summary?: string
    summaryMessage?: Message
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
      currentMessages,
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
      recordUsage,
      abortSignal
    } = params

    let { compactionSummary } = params
    let turns = 0
    let finalText = ''
    let overflowCompactionAttempted = false

    try {
      // 初始检查 steering (用户在 agent 启动间隙可能输入了消息)
      let pendingMessages = await getSteeringMessages()

      // ========== OUTER LOOP (Follow-ups) ==========
      outerLoop: while (true) {
        let hasMoreToolCalls = true

        // ========== INNER LOOP (LLM + Tools + Steering) ==========
        while (hasMoreToolCalls || pendingMessages.length > 0) {
          if (turns >= maxTurns || abortSignal.aborted) break outerLoop

          turns++
          stream.push({ type: 'agent:turn-start', runId, sessionKey, turn: turns })

          // 处理待响应消息（Steering 或 Follow-up）
          if (pendingMessages.length > 0) {
            for (const msg of pendingMessages) {
              await appendMessage(sessionKey, msg)
              currentMessages.push(msg)
              stream.push({ type: 'chat:userMessage', runId, sessionKey, message: msg })
            }
            pendingMessages = []
          }

          // 1. 上下文准备
          const { piContext, prunedCount } = prepareContext({
            currentMessages,
            compactionSummary,
            systemPrompt,
            contextTokens,
            toolsForRun,
            modelDef
          })

          // 推送压缩/清理事件
          if (prunedCount > 0) {
            const content = compactionSummary?.content
            let summaryLen = 0
            if (typeof content === 'string') {
              summaryLen = content.length
            } else if (Array.isArray(content)) {
              summaryLen = content
                .map((b) => ('text' in b ? String(b.text || '') : ''))
                .join('').length
            }
            stream.push({
              type: 'chat:notice',
              runId,
              sessionKey,
              summaryChars: summaryLen,
              droppedMessages: prunedCount
            })
          }

          // 2. LLM 流式调用
          let llmOutput
          try {
            llmOutput = await executeLlmCall(
              {
                runId,
                sessionKey,
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
          assistantMsg.performance = metrics.getPerformance()
          if (llmOutput.usage) assistantMsg.usage = llmOutput.usage
          await appendMessage(sessionKey, assistantMsg)
          currentMessages.push(assistantMsg)

          if (llmOutput.turnText) {
            stream.push({
              type: 'chat:final',
              runId,
              sessionKey,
              message: assistantMsg,
              text: llmOutput.turnText,
              usage: llmOutput.usage
            })
          }

          hasMoreToolCalls = llmOutput.toolCalls.length > 0

          // 核心内层循环结束条件
          if (!hasMoreToolCalls) {
            finalText = llmOutput.turnText
            stream.push({ type: 'agent:turn-end', runId, sessionKey, turn: turns })
            pendingMessages = await getSteeringMessages()
            continue
          }

          // 4. 执行工具调用
          const toolResults = await executeToolCalls(
            llmOutput.toolCalls,
            toolsForRun,
            toolCtx,
            runId,
            sessionKey,
            stream,
            metrics
          )

          // 5. 保存工具执行结果
          for (const res of toolResults) {
            await appendMessage(sessionKey, res)
            currentMessages.push(res)
          }

          stream.push({ type: 'agent:turn-end', runId, sessionKey, turn: turns })

          // 检查 Steering（如工具执行过程中产生的反馈或干预）
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

      // ========== 结束前记录性能与用量 ==========
      const performance = metrics.getPerformance()
      const finalUsage = metrics.accumulatedUsage

      if (recordUsage) {
        await recordUsage({
          runId,
          sessionKey,
          agentId,
          model: modelDef.id,
          timestamp: Date.now(),
          usage: finalUsage,
          performance
        })
      }

      stream.push({
        type: 'agent:run-end',
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
    } catch (err) {
      stream.push({ type: 'agent:run-error', runId, sessionKey, error: describeError(err) })
      stream.end({
        finalText,
        turns,
        totalToolCalls: metrics.totalToolCalls,
        messages: currentMessages,
        usage: metrics.accumulatedUsage
      })
    }
  })()

  return stream
}
