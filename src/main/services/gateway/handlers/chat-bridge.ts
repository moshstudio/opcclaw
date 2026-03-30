import { normalizeMessage } from '../../../../shared/utils/message'
import type { MiniAgentEvent } from '../../agent/agent-events'
import type { ChatPayload, ChatState } from '@shared/types/gateway'

const STATE_MAP: Record<string, ChatState> = {
  'agent:run-end': 'final',
  'agent:run-error': 'error'
}

/** 转换事件类型前缀为网关状态名 */
function toChatState(type: string): ChatState {
  if (STATE_MAP[type]) return STATE_MAP[type]
  return (type.startsWith('chat:') ? type.substring(5) : type.split(':')[1] || type) as ChatState
}

/** 将 MiniAgentEvent 映射为 ChatPayload 字段 */
export function mapEventToChatFields(event: MiniAgentEvent): Partial<ChatPayload> | null {
  const state = toChatState(event.type)
  const base: Partial<ChatPayload> = { state }

  // 1. 提取通用字段: delta, messageId
  if ('delta' in event) base.delta = event.delta
  if ('text' in event) base.delta = event.text
  if ('messageId' in event) base.messageId = event.messageId
  if ('message' in event) {
    base.message = normalizeMessage(event.message)
    base.messageId = base.messageId || event.message.id
  }

  // 2. 针对特定状态补全私有对象
  switch (event.type) {
    case 'chat:userMessage':
    case 'chat:start':
    case 'chat:delta':
    case 'chat:thinking':
      return base

    case 'chat:final':
      return { ...base, performance: (event as any).performance }

    case 'agent:run-end': {
      const lastMsg = event.messages[event.messages.length - 1]
      return {
        state,
        message: normalizeMessage(lastMsg),
        messageId: lastMsg?.id,
        performance: event.performance
      }
    }

    case 'agent:run-error':
      return { state, error: (event as any).error }

    case 'chat:toolCall':
      return {
        ...base,
        toolCall: { id: event.toolCallId, name: event.toolName, arguments: event.arguments }
      }

    case 'chat:toolResult':
      return {
        ...base,
        toolResult: {
          messageId: event.messageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          content: Array.isArray(event.content)
            ? event.content
            : [{ type: 'text', text: String(event.content) }]
        }
      }

    case 'chat:retrying':
      return {
        ...base,
        delta: `[Retry] Attempt ${(event as any).attempt} (delay ${
          (event as any).delay
        }ms): ${(event as any).error}`
      }

    case 'chat:interaction':
      return {
        state,
        interaction: {
          interactionId: event.interactionId,
          prompt: event.prompt,
          options: event.options,
          isComplete: event.isComplete,
          rememberKey: event.rememberKey
        }
      }

    default:
      return null
  }
}
