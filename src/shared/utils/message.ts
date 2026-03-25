import type {
  Message,
  AssistantMessage,
  ToolResultMessage,
  ContentBlock,
  AgentToolCallBlock,
  AgentToolResultBlock
} from '../types/agent'

/**
 * 规范化内容块：仅进行类型修正，不再兼容旧格式
 */
export function normalizeContentBlock(block: any): ContentBlock {
  if (!block || typeof block !== 'object') return block

  // 1. 标准 ToolCall 结构强化
  if (block.type === 'toolCall') {
    return {
      type: 'toolCall',
      id: block.id || '',
      name: block.name || '',
      arguments: block.arguments || {}
    } as AgentToolCallBlock
  }

  // 2. 标准 ToolResult 结构强化
  if (block.type === 'toolResult') {
    return {
      type: 'toolResult',
      toolCallId: block.toolCallId || '',
      toolName: block.toolName || '',
      content: Array.isArray(block.content)
        ? block.content
        : [{ type: 'text', text: String(block.content || '') }],
      isError: !!block.isError
    } as AgentToolResultBlock
  }

  return block as ContentBlock
}

/**
 * 消息归一化：补全 ID、时间戳及角色相关的默认字段项，转换内容块
 */
export function normalizeMessage(m: any): Message {
  const timestamp =
    typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : m.timestamp || Date.now()

  const base = {
    ...m,
    id: m.id || `msg_${Math.random().toString(36).slice(2, 9)}`,
    timestamp
  }

  // 角色特定的补全逻辑 (仅使用标准字段)
  if (m.role === 'assistant') {
    const am = m as AssistantMessage
    return {
      ...base,
      content: (Array.isArray(am.content) ? am.content : []).map(normalizeContentBlock),
      stopReason: am.stopReason || 'stop'
    } as AssistantMessage
  }

  if (m.role === 'toolResult') {
    const tm = m as ToolResultMessage
    return {
      ...base,
      content: (Array.isArray(tm.content) ? tm.content : []).map(normalizeContentBlock),
      toolCallId: tm.toolCallId || '',
      toolName: tm.toolName || ''
    } as ToolResultMessage
  }

  const userMsg = m as Message
  if (userMsg.role === 'user' && Array.isArray(userMsg.content)) {
    return {
      ...base,
      content: userMsg.content.map(normalizeContentBlock)
    }
  }

  return base as Message
}

/**
 * 转换事件类型前缀为网关状态名
 */
export function eventToChatState(eventType: string): string {
  return eventType.replace(/^chat:/, '').replace(/-/g, '_')
}
