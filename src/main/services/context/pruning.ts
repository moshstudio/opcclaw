/**
 * 上下文修剪 (Context Pruning)
 */

import type { ContentBlock, Message, AgentToolResultBlock } from '@shared/types/agent'
import { estimateMessageTokens, estimateMessagesTokens } from './tokens'

// ============== 工具可修剪性判定 ==============

export type ContextPruningToolMatch = {
  allow?: string[]
  deny?: string[]
}

function makeToolPrunablePredicate(match?: ContextPruningToolMatch): (toolName: string) => boolean {
  if (!match) return () => true
  const deny = match.deny ?? []
  const allow = match.allow ?? []

  return (toolName: string) => {
    const normalized = toolName.trim().toLowerCase()
    if (deny.some((pattern) => matchGlob(normalized, pattern.toLowerCase()))) return false
    if (allow.length === 0) return true
    return allow.some((pattern) => matchGlob(normalized, pattern.toLowerCase()))
  }
}

function matchGlob(value: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return value === pattern
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '*' ? '.*' : `\\${ch}`))}$`
  )
  return regex.test(pattern)
}

// ============== 配置 ==============

export type ContextPruningSettings = {
  maxHistoryShare: number
  keepLastAssistants: number
  softTrimRatio: number
  hardClearRatio: number
  minPrunableToolChars: number
  softTrim: {
    maxChars: number
    headChars: number
    tailChars: number
  }
  hardClear: {
    enabled: boolean
    placeholder: string
  }
  tools: ContextPruningToolMatch
}

export const DEFAULT_CONTEXT_PRUNING_SETTINGS: ContextPruningSettings = {
  maxHistoryShare: 0.5,
  keepLastAssistants: 3,
  softTrimRatio: 0.3,
  hardClearRatio: 0.5,
  minPrunableToolChars: 50_000,
  softTrim: {
    maxChars: 4_000,
    headChars: 1_500,
    tailChars: 1_500
  },
  hardClear: {
    enabled: true,
    placeholder: '[Old tool result content cleared]'
  },
  tools: {}
}

export type PruneResult = {
  messages: Message[]
  droppedMessages: Message[]
  trimmedToolResults: number
  hardClearedToolResults: number
  totalTokens: number
  keptTokens: number
  droppedTokens: number
  budgetTokens: number
}

export function resolvePruningSettings(
  raw?: Partial<ContextPruningSettings>
): ContextPruningSettings {
  if (!raw) return DEFAULT_CONTEXT_PRUNING_SETTINGS
  const d = DEFAULT_CONTEXT_PRUNING_SETTINGS
  return {
    maxHistoryShare: raw.maxHistoryShare ?? d.maxHistoryShare,
    keepLastAssistants: raw.keepLastAssistants ?? d.keepLastAssistants,
    softTrimRatio: raw.softTrimRatio ?? d.softTrimRatio,
    hardClearRatio: raw.hardClearRatio ?? d.hardClearRatio,
    minPrunableToolChars: raw.minPrunableToolChars ?? d.minPrunableToolChars,
    softTrim: { ...d.softTrim, ...raw.softTrim },
    hardClear: { ...d.hardClear, ...raw.hardClear },
    tools: raw.tools ?? d.tools
  }
}

// ============== Layer 1: Soft Trim ==============

function cloneMessage(message: Message, content: Message['content']): Message {
  return { ...message, content } as Message
}

function isBlockProtected(block: ContentBlock): boolean {
  if (block.type === 'image') return true
  if (block.type === 'toolResult') {
    return block.content.some((b) => isBlockProtected(b as ContentBlock))
  }
  return false
}

function getContentText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
  }
  return ''
}

function softTrimBlock(
  block: ContentBlock,
  settings: ContextPruningSettings['softTrim'],
  isPrunable: (toolName: string) => boolean
): { block: ContentBlock; trimmed: boolean } {
  if (block.type !== 'toolResult') return { block, trimmed: false }
  if (isBlockProtected(block)) return { block, trimmed: false }
  if (block.toolName && !isPrunable(block.toolName)) return { block, trimmed: false }

  const raw = getContentText(block.content)
  if (raw.length <= settings.maxChars) return { block, trimmed: false }

  const head = raw.slice(0, settings.headChars)
  const tail = raw.slice(raw.length - settings.tailChars)
  const trimmedText = `${head}\n...\n${tail}\n\n[Tool result trimmed: kept first ${settings.headChars} chars and last ${settings.tailChars} chars of ${raw.length} chars.]`

  return {
    block: { ...block, content: [{ type: 'text', text: trimmedText }] } as AgentToolResultBlock,
    trimmed: true
  }
}

function applySoftTrim(
  messages: Message[],
  settings: ContextPruningSettings,
  isPrunable: (toolName: string) => boolean
): { messages: Message[]; trimmedToolResults: number } {
  let trimmedToolResults = 0
  const output = messages.map((msg) => {
    if (typeof msg.content === 'string') return msg
    let didChange = false
    const nextBlocks = msg.content.map((block) => {
      const res = softTrimBlock(block as ContentBlock, settings.softTrim, isPrunable)
      if (res.trimmed) {
        trimmedToolResults++
        didChange = true
      }
      return res.block
    })
    return didChange ? cloneMessage(msg, nextBlocks as ContentBlock[]) : msg
  })
  return { messages: output, trimmedToolResults }
}

// ============== Layer 2: Hard Clear ==============

function countPrunableToolChars(
  messages: Message[],
  isPrunable: (toolName: string) => boolean
): number {
  let total = 0
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'toolResult' && !isBlockProtected(block)) {
        if (!block.toolName || isPrunable(block.toolName)) {
          total += getContentText(block.content).length
        }
      }
    }
  }
  return total
}

function applyHardClear(
  messages: Message[],
  settings: ContextPruningSettings,
  isPrunable: (toolName: string) => boolean,
  contextWindowTokens: number
): { messages: Message[]; hardClearedToolResults: number } {
  if (!settings.hardClear.enabled) return { messages, hardClearedToolResults: 0 }
  let totalTokens = estimateMessagesTokens(messages)
  if (totalTokens / contextWindowTokens < settings.hardClearRatio)
    return { messages, hardClearedToolResults: 0 }
  if (countPrunableToolChars(messages, isPrunable) < settings.minPrunableToolChars)
    return { messages, hardClearedToolResults: 0 }

  let hardClearedToolResults = 0
  const output = messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg
    let didChange = false
    const nextBlocks = msg.content.map((block: ContentBlock) => {
      if (block.type === 'toolResult' && !isBlockProtected(block)) {
        const textLen = getContentText(block.content).length
        if ((!block.toolName || isPrunable(block.toolName)) && textLen > 0) {
          if (totalTokens / contextWindowTokens >= settings.hardClearRatio) {
            hardClearedToolResults++

            const oldTokens = estimateMessageTokens({
              role: 'toolResult',
              content: block.content
            } as Message)
            const newContent = [{ type: 'text', text: settings.hardClear.placeholder }]
            const newTokens = estimateMessageTokens({
              role: 'toolResult',
              content: newContent as ContentBlock[]
            } as Message)

            totalTokens -= oldTokens - newTokens

            didChange = true
            return { ...block, content: newContent }
          }
        }
      }
      return block
    })
    return didChange ? cloneMessage(msg, nextBlocks as ContentBlock[]) : msg
  })
  return { messages: output, hardClearedToolResults }
}

// ============== Layer 3: Message Drop ==============

function findAssistantCutoffIndex(messages: Message[], keepLastAssistants: number): number | null {
  if (keepLastAssistants <= 0) return messages.length
  let remaining = keepLastAssistants
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      remaining--
      if (remaining === 0) return i
    }
  }
  return null
}

function sliceWithinBudget(messages: Message[], budgetTokens: number): Message[] {
  const kept: Message[] = []
  let usedTokens = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(messages[i])
    if (usedTokens + tokens > budgetTokens && kept.length > 0) break
    kept.push(messages[i])
    usedTokens += tokens
  }
  return kept.reverse()
}

// ============== 主入口 ==============

export function pruneContextMessages(params: {
  messages: Message[]
  contextWindowTokens: number
  settings?: Partial<ContextPruningSettings>
}): PruneResult {
  const settings = resolvePruningSettings(params.settings)
  // 我们弃用 charWindow，全面改用基于 estimateMessagesTokens 的真实 Token 数量进行预算裁剪
  const currentTokens = estimateMessagesTokens(params.messages)
  const budgetTokens = Math.floor(params.contextWindowTokens * settings.maxHistoryShare)
  const isPrunable = makeToolPrunablePredicate(settings.tools)

  let current = params.messages
  let trimmedToolResults = 0
  let hardClearedToolResults = 0

  if (currentTokens / params.contextWindowTokens > settings.softTrimRatio) {
    const res = applySoftTrim(current, settings, isPrunable)
    current = res.messages
    trimmedToolResults = res.trimmedToolResults
  }

  if (estimateMessagesTokens(current) / params.contextWindowTokens > settings.hardClearRatio) {
    const res = applyHardClear(current, settings, isPrunable, params.contextWindowTokens)
    current = res.messages
    hardClearedToolResults = res.hardClearedToolResults
  }

  // ======== 统一修复提取断裂的 Tool 链条 ========
  // 无论是从旧数据库加载上来的脏数据，还是当前截断产生的孤儿，都需要做一把梳理
  const sanitizeOrphans = (msgs: Message[]): Message[] => {
    const keptToolCalls = new Set<string>()
    for (const m of msgs) {
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'toolCall' && b.id) keptToolCalls.add(b.id)
        }
      }
    }
    return msgs.filter((m) => {
      if (m.role === 'toolResult') {
        const tid = (m as any).toolCallId
        if (tid && !keptToolCalls.has(tid)) return false
      }
      return true
    })
  }

  const afterClearTokens = estimateMessagesTokens(current)
  if (afterClearTokens <= budgetTokens) {
    const finalCleaned = sanitizeOrphans(current)
    return {
      messages: finalCleaned,
      droppedMessages: current.filter((x) => !finalCleaned.includes(x)),
      trimmedToolResults,
      hardClearedToolResults,
      totalTokens: afterClearTokens,
      keptTokens: estimateMessagesTokens(finalCleaned),
      droppedTokens: estimateMessagesTokens(current) - estimateMessagesTokens(finalCleaned),
      budgetTokens
    }
  }

  const cutoffIndex = findAssistantCutoffIndex(current, settings.keepLastAssistants)
  const protectedMessages = current.slice(cutoffIndex ?? 0)
  const protectedTokens = estimateMessagesTokens(protectedMessages)

  let kept: Message[]
  if (protectedTokens > budgetTokens) {
    kept = sliceWithinBudget(current, budgetTokens)
  } else {
    kept = [...protectedMessages]
    let remainingTokens = budgetTokens - protectedTokens
    for (let i = (cutoffIndex ?? 0) - 1; i >= 0; i--) {
      const tokens = estimateMessageTokens(current[i])
      if (tokens > remainingTokens) break
      kept.unshift(current[i])
      remainingTokens -= tokens
    }
  }

  kept = sanitizeOrphans(kept)

  const keptSet = new Set(kept)
  const keptTokens = estimateMessagesTokens(kept)
  return {
    messages: kept,
    droppedMessages: current.filter((m) => !keptSet.has(m)),
    trimmedToolResults,
    hardClearedToolResults,
    totalTokens: afterClearTokens,
    keptTokens,
    droppedTokens: afterClearTokens - keptTokens,
    budgetTokens
  }
}
