import {
  Message,
  AssistantMessage,
  ChatStatus,
  AgentTextBlock,
  AgentThinkingBlock,
  AgentToolCallBlock,
  ToolResultMessage
} from '@shared/types/agent'
import { ChatPayload, ChatState as GatewayChatState } from '@shared/types/gateway'

import { normalizeMessage } from '@shared/utils/message.js'

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
  toolResults: Record<string, unknown> // id -> content
}

/** 协议状态到 UI 状态的精确映射 */
const STATUS_MAP: Record<GatewayChatState, ChatStatus> = {
  start: 'waiting',
  userMessage: 'idle',
  thinking: 'thinking',
  retrying: 'retrying',
  delta: 'streaming',
  toolCall: 'toolCalling',
  toolResult: 'toolExecuting',
  notice: 'streaming',
  final: 'completed',
  error: 'error'
}

// ============================================================================
// 2. Atomic Utilities
// ============================================================================

/** 确定 Assistant 消息槽位 */
export const ensureAssistantSlot = (messages: Message[], runId?: string): AssistantMessage => {
  if (runId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as AssistantMessage & { _isFinished?: boolean }
      if ((m.runId === runId || m.id === runId) && m.role === 'assistant') {
        if (!m._isFinished) return m
        break // 若已结束，跳出循环去创建一个新的
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') break
    if (m.role === 'assistant') {
      const asst = m as AssistantMessage & { _isFinished?: boolean }
      if (!asst._isFinished && (!runId || !asst.runId || asst.runId === runId)) return asst
      // 若该助手消息已结束但不是我们要找的，跳出
    }
  }

  const newMsg = normalizeMessage({
    id: runId || `asst_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    role: 'assistant',
    runId,
    content: []
  }) as AssistantMessage

  messages.push(newMsg)
  return newMsg
}

/** 历史消息解析与类型归一化 */
export const mapHistoryMessage = (m: Record<string, unknown>): Message => normalizeMessage(m)

/** 向内容块追加增量内容 */
const appendDelta = (
  msg: AssistantMessage,
  type: 'text' | 'thinking',
  text: string | undefined
) => {
  if (text === undefined) return
  const content = msg.content

  const last = content[content.length - 1]
  if (last && last.type === type) {
    if (last.type === 'text') last.text = (last.text || '') + text
    else if (last.type === 'thinking') last.thinking = (last.thinking || '') + text
  } else {
    content.push(
      type === 'thinking'
        ? ({ type: 'thinking', thinking: text } as AgentThinkingBlock)
        : ({ type: 'text', text: text } as AgentTextBlock)
    )
  }
}

// ============================================================================
// 3. Sub-Handlers (Logic per State)
// ============================================================================

const ChatSubHandlers: Record<
  GatewayChatState,
  (payload: ChatPayload, messages: Message[], patch: SessionPatch) => void
> = {
  userMessage: (p, msgs) => {
    if (p.message && !msgs.some((m) => m.id === p.message?.id)) {
      msgs.push({ ...p.message, timestamp: p.message.timestamp || Date.now() })
    }
  },

  start: (p, msgs) => {
    if (p.message) {
      const msg = ensureAssistantSlot(msgs, p.runId)
      const { id: _id, content: _c, ...rest } = p.message as AssistantMessage
      Object.assign(msg, rest)
    }
  },

  delta: (p, msgs) => appendDelta(ensureAssistantSlot(msgs, p.runId), 'text', p.delta),
  thinking: (p, msgs) => appendDelta(ensureAssistantSlot(msgs, p.runId), 'thinking', p.delta),
  retrying: (p, msgs) => appendDelta(ensureAssistantSlot(msgs, p.runId), 'thinking', p.delta),

  toolCall: (p, msgs) => {
    if (!p.toolCall) return
    const msg = ensureAssistantSlot(msgs, p.runId)
    msg.content.push({ type: 'toolCall', ...p.toolCall } as AgentToolCallBlock)
  },

  toolResult: (p, msgs, patch) => {
    if (!p.toolResult) return
    const tr = p.toolResult
    patch.toolResults[tr.toolCallId] = tr.content

    msgs.push({
      id: `tr_${tr.toolCallId}_${Date.now()}`,
      role: 'toolResult',
      runId: p.runId,
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      isError: tr.isError,
      content: Array.isArray(tr.content)
        ? tr.content
        : [{ type: 'text', text: String(tr.content) }],
      timestamp: Date.now()
    } as ToolResultMessage)
  },

  final: (p, msgs) => {
    const msg = ensureAssistantSlot(msgs, p.runId) as AssistantMessage & { _isFinished?: boolean }
    if (p.message) {
      const { id: _id, content: _c, ...rest } = p.message as AssistantMessage
      Object.assign(msg, {
        ...rest,
        performance: p.performance || rest.performance || msg.performance
      })
    } else if (p.performance) {
      msg.performance = p.performance
    }
    msg._isFinished = true
  },

  notice: (p, msgs) => {
    if (p.firstKeptEntryId) {
      const idx = msgs.findIndex((m) => m.id === p.firstKeptEntryId)
      if (idx !== -1) msgs.splice(0, idx)
    }
  },

  error: () => {}
}

// ============================================================================
// 4. Main Event Processing
// ============================================================================

export const applyChatEvent = (payload: ChatPayload, patch: SessionPatch): SessionPatch => {
  const { messages, status: currentStatus, toolResults } = patch
  let nextStatus = currentStatus
  let nextError = patch.errorMessage ?? null

  if (STATUS_MAP[payload.state]) {
    const isUserMsgInterrupt =
      payload.state === 'userMessage' &&
      !['idle', 'completed', 'error', 'aborted'].includes(currentStatus)
    if (!isUserMsgInterrupt) nextStatus = STATUS_MAP[payload.state]
  }

  ChatSubHandlers[payload.state]?.(payload, messages, patch)

  if (payload.state === 'error') {
    const isAbort = String(payload.error).toLowerCase().includes('abort')
    nextStatus = isAbort ? 'aborted' : 'error'
    nextError = isAbort
      ? null
      : String(payload.error).startsWith('Error:')
        ? String(payload.error)
        : `Error: ${payload.error}`
  }

  return {
    messages: [...messages],
    status: nextStatus,
    errorMessage: nextError,
    toolResults: { ...toolResults }
  }
}
