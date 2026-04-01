/**
 * 桥接处理器 (The Bridge)
 * 将引擎原子性的 MiniAgentEvent 转换为业务级的 ChatPayload。
 */

import { normalizeMessage } from '@shared/utils/message'
import type { ChatPayload, ChatAction, TaggedEvent, EventOf } from '@shared/types/gateway'

const STATE_MAP: Record<string, ChatAction> = {
  'agent:run-end': 'chat:final',
  'agent:run-error': 'chat:error'
}

function toChatState(type: string): ChatAction {
  return (STATE_MAP[type] ?? type) as ChatAction
}

/** 将 TaggedEvent 映射为 ChatPayload 业务载荷 */
export function mapEventToChatFields(event: TaggedEvent): Partial<ChatPayload> | null {
  const state = toChatState(event.type)
  const base: Partial<ChatPayload> = { state }

  // 公共字段先期提取
  const ev = event as Record<string, unknown>
  if ('delta' in ev) base.delta = ev.delta as string
  if ('messageId' in ev) base.messageId = ev.messageId as string
  if ('message' in ev) {
    const msg = ev.message as { id?: string }
    base.message = normalizeMessage(ev.message)
    base.messageId = base.messageId || msg?.id
  }

  switch (event.type) {
    case 'chat:final': {
      const e = event as EventOf<'chat:final'>
      return { ...base, performance: e.performance, usage: e.usage, text: e.text }
    }
    case 'agent:run-end': {
      const e = event as EventOf<'agent:run-end'>
      const lastMsg = e.messages[e.messages.length - 1]
      return {
        state,
        message: normalizeMessage(lastMsg),
        messageId: lastMsg?.id,
        performance: e.performance,
        usage: e.usage
      }
    }
    case 'agent:run-error': {
      const e = event as EventOf<'agent:run-error'>
      return { state, error: e.error }
    }
    case 'chat:toolCall': {
      const e = event as EventOf<'chat:toolCall'>
      return {
        state,
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        arguments: e.arguments,
        messageId: e.messageId
      }
    }
    case 'chat:toolResult': {
      const e = event as EventOf<'chat:toolResult'>
      return {
        state,
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        isError: e.isError,
        content: e.content,
        messageId: e.messageId
      }
    }
    case 'chat:retrying': {
      const e = event as EventOf<'chat:retrying'>
      return { ...base, delta: `[Retry] Attempt ${e.attempt} (delay ${e.delay}ms): ${e.error}` }
    }
    case 'chat:interaction': {
      const e = event as EventOf<'chat:interaction'>
      return {
        state,
        interactionId: e.interactionId,
        prompt: e.prompt,
        options: e.options,
        isComplete: e.isComplete,
        rememberKey: e.rememberKey
      }
    }
    case 'chat:interaction-responded': {
      const e = event as EventOf<'chat:interaction-responded'>
      return {
        state,
        interactionId: e.interactionId,
        result: e.result,
        remember: e.remember,
        prompt: ''
      }
    }
    case 'agent:run-start': {
      const e = event as EventOf<'agent:run-start'>
      return { state, model: e.model }
    }
    case 'agent:skill-triggered': {
      const e = event as EventOf<'agent:skill-triggered'>
      return { state, skillName: e.skillName }
    }
    case 'agent:context-overflow': {
      const e = event as EventOf<'agent:context-overflow'>
      return { state, error: e.error }
    }
    default:
      return base.delta || base.message || base.error ? base : null
  }
}
