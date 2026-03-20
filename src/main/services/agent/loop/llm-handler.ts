import type {
  StreamFunction,
  Model,
  Context as PiContext,
  SimpleStreamOptions,
  Usage,
  ThinkingLevel
} from '@mariozechner/pi-ai'
import type { EventStream } from '@mariozechner/pi-ai'
import type { ContentBlock } from '@main/services/session/session'
import type { MiniAgentEvent, MiniAgentResult } from '../agent-events'
import { retryAsync, describeError, isRateLimitError } from '@main/services/provider/errors.js'
import { abortable } from '@main/services/tools/abort'
import type { MetricsTracker } from './metrics'

export interface ExecuteLlmParams {
  runId: string
  sessionKey: string
  modelDef: Model<any>
  streamFn: StreamFunction
  apiKey?: string
  temperature?: number
  maxTokens?: number
  reasoning?: ThinkingLevel
  abortSignal: AbortSignal
}

export interface LlmResult {
  assistantContent: ContentBlock[]
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[]
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
    runId,
    sessionKey,
    modelDef,
    streamFn,
    apiKey,
    temperature,
    maxTokens,
    reasoning,
    abortSignal
  } = params

  const assistantContent: ContentBlock[] = []
  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = []
  const turnTextParts: string[] = []
  let lastUsage: Usage | undefined

  await retryAsync(
    async () => {
      assistantContent.length = 0
      toolCalls.length = 0
      turnTextParts.length = 0

      const streamOpts: SimpleStreamOptions = {
        maxTokens: maxTokens ?? modelDef.maxTokens,
        signal: abortSignal,
        apiKey,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(reasoning ? { reasoning } : {})
      }
      const eventStream = streamFn(modelDef, piContext, streamOpts)

      let accumulatedThinking = ''
      for await (const event of eventStream) {
        if (abortSignal.aborted) break

        switch (event.type) {
          case 'thinking_delta':
            accumulatedThinking += event.delta
            stream.push({ type: 'chat:thinking', runId, sessionKey, delta: event.delta })
            break

          case 'thinking_end':
            if (accumulatedThinking) {
              const contentIdx = event.contentIndex
              const block = event.partial.content[contentIdx]
              const signature = block?.type === 'thinking' ? block.thinkingSignature : undefined
              assistantContent.push({
                type: 'thinking',
                text: accumulatedThinking,
                thinking_signature: signature
              })
            }
            break

          case 'text_delta':
            metrics.onFirstToken()
            stream.push({ type: 'chat:delta', runId, sessionKey, delta: event.delta })
            break

          case 'text_end':
            turnTextParts.push(event.content)
            assistantContent.push({ type: 'text', text: event.content })
            break

          case 'done':
            lastUsage = event.message.usage
            metrics.recordUsage(lastUsage)
            break

          case 'toolcall_end': {
            const tc = event.toolCall
            const tcArgs = tc.arguments as Record<string, unknown>
            assistantContent.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tcArgs
            })
            toolCalls.push({
              id: tc.id,
              name: tc.name,
              input: tcArgs
            })
            break
          }

          case 'error': {
            const errObj = (event as any).error
            const errMsg =
              errObj?.errorMessage ??
              (errObj instanceof Error ? errObj.message : null) ??
              'unknown stream error'
            throw new Error(`LLM stream error: ${errMsg}`)
          }
        }
      }

      const result = eventStream.result()
      await abortable(result, abortSignal)
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
          runId,
          sessionKey,
          attempt,
          delay,
          error: describeError(error)
        })
      }
    }
  )

  return {
    assistantContent,
    toolCalls,
    turnText: turnTextParts.join(''),
    usage: lastUsage
  }
}
