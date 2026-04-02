import type {
  StreamFunction,
  Model,
  Api,
  Context as PiContext,
  SimpleStreamOptions,
  Usage,
  ThinkingLevel,
  AssistantMessage,
  ToolCall
} from '@mariozechner/pi-ai'
import type { EventStream } from '@mariozechner/pi-ai'

import type { Message } from '@shared/types/agent'
import type { MiniAgentEvent, MiniAgentResult } from '../agent-events'
import { retryAsync, describeError, isRateLimitError } from '@main/services/provider/errors'
import { abortable } from '@main/services/tools/abort'
import { estimateInteractionUsage } from '@main/services/context/tokens'
import type { MetricsTracker } from './metrics'

export interface ExecuteLlmParams {
  agentId: string
  runId: string
  sessionKey: string
  messageId: string
  modelDef: Model<Api>
  streamFn: StreamFunction
  apiKey?: string
  temperature?: number
  maxTokens?: number
  reasoning?: ThinkingLevel
  abortSignal: AbortSignal
}

export interface LlmResult {
  assistantMessage: AssistantMessage
  toolCalls: ToolCall[]
  turnText: string
  usage?: Usage
}

/**
 * 执行带重试的 LLM 会话
 */
export async function executeLlmCall(
  params: ExecuteLlmParams,
  piContext: PiContext,
  stream: EventStream<MiniAgentEvent, MiniAgentResult>,
  metrics: MetricsTracker
): Promise<LlmResult> {
  const {
    agentId,
    runId,
    sessionKey,
    messageId,
    modelDef,
    streamFn,
    apiKey,
    temperature,
    maxTokens,
    reasoning,
    abortSignal
  } = params

  let finalMessage: AssistantMessage | undefined
  let lastUsage: Usage | undefined

  // 用于在中断时保底的增量消息对象
  const partialMessage: AssistantMessage = {
    role: 'assistant',
    content: [],
    timestamp: Date.now(),
    stopReason: 'stop',
    api: modelDef.api,
    provider: modelDef.provider as string,
    model: modelDef.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    }
  }

  await retryAsync(
    async () => {
      const streamOpts: SimpleStreamOptions = {
        maxTokens: maxTokens ?? modelDef.maxTokens,
        signal: abortSignal,
        apiKey,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(reasoning ? { reasoning } : {})
      }
      const eventStream = streamFn(modelDef, piContext, streamOpts)

      for await (const event of eventStream) {
        // 核心改动：如果检测到中断，立即标记状态并跳出，保留现场
        if (abortSignal.aborted) {
          partialMessage.stopReason = 'aborted'
          finalMessage = partialMessage
          break
        }

        switch (event.type) {
          case 'thinking_delta': {
            // 增量累加思考内容
            let lastBlock = partialMessage.content[partialMessage.content.length - 1]
            if (lastBlock?.type === 'thinking') {
              lastBlock.thinking += event.delta
            } else {
              partialMessage.content.push({ type: 'thinking', thinking: event.delta })
            }

            stream.push({
              type: 'chat:thinking',
              agentId,
              runId,
              sessionKey,
              delta: event.delta,
              messageId
            })
            break
          }

          case 'text_delta': {
            metrics.onFirstToken()
            // 增量累加正文内容
            let lastBlock = partialMessage.content[partialMessage.content.length - 1]
            if (lastBlock?.type === 'text') {
              lastBlock.text += event.delta
            } else {
              partialMessage.content.push({ type: 'text', text: event.delta })
            }

            stream.push({
              type: 'chat:delta',
              agentId,
              runId,
              sessionKey,
              delta: event.delta,
              messageId
            })
            break
          }

          case 'toolcall_end': {
            // 记录工具调用
            partialMessage.content.push(event.toolCall)

            stream.push({
              type: 'chat:toolCall',
              agentId,
              runId,
              sessionKey,
              toolCallId: event.toolCall.id,
              toolName: event.toolCall.name,
              arguments: event.toolCall.arguments,
              messageId
            })
            break
          }

          case 'done':
            lastUsage = event.message.usage
            metrics.recordUsage(lastUsage)
            finalMessage = event.message
            break

          case 'error': {
            const errObj = event.error as AssistantMessage
            const errMsg = errObj.errorMessage || 'unknown stream error'
            throw new Error(`LLM stream error: ${errMsg}`)
          }
        }
      }

      // 如果由于某种原因流空了但没收到 done，且没被中止，则尝试从 pi-ai result 中恢复
      if (!finalMessage && !abortSignal.aborted) {
        const result = eventStream.result()
        await abortable(result, abortSignal)
      }
    },
    {
      attempts: 3,
      minDelayMs: 300,
      maxDelayMs: 30_000,
      jitter: 0.1,
      label: 'llm-call',
      shouldRetry: (err) => {
        if (abortSignal.aborted) return false
        return isRateLimitError(describeError(err))
      },
      onRetry: ({ attempt, delay, error }) => {
        stream.push({
          type: 'chat:retrying',
          agentId,
          runId,
          sessionKey,
          attempt,
          delay,
          error: describeError(error),
          messageId
        })
      }
    }
  )

  // 如果依然没有 finalMessage (可能是主动中断)，则使用 partialMessage 回传
  const actualMessage = finalMessage || partialMessage

  // 针对中止或异常情况进行基于本地分词器的 Token 补偿
  if (!lastUsage && actualMessage.content.length > 0) {
    lastUsage = estimateInteractionUsage(piContext, actualMessage as Message)
    actualMessage.usage = lastUsage
    metrics.recordUsage(lastUsage)
  }

  // 极端情况：没有任何实质内容产出且没被中断，才视为错误
  if (actualMessage.content.length === 0 && !abortSignal.aborted) {
    throw new Error('LLM call finished without producing any content')
  }

  // 提取文本内容供 UI 实时更新（不含思考过程和工具调用）
  const turnText = actualMessage.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('')

  const toolCalls = actualMessage.content.filter((c): c is ToolCall => c.type === 'toolCall')

  return {
    assistantMessage: actualMessage,
    toolCalls,
    turnText,
    usage: lastUsage
  }
}
