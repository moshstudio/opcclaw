import { normalizeMessage } from '@shared/utils/message'
import type { Message } from '@shared/types/agent'
import type {
  Message as PiMessage,
  AssistantMessage as PiAssistantMessage,
  TextContent as PiTextContent,
  ThinkingContent as PiThinkingContent,
  ToolCall as PiToolCall,
  ImageContent as PiImageContent
} from '@mariozechner/pi-ai'
import type { ContentBlock, AgentTextBlock } from '@shared/types/agent'

/**
 * 更稳健的 Assistant 消息类型
 */
type RobustAssistantMessage = PiAssistantMessage & {
  [key: string]: any // 允许动态注入思维链字段
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

/**
 * 将内部 Message[] 转换为 pi-ai 的 Message[]
 */
export function convertMessagesToPi(
  messages: Message[],
  modelInfo: { api: string; provider: string; id: string }
): PiMessage[] {
  const result: PiMessage[] = []

  for (const rawMsg of messages) {
    const msg = normalizeMessage(rawMsg)
    const { timestamp, role } = msg

    if (role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content, timestamp: Number(timestamp) })
        continue
      }

      const textParts: PiTextContent[] = []
      const blocks = msg.content as ContentBlock[]
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          textParts.push({ type: 'text', text: block.text })
        } else if (block.type === 'toolResult') {
          result.push({
            role: 'toolResult',
            toolCallId: block.toolCallId,
            toolName: block.toolName,
            content: block.content,
            isError: block.isError,
            timestamp: Number(timestamp)
          })
        }
      }
      if (textParts.length > 0) {
        result.push({ role: 'user', content: textParts, timestamp: Number(timestamp) })
      }
    } else if (role === 'assistant') {
      const isDeepSeek =
        modelInfo.id.toLowerCase().includes('deepseek') || modelInfo.provider === 'deepseek'
      const piContent: (PiTextContent | PiThinkingContent | PiToolCall)[] = []
      let reasoningContent = ''
      let detectedSignature = ''

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          piContent.push({ type: 'text', text: block.text })
        } else if (block.type === 'thinking' && block.thinking) {
          const sig = block.thinking_signature || (isDeepSeek ? 'reasoning_content' : undefined)
          piContent.push({
            type: 'thinking',
            thinking: block.thinking,
            ...(sig ? { thinkingSignature: sig } : {})
          })
          if (sig) {
            reasoningContent += block.thinking
            detectedSignature = sig
          }
        } else if (block.type === 'toolCall') {
          piContent.push({
            type: 'toolCall',
            id: block.id,
            name: block.name,
            arguments: block.arguments
          })
        }
      }

      const assistantMsg: RobustAssistantMessage = {
        role: 'assistant',
        content: piContent,
        api: modelInfo.api,
        provider: modelInfo.provider,
        model: modelInfo.id,
        usage: msg.usage || EMPTY_USAGE,
        stopReason: msg.stopReason || 'stop',
        timestamp: Number(timestamp)
      }

      if (reasoningContent && detectedSignature) {
        assistantMsg[detectedSignature] = reasoningContent
      }
      result.push(assistantMsg as PiAssistantMessage)
    } else if (role === 'toolResult') {
      result.push({
        role: 'toolResult',
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        content: msg.content as (AgentTextBlock | PiImageContent)[],
        isError: msg.isError,
        timestamp: Number(timestamp)
      })
    }
  }

  return result
}
