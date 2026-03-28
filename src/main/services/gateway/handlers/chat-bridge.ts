import { normalizeMessage } from '../../../../shared/utils/message'
import type { MiniAgentEvent } from '../../agent/agent-events'
import type { ChatPayload, ChatState } from '@shared/types/gateway'

/**
 * 转换事件类型前缀为网关状态名
 */
function toChatState(type: string): ChatState {
  if (type === 'agent:run-end') return 'final'
  if (type === 'agent:run-error') return 'error'

  // 支持多级状态
  if (type.startsWith('chat:')) {
    return type.substring(5) as ChatState
  }

  // 提取后缀并规范化为状态名
  const state = type.split(':')[1] || type
  return state as ChatState
}

/**
 * 将 MiniAgentEvent 转换为 ChatPayload 的部分字段 (不含 agentId/sessionKey/runId)
 *
 * 用于在全局广播器中处理自发性的智能体回复（如子代理回馈触发的后续动作）
 */
export function mapEventToChatFields(event: MiniAgentEvent): Partial<ChatPayload> | null {
  const state = toChatState(event.type)

  // 1. 基础消息链处理 (Delta/Thinking/Planning)
  const base: Partial<ChatPayload> = { state }
  if ('delta' in event) {
    base.delta = (event as { delta?: string }).delta
  }

  // 2. 状态分发处理
  switch (event.type) {
    case 'chat:userMessage':
    case 'chat:start':
      return { state, message: normalizeMessage(event.message) }

    case 'chat:final':
      return {
        state,
        delta: event.text,
        message: normalizeMessage(event.message),
        performance: event.performance
      }

    case 'agent:run-end':
      return {
        state,
        message: normalizeMessage(event.messages[event.messages.length - 1]),
        performance: event.performance
      }

    case 'agent:run-error':
      return { state, error: event.error }

    case 'chat:toolCall':
      return {
        ...base,
        state,
        toolCall: {
          id: event.toolCallId,
          name: event.toolName,
          arguments: event.arguments
        }
      }

    case 'chat:toolResult':
      return {
        ...base,
        state,
        toolResult: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          content: Array.isArray(event.content)
            ? event.content
            : [{ type: 'text', text: String(event.content) }],
          isError: event.isError
        }
      }

    case 'chat:retrying':
      return {
        state,
        delta: `[Retry] Attempt ${event.attempt} (delay ${event.delay}ms): ${event.error}`
      }

    case 'chat:delta':
    case 'chat:thinking':
      return base

    case 'chat:interaction':
      return {
        state,
        interaction: {
          interactionId: event.interactionId,
          prompt: event.prompt,
          options: event.options,
          isComplete: event.isComplete
        }
      }

    default:
      return null
  }
}
