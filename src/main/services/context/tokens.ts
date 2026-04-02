import type { Context as PiContext, Usage } from '@mariozechner/pi-ai'
import type { Message } from '@shared/types/agent'
import { getEncoding } from 'js-tiktoken'

const tokenizer = getEncoding('cl100k_base')

export function countTokens(text: string | null | undefined): number {
  if (!text) return 0
  try {
    return tokenizer.encode(text).length
  } catch (err) {
    return Math.max(1, Math.ceil(text.length / 3.5))
  }
}

/**
 * 估算单条消息消耗的 Token
 */
export function estimateMessageTokens(message: Message): number {
  if (message.usage?.output && message.usage.output > 0) return message.usage.output

  const rawText =
    typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

  return Math.max(1, countTokens(rawText) + 4)
}

/**
 * 在 Provider 未返回 Usage 时（如中断），计算交互消耗的 Token
 */
export function estimateInteractionUsage(piContext: PiContext, assistantMsg: Message): Usage {
  const output = estimateMessageTokens(assistantMsg)

  // 累计 Input: 系统提示词 + 消息历史 + 工具定义
  let input = countTokens(piContext.systemPrompt)

  input += (piContext.messages || []).reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    return sum + countTokens(content) + 4 // +4 为消息头权重
  }, 0)

  input += countTokens(JSON.stringify(piContext.tools || []))

  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}
