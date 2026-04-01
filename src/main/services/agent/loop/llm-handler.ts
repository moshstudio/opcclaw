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

import type { MiniAgentEvent, MiniAgentResult } from '../agent-events'
import { retryAsync, describeError, isRateLimitError } from '@main/services/provider/errors'
import { abortable } from '@main/services/tools/abort'
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
        if (abortSignal.aborted) break

        switch (event.type) {
          case 'thinking_delta':
            stream.push({
              type: 'chat:thinking',
              agentId,
              runId,
              sessionKey,
              delta: event.delta,
              messageId
            })
            break

          case 'text_delta':
            metrics.onFirstToken()
            stream.push({
              type: 'chat:delta',
              agentId,
              runId,
              sessionKey,
              delta: event.delta,
              messageId
            })
            break

          case 'toolcall_end':
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

      const result = eventStream.result()
      await abortable(result, abortSignal)
    },
    // ... retry config ...
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

  if (!finalMessage) {
    throw new Error('LLM call finished without producing a message')
  }

  // 提取文本内容供 UI 实时更新（不含思考过程和工具调用）
  const turnText = finalMessage.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('')

  const toolCalls = finalMessage.content.filter((c): c is ToolCall => c.type === 'toolCall')

  return {
    assistantMessage: finalMessage,
    toolCalls,
    turnText,
    usage: lastUsage
  }
}
