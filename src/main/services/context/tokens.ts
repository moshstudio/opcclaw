import type { ContentBlock, Message } from '@shared/types/agent.js'

export const CHARS_PER_TOKEN_ESTIMATE = 4

function estimateBlockChars(block: ContentBlock): number {
  if (block.type === 'text') {
    return block.text?.length ?? 0
  }
  if (block.type === 'thinking') {
    return block.thinking?.length ?? 0
  }
  if (block.type === 'toolCall') {
    const base = block.name?.length ?? 0
    try {
      const args = block.arguments ? JSON.stringify(block.arguments) : ''
      return base + args.length + 16
    } catch {
      return base + 128
    }
  }
  if (block.type === 'toolResult') {
    return estimateContentChars(block.content)
  }
  if (block.type === 'subagent') {
    return (block.subagent?.task?.length || 0) + (block.subagent?.summary?.length || 0) + 32
  }
  return 0
}

function estimateContentChars(content: any): number {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    return content.reduce((sum, b) => sum + estimateBlockChars(b as ContentBlock), 0)
  }
  return 0
}

export function estimateMessageChars(message: Message): number {
  if (typeof message.content === 'string') {
    return message.content.length
  }
  let total = 0
  for (const block of message.content) {
    total += estimateBlockChars(block)
  }
  return total
}

export function estimateMessagesChars(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageChars(msg), 0)
}

export function estimateMessageTokens(message: Message): number {
  const chars = estimateMessageChars(message)
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE))
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}
