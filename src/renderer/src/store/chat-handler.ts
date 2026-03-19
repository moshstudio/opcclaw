import { Message, ChatStatus } from '@shared/types/agent'

/**
 * Ensures an assistant message exists for the given runId.
 * If not found, creates one and returns it along with its index.
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
 * Adds or updates a text block in an assistant message.
 */
export const appendTextDelta = (msg: Message, text: string | undefined) => {
  if (typeof msg.content === 'string') {
    msg.content = [{ type: 'text', text: msg.content + (text || '') }]
    return
  }

  const lastBlock = msg.content[msg.content.length - 1]
  if (lastBlock?.type === 'text') {
    lastBlock.text = (lastBlock.text || '') + (text || '')
  } else if (text !== undefined) {
    msg.content.push({ type: 'text', text: text || '' })
  }
}

/**
 * Adds or updates a thinking block in an assistant message.
 */
export const appendThinkingDelta = (msg: Message, delta: string | undefined) => {
  if (!Array.isArray(msg.content)) return

  const lastBlock = msg.content[msg.content.length - 1]
  if (lastBlock?.type !== 'thinking') {
    msg.content.push({ type: 'thinking', text: delta || '' })
  } else {
    lastBlock.text = (lastBlock.text || '') + (delta || '')
  }
}

/**
 * Handles 'chat' event payloads.
 */
export const handleChatEvent = (
  payload: any,
  messages: Message[]
): { status: ChatStatus; messages: Message[]; errorMessage?: string } => {
  const { state, text, error, runId } = payload
  let status: ChatStatus = 'streaming'
  let errorMessage: string | undefined

  if (state === 'start' || state === 'delta' || state === 'final') {
    const { msg } = ensureAssistantMessage(messages, runId)
    appendTextDelta(msg, text)
    if (payload.usage) msg.usage = payload.usage
    if (payload.performance) msg.performance = payload.performance
    status = state === 'final' ? 'completed' : 'streaming'
  } else if (state === 'error') {
    const isAbort =
      error === '操作已中止' || (error && String(error).toLowerCase().includes('aborted'))
    status = isAbort ? 'aborted' : 'error'

    if (!isAbort) {
      errorMessage = String(error).startsWith('Error:') ? String(error) : `Error: ${error}`
    }
  }

  return { status, messages, errorMessage }
}

/**
 * Handles 'agent' event payloads.
 */
export const handleAgentEvent = (
  payload: any,
  messages: Message[],
  currentStatus: ChatStatus
): { status: ChatStatus; messages: Message[]; errorMessage?: string } => {
  let status: ChatStatus = currentStatus
  let errorMessage: string | undefined
  const runId = payload.runId

  switch (payload.type) {
    case 'agent_start':
      if (currentStatus === 'idle' || currentStatus === 'error' || currentStatus === 'completed') {
        status = 'waiting'
      }
      break
    case 'user_message': {
      const exists = messages.some((m) => m.id === payload.message.id)
      if (!exists) {
        messages.push(payload.message)
      }
      break
    }
    case 'thinking_delta': {
      status = 'thinking'
      const { msg: tMsg } = ensureAssistantMessage(messages, runId)
      appendThinkingDelta(tMsg, payload.delta)
      break
    }
    case 'message_delta': {
      // 消息部分统一由 handleChatEvent 处理，此处仅更新状态以防万一
      status = 'streaming'
      break
    }
    case 'tool_execution_start': {
      status = 'tool_executing'
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
      status = 'streaming'
      // 增加独立的 user 消息用于存放工具结果，对应后端 history 结构
      const resultMsg: Message = {
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
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })
      }
      messages.push(resultMsg)
      break
    }
    case 'message_end': {
      status = 'completed'
      const { msg: meMsg } = ensureAssistantMessage(messages, runId)
      // 内容最终同步由 handleChatEvent ('final' state) 增量完成，或在此处容错补全
      // 为防止重复，若已有内容则不盲目覆盖文本，仅同步 usage
      if (payload.usage) meMsg.usage = payload.usage
      break
    }
    case 'agent_end': {
      status = 'completed'
      // 不再盲目覆盖最后一条消息的 content，由 deltas 维持
      // 仅同步最后的指标
      const { msg: aeMsg } = ensureAssistantMessage(messages, runId)
      if (payload.usage) aeMsg.usage = payload.usage
      if (payload.performance) aeMsg.performance = payload.performance
      break
    }
    case 'agent_error':
      status = 'error'
      errorMessage = payload.error || 'Agent execution failed'
      break
    default:
      status = currentStatus
  }

  return { status, messages, errorMessage }
}
