import { type SessionManager } from './session'
import { type Message, type ToolResultMessage } from '@shared/types/agent'

type ToolCall = { id: string; name?: string }

/**
 * 从 assistant 消息中提取 toolCall 调用
 */
function extractToolCallsFromAssistant(msg: Message): ToolCall[] {
  if (msg.role !== 'assistant' || typeof msg.content === 'string') return []
  const calls: ToolCall[] = []
  for (const block of msg.content) {
    if (block.type === 'toolCall' && block.id) {
      calls.push({ id: block.id, name: block.name })
    }
  }
  return calls
}

/**
 * 从消息中提取已反馈的工具结果 ID
 */
function extractToolResultIds(msg: Message): string[] {
  if (msg.role === 'toolResult') {
    return [msg.toolCallId]
  }

  if (msg.role === 'user' && Array.isArray(msg.content)) {
    const ids: string[] = []
    for (const block of msg.content) {
      if (block.type === 'toolResult' && block.toolCallId) {
        ids.push(block.toolCallId)
      }
    }
    return ids
  }

  return []
}

/**
 * 生成缺失工具结果的合成占位
 */
function makeMissingToolResult(toolCallId: string, toolName?: string): ToolResultMessage {
  return {
    id: `synth_${toolCallId}_${Date.now()}`,
    role: 'toolResult',
    toolCallId: toolCallId,
    toolName: toolName || 'unknown',
    content: [
      {
        type: 'text',
        text: '[opcclaw] missing tool result in session history; inserted synthetic error result for transcript repair.'
      }
    ],
    isError: true,
    timestamp: Date.now()
  }
}

export { makeMissingToolResult }

type ToolResultGuard = {
  flushPendingToolResults: (sessionKey: string) => Promise<void>
  getPendingIds: (sessionKey: string) => string[]
}

const guardState = new WeakMap<SessionManager, ToolResultGuard>()

/**
 * 安装 tool result guard
 */
export function installSessionToolResultGuard(sessionManager: SessionManager): ToolResultGuard {
  const existing = guardState.get(sessionManager)
  if (existing) return existing

  const originalAppend = sessionManager.append.bind(sessionManager)
  const pendingBySession = new Map<string, Map<string, string | undefined>>()

  const getPending = (sessionKey: string) => {
    let m = pendingBySession.get(sessionKey)
    if (!m) {
      m = new Map()
      pendingBySession.set(sessionKey, m)
    }
    return m
  }

  const flushPendingToolResults = async (sessionKey: string) => {
    const pending = pendingBySession.get(sessionKey)
    if (!pending || pending.size === 0) return
    for (const [id, name] of pending.entries()) {
      await originalAppend(sessionKey, makeMissingToolResult(id, name))
    }
    pending.clear()
  }

  sessionManager.append = async (sessionKey: string, message: Message) => {
    const pending = getPending(sessionKey)

    // 1. 如果是工具结果，先清除 pending
    const resultIds = extractToolResultIds(message)
    if (resultIds.length > 0) {
      for (const id of resultIds) pending.delete(id)
      return originalAppend(sessionKey, message)
    }

    const toolCalls = extractToolCallsFromAssistant(message)

    // 2. 如果有未完成的工具结果，且当前不是工具结果消息，则 flush
    if (pending.size > 0) {
      // 无论是新一轮 Assistant 还是 User 消息，只要有 pending 就 flush
      await flushPendingToolResults(sessionKey)
    }

    await originalAppend(sessionKey, message)

    // 3. 追踪新的 toolCall
    for (const call of toolCalls) {
      pending.set(call.id, call.name)
    }
  }

  const guard: ToolResultGuard = {
    flushPendingToolResults,
    getPendingIds: (sessionKey: string) => Array.from(getPending(sessionKey).keys())
  }
  guardState.set(sessionManager, guard)

  return guard
}
