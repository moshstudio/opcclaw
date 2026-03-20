import type { MiniAgentEvent } from '../../agent/agent-events.js'
import type { ChatPayload } from '@shared/types/gateway.js'

/**
 * 将 MiniAgentEvent 转换为 ChatPayload 的部分字段 (不含 agentId/sessionKey/runId)
 *
 * 用于在全局广播器中处理自发性的智能体回复（如子代理回馈触发的后续动作）
 */
export function mapEventToChatFields(event: MiniAgentEvent): Partial<ChatPayload> | null {
  switch (event.type) {
    case 'chat:user-message':
      return { state: 'user_message', message: event.message }

    case 'chat:start':
      return { state: 'start', message: event.message }

    case 'chat:delta':
      return { state: 'delta', delta: event.delta }

    case 'chat:thinking':
      return { state: 'thinking', delta: event.delta }

    case 'chat:final':
      return {
        state: 'final',
        delta: event.text,
        message: event.message,
        usage: event.usage
      }

    case 'agent:run-end':
      return {
        state: 'final',
        usage: event.usage,
        performance: event.performance
      }

    case 'agent:run-error':
      return { state: 'error', error: event.error }

    case 'chat:tool-call':
      return {
        state: 'tool_call',
        toolCall: { id: event.toolCallId, name: event.toolName, args: event.args }
      }

    case 'chat:tool-result':
      return {
        state: 'tool_result',
        toolResult: { id: event.toolCallId, result: event.result, isError: event.isError }
      }

    case 'chat:planning':
      return {
        state: 'planning',
        delta: `Agent is planning next steps (pending: ${event.pendingCount})...`
      }

    case 'chat:retrying':
      return {
        state: 'retrying',
        error: `Retrying (attempt ${event.attempt}/${event.delay}ms): ${event.error}`
      }

    case 'chat:notice':
      return {
        state: 'notice',
        delta: `History condensed: dropped ${event.droppedMessages} messages, kept ${event.summaryChars} chars summary.`
      }

    case 'chat:subagent-feedback':
      return {
        state: 'subagent_feedback',
        subagent: {
          task: event.task,
          summary: event.summary,
          label: event.label,
          childSessionKey: event.childSessionKey
        }
      }

    case 'chat:subagent-error':
      return {
        state: 'subagent_feedback',
        subagent: {
          task: event.task,
          error: event.error,
          label: event.label,
          childSessionKey: event.childSessionKey
        }
      }

    default:
      return null
  }
}
