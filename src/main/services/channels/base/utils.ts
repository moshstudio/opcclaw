/**
 * 频道模块通用工具函数
 */

import i18next from 'i18next'
import { Message } from '../../gateway/protocol'

/** 会话解析后的结构 */
export interface SessionKeyInfo {
  agentId: string
  chatId: string
  threadId?: number
}

/**
 * 生成会话 Key (格式: agentId:channelId:chatId[:threadId])
 */
export function getSessionKey(
  chatId: number | string,
  channelId: string,
  agentBindings?: Map<string, string>,
  defaultAgentId: string = 'main',
  threadId?: number
): string {
  const bindKey = threadId ? `${chatId}_${threadId}` : `${chatId}`
  const agentId = agentBindings?.get(bindKey) || defaultAgentId
  return `${agentId}:${channelId}:${chatId}${threadId ? `:${threadId}` : ''}`
}

/**
 * 解析会话 Key
 */
export function parseSessionKey(key: string, channelId: string): SessionKeyInfo | null {
  if (!key) return null
  const parts = key.split(':')
  // 预期格式: agentId, channelId, chatId, [threadId]
  if (parts.length < 3) return null
  if (parts[1] !== channelId) return null

  return {
    agentId: parts[0],
    chatId: parts[2],
    threadId: parts[3] ? parseInt(parts[3], 10) : undefined
  }
}

/**
 * 获取基于语言的翻译函数
 */
export function getTranslate(source?: unknown) {
  // 核心原则：遵循软件当前的语言设置 (opcclaw 设置)
  let lang = i18next.language || 'zh'

  // 如果 source 是明确的字符串（例如开发者显式指定），则遵循该指定，否则一律使用软件当前语言
  if (typeof source === 'string') {
    lang = source.startsWith('zh') ? 'zh' : 'en'
  } else if (source && typeof source === 'object') {
    // 兼容 Telegram Context 或类似的 from 结构
    const ctx = source as { from?: { language_code?: string } }
    if (ctx.from?.language_code) {
      lang = ctx.from.language_code.startsWith('zh') ? 'zh' : 'en'
    }
  }

  return i18next.getFixedT(lang)
}

/**
 * 提取跨平台通用的消息文本
 */
export function extractText(message?: Message): string {
  if (!message?.content) return ''
  if (typeof message.content === 'string') return message.content
  return message.content
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'thinking') return b.thinking
      return ''
    })
    .join('')
}

/**
 * 通用文本截断
 */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}
