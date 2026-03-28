import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

export type ExtractMode = 'markdown' | 'text'

/**
 * 清理 HTML 字符串，移除脚本、样式、注释等干扰内容
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 简单的 HTML 转 Markdown 实现 (基于正则)
 * 相比 OpenClaw 原始版本增加了细节处理
 */
export function htmlToMarkdown(html: string): { text: string; title?: string } {
  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : undefined

  let text = sanitizeHtml(html)

  // 处理链接 [text](url)
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = body.replace(/<[^>]+>/g, '').trim()
    return label ? `[${label}](${href})` : href
  })

  // 处理标题 # H1
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    const prefix = '#'.repeat(Number.parseInt(level))
    const label = body.replace(/<[^>]+>/g, '').trim()
    return `\n${prefix} ${label}\n`
  })

  // 处理列表项
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => {
    const label = body.replace(/<[^>]+>/g, '').trim()
    return label ? `\n- ${label}` : ''
  })

  // 处理换行标签
  text = text
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, '\n')

  // 移除剩余所有标签
  text = text.replace(/<[^>]+>/g, '')

  // 规范化空白字符
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return { text, title }
}

/**
 * Markdown 转纯文本 (移除链接格式、标题符号等)
 */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, '') // 移除图片
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1') // 保留链接文字
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, '')) // 处理代码块
    .replace(/`([^`]+)`/g, '$1') // 处理行内代码
    .replace(/^#{1,6}\s+/gm, '') // 移除标题
    .replace(/^\s*[-*+]\s+/gm, '') // 移除列表符
    .replace(/^\s*\d+\.\s+/gm, '') // 移除数字列表
    .replace(/\n{2,}/g, '\n\n')
    .trim()
}

/**
 * 使用 Readability 提取核心可读内容
 */
export async function extractReadableContent(params: {
  html: string
  url: string
  extractMode: ExtractMode
}): Promise<{ text: string; title?: string } | null> {
  try {
    const cleanHtml = sanitizeHtml(params.html)

    // 限制输入长度，防止 Readability 解析超大文件崩溃
    if (cleanHtml.length > 2_000_000) {
      return null
    }

    const { document } = parseHTML(cleanHtml)

    // 尝试注入基准 URL 解决相对链接问题
    try {
      if (params.url) {
        ;(document as any).baseURI = params.url
      }
    } catch {
      /* ignore */
    }

    const reader = new Readability(document, { charThreshold: 0 })
    const parsed = reader.parse()

    if (!parsed || !parsed.content) {
      return null
    }

    const title = parsed.title || undefined

    if (params.extractMode === 'text') {
      const text = markdownToText(parsed.textContent || '')
      return text ? { text, title } : null
    }

    // 将 Readability 提取的 HTML 片段转为 Markdown
    const rendered = htmlToMarkdown(parsed.content)
    return {
      text: rendered.text,
      title: title || rendered.title
    }
  } catch (err) {
    console.error('[WebFetchUtils] Extraction failed:', err)
    return null
  }
}
