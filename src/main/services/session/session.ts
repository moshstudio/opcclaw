/**
 * 会话管理器 (Session Manager)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import dayjs from 'dayjs'
import { newUUID, newShortId } from '@shared/utils/id'
import { acquireSessionWriteLock } from './session-write-lock'
import { JsonlStore } from '../common/jsonl'

import { type Message, type ContentBlock } from '@shared/types/agent'
import { normalizeMessage } from '@shared/utils/message'
export type { Message, ContentBlock }

// ============== Session Entry 结构 ==============

export const CURRENT_SESSION_VERSION = 3

export interface SessionHeaderEntry {
  type: 'session'
  version: number
  id: string
  timestamp: string
  cwd?: string
}

export interface SessionEntryBase {
  type: string
  id: string
  parentId: string | null
  timestamp: string
}

export interface MessageEntry extends SessionEntryBase {
  type: 'message'
  message: Message
}

export interface CompactionEntry extends SessionEntryBase {
  type: 'compaction'
  summary: string
  /** 压缩后保留的第一条消息 ID。如果为 ""，则表示后续暂无保留消息（全量压缩）。 */
  firstKeptId: string
  /** @deprecated Use firstKeptId instead */
  firstKeptEntryId?: string
  tokensBefore: number
}

export type SessionEntry = MessageEntry | CompactionEntry
export type SessionFileEntry = SessionHeaderEntry | SessionEntry

export const COMPACTION_SUMMARY_PREFIX = '在此之前的对话历史已被压缩，其核心摘要如下：\n\n<摘要>\n'
export const COMPACTION_SUMMARY_SUFFIX = '\n</摘要>'

export function createCompactionSummaryMessage(
  summary: string,
  timestamp?: string | number,
  id?: string
): Message {
  const resolvedTimestamp =
    typeof timestamp === 'string'
      ? new Date(timestamp).getTime()
      : typeof timestamp === 'number'
        ? timestamp
        : Date.now()
  return {
    id: id || newShortId(8),
    role: 'user',
    content: [
      {
        type: 'text',
        text: `${COMPACTION_SUMMARY_PREFIX}${summary}${COMPACTION_SUMMARY_SUFFIX}`
      }
    ],
    timestamp: Number.isFinite(resolvedTimestamp) ? resolvedTimestamp : Date.now()
  }
}

// ============== 会话管理器 ==============

export class SessionManager {
  private baseDir: string
  private states = new Map<string, SessionState>()

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  private getPath(sessionKey: string): string {
    const safeId = encodeURIComponent(sessionKey)
    return path.join(this.baseDir, `${safeId}.jsonl`)
  }

  private getLegacyPath(sessionKey: string): string {
    const safeId = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.baseDir, `${safeId}.jsonl`)
  }

  private createHeader(): SessionHeaderEntry {
    return {
      type: 'session',
      version: CURRENT_SESSION_VERSION,
      id: newUUID(),
      timestamp: dayjs().toISOString(),
      cwd: process.cwd()
    }
  }

  async load(
    sessionKey: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ messages: Message[]; hasMore: boolean; total: number }> {
    const state = await this.ensureState(sessionKey)
    const allMessages = buildSessionContext(state)
    const total = allMessages.length

    if (options?.limit !== undefined) {
      const offset = options.offset || 0
      const end = total - offset
      const start = Math.max(0, end - options.limit)
      return {
        messages: allMessages.slice(start, end),
        hasMore: start > 0,
        total
      }
    }

    return { messages: allMessages, hasMore: false, total }
  }

  async append(sessionKey: string, message: Message): Promise<void> {
    const state = await this.ensureState(sessionKey)
    const store = new JsonlStore<SessionFileEntry>(state.filePath)
    let entryId = message.id
    if (!entryId || state.byId.has(entryId)) {
      entryId = generateId(state.byId)
      message.id = entryId
    }

    const entry: MessageEntry = {
      type: 'message',
      id: entryId,
      parentId: state.leafId,
      timestamp: dayjs().toISOString(),
      message
    }
    state.entries.push(entry)
    state.byId.set(entry.id, entry)
    state.messageIdByRef.set(message, entry.id)
    state.leafId = entry.id

    const lock = await acquireSessionWriteLock({ sessionFile: state.filePath })
    try {
      if (!state.flushed) {
        await store.writeAll([state.header, ...state.entries])
        state.flushed = true
      } else {
        await store.append(entry)
      }
    } finally {
      await lock.release()
    }
  }

  async appendCompaction(
    sessionKey: string,
    summary: string,
    firstKeptId: string | undefined | null,
    tokensBefore: number
  ): Promise<string> {
    const state = await this.ensureState(sessionKey)
    const store = new JsonlStore<SessionFileEntry>(state.filePath)
    const entry: CompactionEntry = {
      type: 'compaction',
      id: generateId(state.byId),
      parentId: state.leafId,
      timestamp: dayjs().toISOString(),
      summary,
      firstKeptId: firstKeptId || '',
      tokensBefore
    }
    state.entries.push(entry)
    state.byId.set(entry.id, entry)
    state.leafId = entry.id

    const lock = await acquireSessionWriteLock({ sessionFile: state.filePath })
    try {
      if (!state.flushed) {
        await store.writeAll([state.header, ...state.entries])
        state.flushed = true
      } else {
        await store.append(entry)
      }
    } finally {
      await lock.release()
    }
    return entry.id
  }

  resolveMessageEntryId(sessionKey: string, message: Message): string | undefined {
    if (typeof message.content === 'string') {
      const trimmed = message.content.trimStart()
      if (trimmed.startsWith(COMPACTION_SUMMARY_PREFIX)) {
        return undefined
      }
    }
    const state = this.states.get(sessionKey)
    if (!state) return undefined

    const direct = state.messageIdByRef.get(message)
    if (direct) return direct

    for (const entry of state.entries) {
      if (entry.type !== 'message') continue
      if (entry.message.timestamp === message.timestamp && entry.message.role === message.role) {
        return entry.id
      }
    }
    return undefined
  }

  async get(sk: string): Promise<Message[]> {
    const state = this.states.get(sk)
    return state ? buildSessionContext(state) : []
  }

  async create(sk: string): Promise<void> {
    const state = await this.ensureState(sk)
    const store = new JsonlStore<SessionFileEntry>(state.filePath)
    const lock = await acquireSessionWriteLock({ sessionFile: state.filePath })
    try {
      await store.writeAll([state.header, ...state.entries])
      state.flushed = true
    } finally {
      await lock.release()
    }
  }

  async delete(sk: string): Promise<void> {
    this.states.delete(sk)
    const paths = [this.getPath(sk), this.getLegacyPath(sk)]
    for (const p of paths) {
      try {
        await fs.unlink(p)
      } catch {
        // ignore
      }
    }
  }

  async reset(sk: string): Promise<void> {
    const state = await this.ensureState(sk)
    state.entries = []
    state.byId.clear()
    state.leafId = null
    state.flushed = true
    const store = new JsonlStore<SessionFileEntry>(state.filePath)
    const lock = await acquireSessionWriteLock({ sessionFile: state.filePath })
    try {
      await store.writeAll([state.header])
    } finally {
      await lock.release()
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir)
      return files
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          try {
            return decodeURIComponent(f.replace('.jsonl', ''))
          } catch {
            return f.replace('.jsonl', '')
          }
        })
    } catch {
      return []
    }
  }

  async getMetadata(sessionKey: string): Promise<SessionHeaderEntry | undefined> {
    const cached = this.states.get(sessionKey)
    if (cached) return cached.header

    const filePath = this.getPath(sessionKey)
    const store = new JsonlStore<SessionFileEntry>(filePath)
    const header = await store.readFirstLine()
    if (header && isSessionHeader(header)) {
      return header
    }

    // 处理遗留路径
    const legacyPath = this.getLegacyPath(sessionKey)
    const legacyStore = new JsonlStore<SessionFileEntry>(legacyPath)
    const legacyHeader = await legacyStore.readFirstLine()
    if (legacyHeader && isSessionHeader(legacyHeader)) {
      return legacyHeader
    }

    return undefined
  }

  private async ensureState(sessionKey: string): Promise<SessionState> {
    const cached = this.states.get(sessionKey)
    if (cached) return cached

    const filePath = this.getPath(sessionKey)
    const legacyPath = this.getLegacyPath(sessionKey)
    let chosenPath = filePath
    let state: SessionState | undefined = undefined

    const tryLoad = async (p: string) => {
      try {
        const loaded = await loadSessionFile(p)
        if (loaded.header) {
          return buildStateFromEntries(p, loaded.header, loaded.entries)
        } else if (loaded.legacyMessages) {
          const s = buildStateFromLegacy(p, loaded.legacyMessages)
          if (s.entries.length > 0) {
            const store = new JsonlStore<SessionFileEntry>(p)
            await store.writeAll([s.header, ...s.entries])
            s.flushed = true
          }
          return s
        }
      } catch {
        return undefined
      }
      return undefined
    }

    state = await tryLoad(filePath)
    if (!state) {
      state = await tryLoad(legacyPath)
      if (state) chosenPath = legacyPath
    }

    if (!state) {
      const header = this.createHeader()
      state = {
        filePath: chosenPath,
        header,
        entries: [],
        byId: new Map<string, SessionEntry>(),
        messageIdByRef: new WeakMap<Message, string>(),
        leafId: null,
        flushed: false
      }
    }

    this.states.set(sessionKey, state)
    return state
  }
}

type SessionState = {
  filePath: string
  header: SessionHeaderEntry
  entries: SessionEntry[]
  byId: Map<string, SessionEntry>
  messageIdByRef: WeakMap<Message, string>
  leafId: string | null
  flushed: boolean
}

function generateId(byId: Map<string, any>): string {
  for (let i = 0; i < 100; i++) {
    const id = newShortId(8)
    if (!byId.has(id)) return id
  }
  return newShortId(8)
}

function isSessionHeader(value: unknown): value is SessionHeaderEntry {
  if (!value || typeof value !== 'object') return false
  const header = value as SessionHeaderEntry
  return header.type === 'session' && typeof header.id === 'string'
}

function isLegacyMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'toolResult') return false
  if (!('content' in msg)) return false
  return typeof msg.timestamp === 'number'
}

function buildSessionContext(state: SessionState): Message[] {
  if (state.entries.length === 0) return []

  const leaf = state.leafId ? state.byId.get(state.leafId) : state.entries[state.entries.length - 1]
  if (!leaf) return []

  const pathEntries: SessionEntry[] = []
  let current: SessionEntry | undefined = leaf
  while (current) {
    pathEntries.unshift(current)
    current = current.parentId ? state.byId.get(current.parentId) : undefined
  }

  let compaction: CompactionEntry | null = null
  for (const entry of pathEntries) {
    if (entry.type === 'compaction') {
      compaction = entry
    }
  }

  const messages: Message[] = []
  const appendMessage = (entry: SessionEntry) => {
    if (entry.type === 'message') {
      // 强制同步：Message ID 必须与 Session Node ID 一致，这是对话树追溯逻辑的基础
      entry.message.id = entry.id
      messages.push(entry.message)
    }
  }

  if (compaction) {
    const compactionIdx = pathEntries.findIndex(
      (entry) => entry.type === 'compaction' && entry.id === compaction!.id
    )

    let foundFirstKept = false
    let anchorTime = new Date(compaction.timestamp).getTime()

    const anchorId = compaction.firstKeptId || compaction.firstKeptEntryId
    for (let i = 0; i < compactionIdx; i++) {
      const entry = pathEntries[i]
      if (entry.id === anchorId) {
        anchorTime = new Date(entry.timestamp || compaction.timestamp).getTime()
        break
      }
    }

    // 严丝合缝：卡在一个恰好比所有旧历史都早 1 毫秒的时空
    messages.push(createCompactionSummaryMessage(compaction.summary, anchorTime - 1, compaction.id))

    for (let i = 0; i < compactionIdx; i++) {
      const entry = pathEntries[i]
      if (entry.id === anchorId) {
        foundFirstKept = true
      }
      if (foundFirstKept) {
        appendMessage(entry)
      }
    }
    for (let i = compactionIdx + 1; i < pathEntries.length; i++) {
      appendMessage(pathEntries[i])
    }
  } else {
    for (const entry of pathEntries) {
      appendMessage(entry)
    }
  }

  return messages
}

async function loadSessionFile(
  filePath: string
): Promise<{ header?: SessionHeaderEntry; entries: SessionEntry[]; legacyMessages?: Message[] }> {
  const store = new JsonlStore<any>(filePath)
  const rawEntries = await store.readAll()

  if (rawEntries.length === 0) {
    return { entries: [] }
  }

  const [first, ...rest] = rawEntries
  if (!isSessionHeader(first)) {
    const messages = rawEntries.filter(isLegacyMessage)
    return { entries: [], legacyMessages: messages }
  }

  const header: SessionHeaderEntry = {
    ...first,
    version: typeof first.version === 'number' ? first.version : CURRENT_SESSION_VERSION
  }
  const entries: SessionEntry[] = []

  for (const entry of rest) {
    if (!entry || typeof entry !== 'object') continue
    const typed = entry as SessionEntry
    if (!typed.type || typeof typed.id !== 'string') continue
    if (typed.type === 'message' && (typed as MessageEntry).message) {
      entries.push(typed)
      continue
    }
    if (
      typed.type === 'compaction' &&
      typeof (typed as CompactionEntry).summary === 'string' &&
      (typeof (typed as CompactionEntry).firstKeptId === 'string' ||
        typeof (typed as CompactionEntry).firstKeptEntryId === 'string')
    ) {
      entries.push(typed)
    }
  }

  return { header, entries }
}

function buildStateFromEntries(
  filePath: string,
  header: SessionHeaderEntry,
  entries: SessionEntry[]
): SessionState {
  const byId = new Map<string, SessionEntry>()
  const messageIdByRef = new WeakMap<Message, string>()
  let leafId: string | null = null

  for (const entry of entries) {
    byId.set(entry.id, entry)
    leafId = entry.id
    if (entry.type === 'message') {
      messageIdByRef.set(entry.message, entry.id)
    }
  }

  return {
    filePath,
    header,
    entries,
    byId,
    messageIdByRef,
    leafId,
    flushed: true
  }
}

function buildStateFromLegacy(filePath: string, messages: Message[]): SessionState {
  const header = {
    type: 'session',
    version: CURRENT_SESSION_VERSION,
    id: newUUID(),
    timestamp: dayjs().toISOString(),
    cwd: process.cwd()
  } satisfies SessionHeaderEntry
  const entries: SessionEntry[] = []
  const byId = new Map<string, SessionEntry>()
  const messageIdByRef = new WeakMap<Message, string>()
  let leafId: string | null = null

  for (const rawMessage of messages) {
    const piMessage = normalizeMessage(rawMessage)

    const entryId = newShortId(8)
    const entry: MessageEntry = {
      type: 'message',
      id: entryId,
      parentId: leafId,
      timestamp: dayjs().toISOString(),
      message: piMessage
    }
    entries.push(entry)
    byId.set(entry.id, entry)
    messageIdByRef.set(entry.message, entry.id)
    leafId = entry.id
  }

  return {
    filePath,
    header,
    entries,
    byId,
    messageIdByRef,
    leafId,
    flushed: false
  }
}
