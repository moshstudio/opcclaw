/**
 * 消息格式转换: 内部 Message[] → pi-ai Message[]
 *
 * pi-ai 使用三种 role: "user" / "assistant" / "toolResult"
 * 内部格式: role 只有 "user" / "assistant"，tool_result 嵌在 user 消息的 content 中
 */

import type { Message } from '@main/services/session/session'
import type {
  Message as PiMessage,
  AssistantMessage as PiAssistantMessage,
  TextContent as PiTextContent,
  ThinkingContent as PiThinkingContent,
  ToolCall as PiToolCall
} from '@mariozechner/pi-ai'

/**
 * 更稳健的 Assistant 消息类型
 */
type RobustAssistantMessage = PiAssistantMessage & {
  reasoning_content?: string
  reasoning?: string
  reasoning_text?: string
  [key: string]: string | number | object | undefined // 更保守的索引签名
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
 *
 * 转换规则:
 * - user + string content → PiUserMessage
 * - user + ContentBlock[] 含 tool_result → 拆分为独立 PiToolResultMessage
 * - user + ContentBlock[] 含 text → PiUserMessage
 * - assistant + ContentBlock[] → PiAssistantMessage（tool_use → ToolCall）
 */
export function convertMessagesToPi(
  messages: Message[],
  modelInfo: { api: string; provider: string; id: string }
): PiMessage[] {
  const result: PiMessage[] = []

  for (const msg of messages) {
    const timestamp = typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : msg.timestamp

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({
          role: 'user',
          content: msg.content,
          timestamp
        })
        continue
      }

      const textParts: PiTextContent[] = []
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          textParts.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_result') {
          result.push({
            role: 'toolResult',
            toolCallId: block.tool_use_id ?? '',
            toolName: block.name ?? '',
            content: [{ type: 'text', text: typeof block.content === 'string' ? block.content : '' }],
            isError: false,
            timestamp
          })
        }
      }
      if (textParts.length > 0) {
        result.push({
          role: 'user',
          content: textParts,
          timestamp
        })
      }
    } else {
      // assistant
      if (typeof msg.content === 'string') {
        result.push({
          role: 'assistant',
          content: [{ type: 'text', text: msg.content }],
          api: modelInfo.api,
          provider: modelInfo.provider,
          model: modelInfo.id,
          usage: EMPTY_USAGE,
          stopReason: 'stop',
          timestamp
        })
        continue
      }

      const isDeepSeek =
        modelInfo.id.toLowerCase().includes('deepseek') || modelInfo.provider === 'deepseek'
      const piContent: (PiTextContent | PiThinkingContent | PiToolCall)[] = []
      let reasoningContent = ''
      let detectedSignature = ''

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          piContent.push({ type: 'text', text: block.text })
        } else if (block.type === 'thinking' && block.text) {
          // 优先使用历史记录中的签名，否则对 DeepSeek 兜底使用规范字段
          const sig = block.thinking_signature || (isDeepSeek ? 'reasoning_content' : undefined)
          if (sig) {
            piContent.push({
              type: 'thinking',
              thinking: block.text,
              thinkingSignature: sig
            })
            reasoningContent += block.text
            detectedSignature = sig
          } else {
            // 通用逻辑: 存入内容块但不注入顶层字段
            piContent.push({ type: 'thinking', thinking: block.text })
          }
        } else if (block.type === 'tool_use') {
          piContent.push({
            type: 'toolCall',
            id: block.id ?? '',
            name: block.name ?? '',
            arguments: block.input ?? {}
          })
        }
      }

      const assistantMsg: RobustAssistantMessage = {
        role: 'assistant',
        content: piContent,
        api: modelInfo.api,
        provider: modelInfo.provider,
        model: modelInfo.id,
        usage: EMPTY_USAGE,
        stopReason: 'stop',
        timestamp
      }

      if (reasoningContent && detectedSignature) {
        // 动态注入思维链字段: 仅在发现支持协议签名时注入
        assistantMsg[detectedSignature] = reasoningContent
      }

      result.push(assistantMsg)
    }
  }

  return result
}
