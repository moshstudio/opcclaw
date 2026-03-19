import { Message, ChatStatus } from '@shared/types/agent'

/**
 * 局部会话状态片段用于状态提取
 */
export interface SessionPatch {
  messages: Message[]
  status: ChatStatus
  errorMessage?: string | null
}

/**
 * 确保给定 runId 的 Assistant 消息存在。如果不存在，则创建一个并将其推送到数组中。
 */
export const ensureAssistantMessage = (
  messages: Message[],
  runId: string | undefined
): { msg: Message; index: number } => {
  const lastIdx = messages.length - 1
  const lastMsg = messages[lastIdx]

  let idx = -1
  if (lastMsg && lastMsg.role === 'assistant') {
    if (runId) {
      if (lastMsg.runId === runId || lastMsg.id === runId) {
        idx = lastIdx
      }
    } else {
      idx = lastIdx
    }
  }

  if (idx === -1) {
    const newMsg: Message = {
      id: runId && !messages.some((m) => m.id === runId) ? runId : `temp_asst_${Date.now()}`,
      role: 'assistant',
      runId,
      content: [],
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    messages.push(newMsg)
    idx = messages.length - 1
  }

  return { msg: messages[idx], index: idx }
}

/**
 * 原子化：将文本增量追加到消息内容中
 */
export const appendTextDelta = (msg: Message, text: string | undefined) => {
  if (text === undefined) return
  if (typeof msg.content === 'string') {
    msg.content = [{ type: 'text', text: msg.content + text }]
    return
  }

  const lastBlock = msg.content[msg.content.length - 1]
  if (lastBlock?.type === 'text') {
    lastBlock.text = (lastBlock.text || '') + text
  } else {
    msg.content.push({ type: 'text', text })
  }
}

/**
 * 原子化：将思考增量投向消息内容
 */
export const appendThinkingDelta = (msg: Message, delta: string | undefined) => {
  if (delta === undefined || !Array.isArray(msg.content)) return

  const lastBlock = msg.content[msg.content.length - 1]
  if (lastBlock?.type !== 'thinking') {
    msg.content.push({ type: 'thinking', text: delta })
  } else {
    lastBlock.text = (lastBlock.text || '') + delta
  }
}

/**
 * 统一网关事件驱动逻辑 (商用解耦优化)
 *
 * @param eventType 'chat' 或 'agent' 频道
 * @param payload 事件载荷
 * @param currentPatch 当前受影响 session 的状态快照
 * @returns 差异化的 Partial State
 */
export const applyChatEvent = (
  eventType: 'chat' | 'agent',
  payload: any,
  currentPatch: SessionPatch
): SessionPatch => {
  const { messages, status: currentStatus } = currentPatch
  let nextStatus: ChatStatus = currentStatus
  let nextError: string | null = currentPatch.errorMessage || null
  const runId = payload.runId

  // --- 处理 1: 'chat' 核心频道 (主链路增量数据) ---
  if (eventType === 'chat') {
    const { state, text, error, chunkId, parentId } = payload
    if (state === 'start' || state === 'delta' || state === 'final') {
      const { msg } = ensureAssistantMessage(messages, runId)

      // ⚠️ 关键性能优化：去重逻辑 (重复分片直接跳过)
      if (chunkId && msg.lastChunkId === chunkId) {
        console.warn(`[Chat] Duplicate chunk received: ${chunkId}, skipping.`)
        return currentPatch
      }

      // ⚠️ 连贯性逻辑
      if (parentId && msg.lastChunkId && msg.lastChunkId !== parentId) {
        console.error(
          `[Chat] Lineage break! Expected parent: ${parentId}, but current was ${msg.lastChunkId}.`
        )
      }

      // 正常追加增量数据
      appendTextDelta(msg, text)
      if (payload.usage) msg.usage = payload.usage
      if (payload.performance) msg.performance = payload.performance

      // 更新分片追踪 ID
      if (chunkId) msg.lastChunkId = chunkId

      nextStatus = state === 'final' ? 'completed' : 'streaming'
    } else if (state === 'error') {
      const isAbort =
        error === '操作已中止' || (error && String(error).toLowerCase().includes('aborted'))
      nextStatus = isAbort ? 'aborted' : 'error'
      if (!isAbort) {
        nextError = String(error).startsWith('Error:') ? String(error) : `Error: ${error}`
      }
    }
  }

  // --- 处理 2: 'agent' 通道 (元数据与智能体行为) ---
  if (eventType === 'agent') {
    switch (payload.type) {
      case 'agent_start':
        if (
          currentStatus === 'idle' ||
          currentStatus === 'error' ||
          currentStatus === 'completed'
        ) {
          nextStatus = 'waiting'
        }
        break
      case 'user_message': {
        const exists = messages.some((m) => m.id === payload.message.id)
        if (!exists) messages.push(payload.message)
        break
      }
      case 'thinking_delta': {
        nextStatus = 'thinking'
        const { msg: tMsg } = ensureAssistantMessage(messages, runId)
        appendThinkingDelta(tMsg, payload.delta)
        break
      }
      case 'message_delta':
        nextStatus = 'streaming'
        break
      case 'tool_execution_start': {
        nextStatus = 'tool_executing'
        const { msg: teMsg } = ensureAssistantMessage(messages, runId)
        if (Array.isArray(teMsg.content)) {
          teMsg.content.push({
            type: 'tool_use',
            id: payload.toolCallId,
            name: payload.toolName,
            input: payload.args
          })
        }
        break
      }
      case 'tool_execution_end': {
        nextStatus = 'streaming'
        messages.push({
          id: `temp_res_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          role: 'user',
          runId,
          content: [
            {
              type: 'tool_result',
              tool_use_id: payload.toolCallId,
              content: payload.result
            }
          ],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
        break
      }
      case 'message_end':
      case 'agent_end': {
        nextStatus = 'completed'
        const { msg: endMsg } = ensureAssistantMessage(messages, runId)
        if (payload.usage) endMsg.usage = payload.usage
        if (payload.performance) endMsg.performance = payload.performance
        break
      }
      case 'agent_error':
        nextStatus = 'error'
        nextError = payload.error || 'Agent execution failed'
        break
    }
  }

  // 错误恢复预检
  if (['idle', 'streaming', 'thinking', 'tool_executing'].includes(nextStatus)) {
    nextError = null
  }

  return { messages, status: nextStatus, errorMessage: nextError }
}
