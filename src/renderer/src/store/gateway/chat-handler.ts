import { Message, AssistantMessage, ChatStatus, ToolResultMessage } from '@shared/types/agent'
import { ChatPayload, ChatState as GatewayChatState } from '@shared/types/gateway'
import { normalizeMessage } from '@shared/utils/message'

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
  interaction?: ChatPayload['interaction'] | null
}

/** 协议状态到 UI 状态的精确映射 */
const STATUS_MAP: Partial<Record<GatewayChatState, ChatStatus>> = {
  start: 'waiting',
  userMessage: 'idle',
  thinking: 'thinking',
  retrying: 'retrying',
  delta: 'streaming',
  toolCall: 'toolCalling',
  toolResult: 'toolExecuting',
  notice: 'streaming',
  interaction: 'waiting',
  final: 'completed',
  error: 'error'
}

// ============================================================================
// 2. Atomic Utilities
// ============================================================================

/** 历史消息解析与类型归一化 */
export const mapHistoryMessage = (m: Record<string, unknown>): Message => normalizeMessage(m)

/** 寻找指定运行中最后一条匹配类型的 Assistant 消息 */
const findLastSequenceMessage = (
  messages: Message[],
  runId: string | undefined,
  contentType: 'text' | 'thinking'
): AssistantMessage | null => {
  const last = messages[messages.length - 1]
  if (
    last?.role === 'assistant' &&
    (!runId || last.runId === runId) &&
    last.content.length > 0 &&
    last.content[last.content.length - 1].type === contentType
  ) {
    return last as AssistantMessage
  }
  return null
}

// ============================================================================
// 3. Sub-Handlers (Logic per State)
// ============================================================================

type SubHandler = (payload: ChatPayload, messages: Message[], patch: SessionPatch) => void

const ChatSubHandlers: Partial<Record<GatewayChatState, SubHandler>> = {
  userMessage: (p, msgs) => {
    if (p.message && !msgs.some((m) => m.id === p.message?.id)) {
      msgs.push(normalizeMessage({ ...p.message, timestamp: p.message.timestamp || Date.now() }))
    }
  },

  start: (p, msgs) => {
    // 启动时不一定有消息，但如果带了消息包，作为该次运行的基础
    if (p.message) {
      msgs.push(normalizeMessage({ ...p.message, runId: p.runId }))
    }
  },

  thinking: (p, msgs) => {
    const text = p.delta || ''
    const existing = findLastSequenceMessage(msgs, p.runId, 'thinking')
    if (existing) {
      const lastBlock = existing.content[existing.content.length - 1] as any
      lastBlock.thinking = (lastBlock.thinking || '') + text
    } else {
      msgs.push(
        normalizeMessage({
          role: 'assistant',
          runId: p.runId,
          content: [{ type: 'thinking', thinking: text }]
        })
      )
    }
  },

  delta: (p, msgs) => {
    const text = p.delta || ''
    const existing = findLastSequenceMessage(msgs, p.runId, 'text')
    if (existing) {
      const lastBlock = existing.content[existing.content.length - 1] as any
      lastBlock.text = (lastBlock.text || '') + text
    } else {
      msgs.push(
        normalizeMessage({
          role: 'assistant',
          runId: p.runId,
          content: [{ type: 'text', text }]
        })
      )
    }
  },

  retrying: (p, msgs, patch) => {
    // 重试通常可以视为一种特殊的 thinking 片段
    ChatSubHandlers.thinking?.(p, msgs, patch)
  },

  toolCall: (p, msgs) => {
    if (p.toolCall) {
      msgs.push(
        normalizeMessage({
          role: 'assistant',
          runId: p.runId,
          content: [{ type: 'toolCall', ...p.toolCall }]
        })
      )
    }
  },

  toolResult: (p, msgs, patch) => {
    if (!p.toolResult) return
    const { toolCallId, content, toolName, isError } = p.toolResult
    patch.toolResults[toolCallId] = content

    const resultMsg = normalizeMessage({
      role: 'toolResult',
      runId: p.runId,
      toolCallId,
      toolName,
      isError,
      content: Array.isArray(content) ? content : [{ type: 'text', text: String(content) }],
      timestamp: Date.now()
    }) as ToolResultMessage

    // 搜索 toolCall 所在的消息位置（按商用标准，从后往前查找同 runId 下的对应 call）
    const callIdx = msgs.findLastIndex(
      (m) =>
        m.role === 'assistant' &&
        (!p.runId || m.runId === p.runId) &&
        m.content.some((c) => c.type === 'toolCall' && c.id === toolCallId)
    )

    if (callIdx !== -1) {
      // 插入到 toolCall 消息的下一条
      msgs.splice(callIdx + 1, 0, resultMsg)
    } else {
      msgs.push(resultMsg)
    }
  },

  final: (p, msgs) => {
    // 运行结束，将 performance 指标附加到该运行产生的最后一条 Assistant 消息上
    const lastAsst = msgs.findLast(
      (m) => m.role === 'assistant' && (!p.runId || m.runId === p.runId)
    ) as any
    if (lastAsst) {
      if (p.performance) lastAsst.performance = p.performance
      if (p.message) {
        const { id, content, ...rest } = p.message as AssistantMessage
        Object.assign(lastAsst, rest)
      }
      lastAsst._isFinished = true
    }
  },

  notice: (p, msgs) => {
    if (p.firstKeptEntryId) {
      const idx = msgs.findIndex((m) => m.id === p.firstKeptEntryId)
      if (idx !== -1) msgs.splice(0, idx)
    }
  },

  interaction: (p, _msgs, patch) => {
    if (p.interaction) {
      patch.interaction = p.interaction
    }
  }
}

// ============================================================================
// 4. Main Event Processing
// ============================================================================

export const applyChatEvent = (payload: ChatPayload, patch: SessionPatch): SessionPatch => {
  // 直接忽略 notice 事件，不触发任何引用变化
  if ((payload.state as string) === 'notice') return patch

  const { messages, status: currentStatus, toolResults, errorMessage, interaction } = patch
  let nextStatus = currentStatus
  let nextError = errorMessage ?? null
  let nextInteraction = interaction ?? null

  // 1. 状态映射逻辑
  const mappedStatus = STATUS_MAP[payload.state]
  if (mappedStatus) {
    const isUserMsgInterrupt =
      payload.state === 'userMessage' &&
      !['idle', 'completed', 'error', 'aborted'].includes(currentStatus)
    if (!isUserMsgInterrupt) nextStatus = mappedStatus
  }

  // 2. 消息处理
  ChatSubHandlers[payload.state]?.(payload, messages, patch)

  // 3. 错误状态处理
  if (payload.state === 'error') {
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
    interaction: nextInteraction
  }
}
