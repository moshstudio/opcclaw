import type { SessionManager, Message } from '@main/services/session/session'
import { resolveSessionKey, parseAgentSessionKey } from '@main/services/session/session-key'
import type { MiniAgentEvent } from '../agent-events'

export interface SessionServiceOptions {
  agentId: string
  sessionManager: SessionManager
  emit: (event: MiniAgentEvent) => void
}

/**
 * Agent 会话业务逻辑服务
 *
 * 处理会话的创建、列表查询、重置与删除逻辑。
 */
export class AgentSessionService {
  private cachedSortedKeys: string[] | null = null

  constructor(private options: SessionServiceOptions) {}

  /**
   * 创建一个新会话，自动生成增量 ID (s1, s2, ...)
   */
  async create(): Promise<string> {
    this.cachedSortedKeys = null // 失效缓存
    const sessions = await this.options.sessionManager.list()
    let maxIdx = 0
    for (const key of sessions) {
      const parsed = parseAgentSessionKey(key)
      if (parsed && parsed.agentId === this.options.agentId) {
        const match = parsed.rest.match(/^s(\d+)$/)
        if (match) {
          const idx = parseInt(match[1], 10)
          if (idx > maxIdx) maxIdx = idx
        }
      }
    }
    const newId = `s${maxIdx + 1}`
    const fullKey = resolveSessionKey({ agentId: this.options.agentId, sessionKey: newId })
    await this.options.sessionManager.create(fullKey)

    this.options.emit({
      type: 'session:created',
      sessionKey: fullKey,
      agentId: this.options.agentId
    })
    return fullKey
  }

  public async reset(sessionKey: string) {
    await this.options.sessionManager.reset(sessionKey)
    this.options.emit({ type: 'session:reset', sessionKey, agentId: this.options.agentId })
  }

  public async delete(sessionKey: string) {
    this.cachedSortedKeys = null // 失效缓存
    await this.options.sessionManager.delete(sessionKey)
    this.options.emit({ type: 'session:deleted', sessionKey, agentId: this.options.agentId })
  }

  /**
   * 获取会话的历史消息
   */
  async getHistory(
    id: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ messages: Message[]; hasMore: boolean; total: number }> {
    return this.options.sessionManager.load(this.resolveKey(id), options)
  }

  /**
   * 列出所有可用的会话键，按创建时间降序排列 (最新创建在前)
   */
  async list(): Promise<string[]> {
    if (this.cachedSortedKeys) return this.cachedSortedKeys

    const sessionKeys = await this.options.sessionManager.list()
    if (sessionKeys.length === 0) return []

    // 过滤属于当前 agent 的 session
    const agentSessions = sessionKeys.filter((key) => {
      const parsed = parseAgentSessionKey(key)
      return parsed && parsed.agentId === this.options.agentId
    })

    // 获取每个 session 的元数据并带时间排序
    const withMetadata = await Promise.all(
      agentSessions.map(async (key) => {
        const meta = await this.options.sessionManager.getMetadata(key)
        return {
          key,
          time: meta ? new Date(meta.timestamp).getTime() : 0
        }
      })
    )

    const sorted = withMetadata.sort((a, b) => b.time - a.time).map((item) => item.key)
    this.cachedSortedKeys = sorted
    return sorted
  }

  /**
   * 辅助函数：解析 Agent 作用域下的最终 SessionKey
   */
  resolveKey(id: string): string {
    return resolveSessionKey({
      agentId: this.options.agentId,
      sessionId: id,
      sessionKey: id
    })
  }
}
