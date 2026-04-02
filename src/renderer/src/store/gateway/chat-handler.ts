import { Message, AssistantMessage, ChatStatus, ToolResultMessage } from '@shared/types/agent'
import { ChatPayload, ChatAction, ChatPayloadFlat } from '@shared/types/gateway'
import { normalizeMessage, normalizeContentBlock } from '@shared/utils/message'

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
  toolResults: Record<string, unknown>
  interaction?: {
    interactionId: string
    prompt: string
    options?: string[]
    isComplete?: boolean
    rememberKey?: string
  } | null
}

/** 协议状态到 UI 状态的精确映射 */
const STATUS_MAP: Partial<Record<ChatAction, ChatStatus>> = {
  'chat:start': 'waiting',
  'chat:userMessage': 'streaming',
  'chat:thinking': 'thinking',
  'chat:retrying': 'retrying',
  'chat:delta': 'streaming',
  'chat:toolCall': 'toolCalling',
  'chat:toolResult': 'streaming',
  'chat:interaction': 'waiting',
  'chat:final': 'completed',
  'chat:error': 'error',
  'chat:interaction-responded': 'waiting',
  'agent:run-start': 'waiting',
  'agent:run-end': 'completed',
  'agent:run-error': 'error',
  'agent:context-overflow': 'error',
  'agent:skill-triggered': 'waiting'
}

// ============================================================================
// 2. Atomic Utilities
// ============================================================================

// ============================================================================
// 2. Atomic Utilities
// ============================================================================

/** 历史消息解析与类型归一化 */
export const mapHistoryMessage = (m: Record<string, unknown>): Message => normalizeMessage(m)

/** 查找或创建一个用于追加内容的 Assistant 消息 (非纯函数，直接操作 msgs 数组) */
function ensureAssistant(p: ChatPayloadFlat, msgs: Message[]): AssistantMessage {
  const target = (p.messageId ? msgs.find((m) => m.id === p.messageId) : undefined) as
    | AssistantMessage
    | undefined

  if (target) return target

  // 如果没找到，创建一个初始占位
  const newMsg = normalizeMessage({
    id: p.messageId,
    role: 'assistant',
    content: []
  }) as AssistantMessage
  msgs.push(newMsg)
  return newMsg
}

// ============================================================================
// 3. Sub-Handlers (Logic per State)
// ============================================================================

type SubHandler = (payload: ChatPayloadFlat, messages: Message[], patch: SessionPatch) => void

const ChatSubHandlers: Partial<Record<ChatAction, SubHandler>> = {
  'chat:userMessage': (p, msgs) => {
    if (p.message && !msgs.some((m) => m.id === p.messageId)) {
      msgs.push(normalizeMessage({ ...p.message, timestamp: p.message.timestamp || Date.now() }))
      msgs.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
    }
  },

  'chat:start': (p, msgs) => {
    if (p.message && !msgs.some((m) => m.id === p.messageId)) {
      msgs.push(normalizeMessage({ ...p.message }))
    }
  },

  'chat:thinking': (p, msgs) => {
    const text = p.delta || ''
    const msg = ensureAssistant(p, msgs)
    const lastBlock = msg.content[msg.content.length - 1]
    if (lastBlock?.type === 'thinking') {
      lastBlock.thinking = (lastBlock.thinking || '') + text
    } else {
      msg.content.push({ type: 'thinking', thinking: text })
    }
  },

  'chat:delta': (p, msgs) => {
    const text = p.delta || ''
    const msg = ensureAssistant(p, msgs)
    const lastBlock = msg.content[msg.content.length - 1]
    if (lastBlock?.type === 'text') {
      lastBlock.text = (lastBlock.text || '') + text
    } else {
      msg.content.push({ type: 'text', text })
    }
  },

  'chat:retrying': (p, msgs, patch) => {
    ChatSubHandlers['chat:thinking']?.(p, msgs, patch)
  },

  'chat:toolCall': (p, msgs) => {
    if (!p.toolCallId) return
    const msg = ensureAssistant(p, msgs)
    msg.content.push({
      type: 'toolCall',
      id: p.toolCallId,
      name: p.toolName ?? '',
      arguments: p.arguments ?? {}
    })
  },

  'chat:toolResult': (p, msgs, patch) => {
    const { toolCallId, content, toolName, isError, messageId } = p
    if (toolCallId) patch.toolResults[toolCallId] = content

    const resultMsg = normalizeMessage({
      id: messageId,
      role: 'toolResult',
      runId: p.runId,
      toolCallId,
      toolName: toolName ?? '',
      isError,
      content: Array.isArray(content) ? content : [{ type: 'text', text: String(content) }],
      timestamp: Date.now()
    }) as ToolResultMessage

    const callIdx = msgs.findLastIndex(
      (m) =>
        m.role === 'assistant' &&
        (!p.runId || m.runId === p.runId) &&
        m.content.some((c) => c.type === 'toolCall' && c.id === toolCallId)
    )
    if (callIdx !== -1) {
      msgs.splice(callIdx + 1, 0, resultMsg)
    } else {
      msgs.push(resultMsg)
    }
  },

  'chat:final': (p, msgs) => {
    const target = (p.messageId ? msgs.find((m) => m.id === p.messageId) : undefined) as
      | AssistantMessage
      | undefined
    if (target) {
      if (p.performance) target.performance = p.performance
      if (p.message) {
        const { content, ...rest } = p.message as AssistantMessage
        Object.assign(target, rest)
        if (content?.length > 0) {
          target.content = content.map(normalizeContentBlock)
        }
      }
      target._isFinished = true
    }
  },

  'chat:interaction': (p, _msgs, patch) => {
    if (p.interactionId)
      patch.interaction = {
        interactionId: p.interactionId,
        prompt: p.prompt ?? '',
        options: p.options,
        isComplete: p.isComplete,
        rememberKey: p.rememberKey
      }
  },

  'chat:interaction-responded': (_p, _msgs, patch) => {
    patch.interaction = null
  }
}

// ============================================================================
// 4. Main Event Processing
// ============================================================================

export const applyChatEvent = (payload: ChatPayload, patch: SessionPatch): SessionPatch => {
  const { messages, status: currentStatus, toolResults, errorMessage } = patch
  let nextStatus = currentStatus
  let nextError = errorMessage ?? null

  // 1. 状态映射逻辑
  const mappedStatus = STATUS_MAP[payload.state]
  if (mappedStatus) {
    const isUserMsgInterrupt =
      payload.state === 'chat:userMessage' &&
      !['idle', 'completed', 'error', 'aborted'].includes(currentStatus)
    if (!isUserMsgInterrupt) nextStatus = mappedStatus
  }

  // 2. 消息处理 (这里断言为 Flat 以便映射表调用)
  const handler = ChatSubHandlers[payload.state] as
    | ((p: ChatPayloadFlat, m: Message[], s: SessionPatch) => void)
    | undefined
  handler?.(payload as any, messages, patch)

  // 3. 错误状态处理
  if (
    payload.state === 'chat:error' ||
    payload.state === 'agent:run-error' ||
    payload.state === 'agent:context-overflow'
  ) {
    const errText = String(payload.error || 'Unknown error')
    const isAbort = errText.toLowerCase().includes('abort')
    nextStatus = isAbort ? 'aborted' : 'error'
    nextError = isAbort ? null : errText.startsWith('Error:') ? errText : `Error: ${errText}`
  }

  return {
    messages: [...messages], // 确保引用变化触发 React 渲染
    status: nextStatus,
    errorMessage: nextError,
    toolResults: { ...toolResults },
    interaction: patch.interaction // 直接从 patch 获取更新后的值
  }
}
