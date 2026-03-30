import type { Message } from '@shared/types/agent'
import { getEncoding } from 'js-tiktoken'

const tokenizer = getEncoding('cl100k_base')

export function estimateMessageTokens(message: Message): number {
  if (message.usage && typeof message.usage.output === 'number' && message.usage.output > 0) {
    return message.usage.output
  }
  let rawText = ''
  if (typeof message.content === 'string') {
    rawText = message.content
  } else {
    // 对于复杂的 Array 结构（包含 ToolCall, ToolResult, Thinking 等），
    // 采用全量 JSON 序列化能最真实地模拟传输给 LLM 的 Payload 体积及 Token 权重。
    try {
      rawText = JSON.stringify(message.content)
    } catch {
      rawText = String(message.content)
    }
  }

  // 加上一点通信开销 (role, framings 等)
  try {
    return Math.max(1, tokenizer.encode(rawText).length + 4)
  } catch (err) {
    // 降级使用传统的粗糙长度估算
    return Math.max(1, Math.ceil(rawText.length / 4))
  }
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}
