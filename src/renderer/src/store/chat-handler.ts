import { Message, ChatStatus } from '@shared/types/agent'
import { ChatPayload, AgentEventPayload } from '@shared/types/gateway'

// ============================================================================
// 1. Types & Constants
// ============================================================================

/** 状态自动重置延迟时间 */
export const RESET_TIMEOUT = {
  SUCCESS: 800,
  ERROR: 1500,
  ABORT: 500,
  SEND_ERROR: 3000
} as const

export interface SessionPatch {
  messages: Message[]
  status: ChatStatus
  errorMessage?: string | null
}

const STATUS_MAP: Record<string, ChatStatus> = {
  start: 'waiting',
  user_message: 'idle',
  thinking: 'thinking',
  planning: 'planning',
  retrying: 'retrying',
  delta: 'streaming',
  tool_call: 'tool_executing',
  tool_result: 'streaming',
  notice: 'streaming',
  subagent_feedback: 'streaming',
  final: 'completed',
  error: 'error'
}

// ============================================================================
// 2. Atomic Utilities
// ============================================================================

/** 确定 Assistant 消息槽位 (若不存在则创建) */
export const ensureAssistantSlot = (messages: Message[], runId?: string): Message => {
  const lastMsg = messages[messages.length - 1]
  const isMatch =
    lastMsg?.role === 'assistant' && (!runId || lastMsg.runId === runId || lastMsg.id === runId)

  if (isMatch) return lastMsg

  const newMsg: Message = {
    id: runId && !messages.some((m) => m.id === runId) ? runId : `asst_${Date.now()}`,
    role: 'assistant',
    runId,
    content: [],
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  messages.push(newMsg)
  return newMsg
}

const appendDelta = (msg: Message, type: 'text' | 'thinking', text?: string) => {
  if (!text) return
  if (!Array.isArray(msg.content)) msg.content = []

  const last = msg.content[msg.content.length - 1]
  if (last?.type === type) {
    last.text = (last.text || '') + text
  } else {
    msg.content.push({ type, text })
  }
}

export const mapHistoryMessage = (m: any): Message => ({
  id: m.id || `hist_${Math.random().toString(36).slice(2, 9)}`,
  role: (m.role || 'user') as Message['role'],
  content: m.content || m.text || '',
  runId: m.runId,
  timestamp: m.timestamp
    ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
})

// ============================================================================
// 3. Sub-Handlers (Logic per State)
// ============================================================================

const ChatSubHandlers: Record<string, (payload: ChatPayload, messages: Message[]) => void> = {
  user_message: (p, msgs) => {
    if (p.message && !msgs.some((m) => m.id === p.message?.id)) msgs.push(p.message)
  },

  start: (p, msgs) => {
    if (p.delta || p.message || p.toolCall) {
      const msg = ensureAssistantSlot(msgs, p.runId)
      if (p.message) msg.content = p.message.content
    }
  },

  thinking: (p, msgs) => appendDelta(ensureAssistantSlot(msgs, p.runId), 'thinking', p.delta),
  delta: (p, msgs) => appendDelta(ensureAssistantSlot(msgs, p.runId), 'text', p.delta),

  tool_call: (p, msgs) => {
    if (!p.toolCall) return
    const msg = ensureAssistantSlot(msgs, p.runId)
    if (!Array.isArray(msg.content)) msg.content = []
    if (!msg.content.some((c) => c.type === 'tool_use' && c.id === p.toolCall!.id)) {
      msg.content.push({
        type: 'tool_use',
        id: p.toolCall.id,
        name: p.toolCall.name,
        input: p.toolCall.args
      })
    }
  },

  tool_result: (p, msgs) => {
    if (!p.toolResult) return
    msgs.push({
      id: `tr_${p.toolResult.id}_${Date.now()}`,
      role: 'user',
      runId: p.runId,
      content: [
        { type: 'tool_result', tool_use_id: p.toolResult.id, content: p.toolResult.result }
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  },

  final: (p, msgs) => {
    if (p.delta || p.usage || p.performance || p.message) {
      const msg = ensureAssistantSlot(msgs, p.runId)
      if (p.delta) appendDelta(msg, 'text', p.delta)
      if (p.message) msg.content = p.message.content
      if (p.usage) p.performance ? (msg.totalUsage = p.usage) : (msg.usage = p.usage)
      if (p.performance) msg.performance = p.performance
    }
  },

  notice: (p, msgs) => {
    if (p.firstKeptEntryId) {
      const idx = msgs.findIndex((m) => m.id === p.firstKeptEntryId)
      if (idx !== -1) msgs.splice(0, idx)
    }
  }
}

// ============================================================================
// 4. Main Event Processing
// ============================================================================

export const applyChatEvent = (
  eventType: 'chat' | 'agent',
  payload: ChatPayload | AgentEventPayload,
  patch: SessionPatch
): SessionPatch => {
  const { messages, status: currentStatus } = patch
  let nextStatus = currentStatus
  let nextError = patch.errorMessage ?? null

  // 1. Agent 核心状态路由
  if (eventType === 'agent') {
    const p = payload as AgentEventPayload
    if (p.type === 'agent:run-start') nextStatus = 'waiting'
    if (p.type === 'session:reset') return { messages: [], status: 'idle', errorMessage: null }
  }

  // 2. Chat 交互流处理
  if (eventType === 'chat') {
    const p = payload as ChatPayload

    // 状态更新映射
    if (STATUS_MAP[p.state]) {
      const isUserMsgInterrupt =
        p.state === 'user_message' &&
        !['idle', 'completed', 'error', 'aborted'].includes(currentStatus)
      if (!isUserMsgInterrupt) nextStatus = STATUS_MAP[p.state]
    }

    // 幂等性检查 (避免重复 Chunk)
    const runId = p.runId
    if (p.chunkId && runId) {
      const lastAsst = messages[messages.length - 1]
      if (lastAsst?.runId === runId && lastAsst.lastChunkId === p.chunkId) return patch
    }

    // 执行子状态处理器
    ChatSubHandlers[p.state]?.(p, messages)

    // 更新最后一次处理的 ID 用于幂等
    if (p.chunkId && runId) {
      const msg = ensureAssistantSlot(messages, runId)
      msg.lastChunkId = p.chunkId
    }

    // 错误处理
    if (p.state === 'error') {
      const isAbort = String(p.error).toLowerCase().includes('abort')
      nextStatus = isAbort ? 'aborted' : 'error'
      nextError = isAbort
        ? null
        : String(p.error).startsWith('Error:')
          ? String(p.error)
          : `Error: ${p.error}`
    }

    if (['idle', 'streaming', 'thinking', 'tool_executing'].includes(nextStatus)) {
      nextError = null
    }
  }

  return { messages: [...messages], status: nextStatus, errorMessage: nextError }
}

// ============================================================================
// 5. Integration Factory (for Zustand)
// ============================================================================

export const createChatEventHandler = (set: any, get: any, updateState: any) => {
  return (payload: any, eventType: 'chat' | 'agent') => {
    const { sessionKey: sk } = payload
    if (!sk) return

    set((s: any) => {
      const currentPatch: SessionPatch = {
        messages: [...(s.sessions[sk] || [])],
        status: s.chatStatuses[sk] || 'idle',
        errorMessage: s.errorMessages[sk]
      }

      const next = applyChatEvent(eventType, payload, currentPatch)

      return {
        sessions: { ...s.sessions, [sk]: next.messages },
        chatStatuses: { ...s.chatStatuses, [sk]: next.status },
        errorMessages: { ...s.errorMessages, [sk]: next.errorMessage }
      }
    })

    // 副作用处理 (状态机延迟重置)
    if (eventType === 'chat') {
      const p = payload as ChatPayload
      if (p.state === 'final' && p.performance) {
        setTimeout(
          () =>
            get().chatStatuses[sk] === 'completed' && updateState(set, 'chatStatuses', sk, 'idle'),
          RESET_TIMEOUT.SUCCESS
        )
      } else if (p.state === 'error') {
        setTimeout(
          () => get().chatStatuses[sk] === 'error' && updateState(set, 'chatStatuses', sk, 'idle'),
          RESET_TIMEOUT.ERROR
        )
      }
    }
  }
}
