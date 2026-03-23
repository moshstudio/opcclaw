import { createCompactionSummaryMessage, type Message } from '@main/services/session/session.js'
import {
  estimateMessageTokens,
  estimateMessagesTokens
} from './tokens.js'
import { pruneContextMessages, type ContextPruningSettings, type PruneResult } from './pruning.js'

export const BASE_CHUNK_RATIO = 0.4
export const MIN_CHUNK_RATIO = 0.15
export const SAFETY_MARGIN = 1.2

/**
 * Compaction 设置
 */
export interface CompactionSettings {
  enabled: boolean
  reserveTokens: number
  keepRecentTokens: number
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 20_000,
  keepRecentTokens: 20_000
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000

export const DEFAULT_SUMMARY_MAX_TOKENS = 900
const DEFAULT_SUMMARY_FALLBACK = 'No prior history.'
const DEFAULT_PARTS = 2

const SUMMARIZATION_SYSTEM_PROMPT = `你是上下文摘要助手。你的任务是阅读用户与 AI 编程助手的对话，然后按照指定格式输出结构化摘要。

不要继续对话。不要回答对话中的问题。只输出结构化摘要。`

const SUMMARIZATION_PROMPT = `以上消息是一段对话，请生成结构化的上下文检查点摘要，供后续模型继续工作使用。

请严格使用以下格式：

## 目标
[用户想要完成什么？如果会话涉及多个任务，可列出多个目标]

## 约束与偏好
- [用户提到的任何约束、偏好或要求]
- [若无则写“(无)”]

## 进展
### 已完成
- [x] [已完成的任务/改动]

### 进行中
- [ ] [当前进行的工作]

### 阻塞
- [若有阻塞问题，写在这里]

## 关键决策
- **[决策]**: [简要原因]

## 下一步
1. [按顺序列出下一步应该做什么]

## 关键信息
- [继续工作所需的任何数据、示例或引用]
- [若不适用则写“(无)”]

每个部分保持简洁。保留精确的文件路径、函数名与错误信息。`

const UPDATE_SUMMARIZATION_PROMPT = `以上消息是需要纳入已有摘要的新对话内容。已有摘要位于 <previous-summary> 标签中。

请在保留已有摘要信息的前提下进行更新。规则：
- 保留已有摘要中的所有重要信息
- 追加新进展、决策和上下文
- 更新“进展”：已完成的事项从“进行中”移动到“已完成”
- 根据新进展更新“下一步”
- 保留精确的文件路径、函数名与错误信息
- 若某些信息不再 relevant，可移除

请严格使用以下格式：

## 目标
[保留已有目标，必要时补充新的目标]

## 约束与偏好
- [保留已有内容，新增发现的内容]

## 进展
### 已完成
- [x] [包含之前已完成事项 + 新完成事项]

### 进行中
- [ ] [当前进行的工作]

### 阻塞
- [当前阻塞问题，若已解决可移除]

## 关键决策
- **[决策]**: [简要原因]（保留已有并补充新的）

## 下一步
1. [根据当前状态更新下一步]

## 关键信息
- [保留重要上下文，必要时补充新信息]

每个部分保持简洁。保留精确的文件路径、函数名与错误信息。`

type FileOps = {
  read: Set<string>
  written: Set<string>
  edited: Set<string>
}

function createFileOps(): FileOps {
  return {
    read: new Set<string>(),
    written: new Set<string>(),
    edited: new Set<string>()
  }
}

function extractFileOpsFromMessage(message: Message, fileOps: FileOps): void {
  if (message.role !== 'assistant') return
  if (!Array.isArray(message.content)) return

  for (const block of message.content) {
    if (block.type !== 'toolCall') continue
    const args = block.arguments as any
    if (!args || typeof args !== 'object') continue
    const path = typeof args.path === 'string' ? args.path : undefined
    if (!path) continue
    switch (block.name) {
      case 'read': fileOps.read.add(path); break
      case 'write': fileOps.written.add(path); break
      case 'edit': fileOps.edited.add(path); break
    }
  }
}

function computeFileLists(fileOps: FileOps): { readFiles: string[]; modifiedFiles: string[] } {
  const modified = new Set<string>([...fileOps.edited, ...fileOps.written])
  const readOnly = [...fileOps.read].filter((file) => !modified.has(file)).sort()
  const modifiedFiles = [...modified].sort()
  return { readFiles: readOnly, modifiedFiles }
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = []
  if (readFiles.length > 0) sections.push(`<read-files>\n${readFiles.join('\n')}\n</read-files>`)
  if (modifiedFiles.length > 0) sections.push(`<modified-files>\n${modifiedFiles.join('\n')}\n</modified-files>`)
  return sections.length === 0 ? '' : `\n\n${sections.join('\n\n')}`
}

export type SummarizeFn = (params: { system: string; userPrompt: string; maxTokens: number }) => Promise<string>

export function computeAdaptiveChunkRatio(messages: Message[], contextWindow: number): number {
  if (messages.length === 0) return BASE_CHUNK_RATIO
  const totalTokens = estimateMessagesTokens(messages)
  const avgTokens = totalTokens / messages.length
  const avgRatio = (avgTokens * SAFETY_MARGIN) / contextWindow
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO)
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction)
  }
  return BASE_CHUNK_RATIO
}

export function splitMessagesByTokenShare(messages: Message[], parts = DEFAULT_PARTS): Message[][] {
  if (messages.length === 0) return []
  const normalizedParts = Math.min(Math.max(1, parts), messages.length)
  if (normalizedParts <= 1) return [messages]

  const targetTokens = estimateMessagesTokens(messages) / normalizedParts
  const chunks: Message[][] = []
  let current: Message[] = []
  let currentTokens = 0

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message)
    if (chunks.length < normalizedParts - 1 && current.length > 0 && currentTokens + messageTokens > targetTokens) {
      chunks.push(current)
      current = []; currentTokens = 0
    }
    current.push(message)
    currentTokens += messageTokens
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export function chunkMessagesByMaxTokens(messages: Message[], maxTokens: number): Message[][] {
  const chunks: Message[][] = []
  let current: Message[] = []
  let currentTokens = 0
  for (const message of messages) {
    const tokens = estimateMessageTokens(message)
    if (current.length > 0 && currentTokens + tokens > maxTokens) {
      chunks.push(current)
      current = []; currentTokens = 0
    }
    current.push(message)
    currentTokens += tokens
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n')
  }
  return ''
}

function serializeConversation(messages: Message[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = extractTextFromContent(msg.content)
      if (text) parts.push(`[User]: ${text}`)
      continue
    }

    if (msg.role === 'toolResult') {
      parts.push(`[Tool result (${msg.toolName})]: ${extractTextFromContent(msg.content)}`)
      continue
    }

    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        parts.push(`[Assistant]: ${msg.content}`)
      } else {
        const text = msg.content.filter((b: any) => b.type === 'text' || b.type === 'thinking').map((b: any) => b.text || b.thinking || '').join('\n')
        if (text) parts.push(`[Assistant]: ${text}`)
        const calls = msg.content.filter((b: any) => b.type === 'toolCall').map((b: any) => `${b.name}(${JSON.stringify(b.arguments)})`).join('; ')
        if (calls) parts.push(`[Assistant tool calls]: ${calls}`)
      }
    }
  }
  return parts.join('\n\n')
}

async function generateSummary(params: { messages: Message[]; summarize: SummarizeFn; maxTokens: number; customInstructions?: string; previousSummary?: string }): Promise<string> {
  const conversationText = serializeConversation(params.messages)
  let prompt = `<conversation>\n${conversationText}\n</conversation>\n\n`
  if (params.previousSummary) prompt += `<previous-summary>\n${params.previousSummary}\n</previous-summary>\n\n`
  prompt += (params.previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT)
  if (params.customInstructions) prompt += `\n\nAdditional focus: ${params.customInstructions}`

  return params.summarize({ system: SUMMARIZATION_SYSTEM_PROMPT, userPrompt: prompt, maxTokens: params.maxTokens })
}

export async function summarizeInStages(params: { messages: Message[]; summarize: SummarizeFn; maxTokens: number; maxChunkTokens: number; contextWindow: number; customInstructions?: string; previousSummary?: string }): Promise<string> {
  const { messages } = params
  if (messages.length === 0) return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK
  
  const chunks = chunkMessagesByMaxTokens(messages, params.maxChunkTokens)
  let summary = params.previousSummary
  for (const chunk of chunks) {
    summary = await generateSummary({ messages: chunk, summarize: params.summarize, maxTokens: params.maxTokens, customInstructions: params.customInstructions, previousSummary: summary })
  }
  return summary ?? DEFAULT_SUMMARY_FALLBACK
}

export function shouldTriggerCompaction(messages: Message[], contextWindowTokens: number, settings?: Partial<CompactionSettings>): boolean {
  const s = { ...DEFAULT_COMPACTION_SETTINGS, ...settings }
  if (!s.enabled) return false
  const totalTokens = estimateMessagesTokens(messages)
  return totalTokens > contextWindowTokens - s.reserveTokens
}

export function buildCompactionSummary(summary: string): string {
  return summary
}

export async function compactHistoryIfNeeded(params: { summarize: SummarizeFn; messages: Message[]; contextWindowTokens: number; pruningSettings?: Partial<ContextPruningSettings>; compactionSettings?: Partial<CompactionSettings>; maxTokens?: number }): Promise<{ summary?: string; summaryMessage?: Message; pruneResult: PruneResult }> {
  const pruneResult = pruneContextMessages({ messages: params.messages, contextWindowTokens: params.contextWindowTokens, settings: params.pruningSettings })
  const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...params.compactionSettings }
  const totalTokens = estimateMessagesTokens(params.messages)
  const shouldCompact = settings.enabled && totalTokens > params.contextWindowTokens - settings.reserveTokens

  if (!shouldCompact || pruneResult.droppedMessages.length === 0) return { pruneResult }

  const adaptiveRatio = computeAdaptiveChunkRatio(params.messages, params.contextWindowTokens)
  const maxChunkTokens = Math.max(1, Math.floor(params.contextWindowTokens * adaptiveRatio))
  const maxTokens = Math.max(64, Math.floor(params.maxTokens ?? 0.8 * settings.reserveTokens))

  let summary = await summarizeInStages({ messages: pruneResult.droppedMessages, summarize: params.summarize, maxTokens, maxChunkTokens, contextWindow: params.contextWindowTokens })
  
  const fileOps = createFileOps()
  for (const message of pruneResult.droppedMessages) extractFileOpsFromMessage(message, fileOps)
  const { readFiles, modifiedFiles } = computeFileLists(fileOps)
  summary += formatFileOperations(readFiles, modifiedFiles)

  return { summary, summaryMessage: createCompactionSummaryMessage(summary, Date.now()), pruneResult }
}
