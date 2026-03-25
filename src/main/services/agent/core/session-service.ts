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
  constructor(private options: SessionServiceOptions) {}

  /**
   * 创建一个新会话，自动生成增量 ID (s1, s2, ...)
   */
  async create(): Promise<string> {
    const sessions = await this.options.sessionManager.list()
    let maxIdx = 0
    for (const key of sessions) {
      const parsed = parseAgentSessionKey(key)
      if (parsed && parsed.agentId === this.options.agentId) {
        // 解析是否有以 's' 开头的数字序号
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
    this.options.emit({ type: 'session:reset', sessionKey })
  }

  public async delete(sessionKey: string) {
    await this.options.sessionManager.delete(sessionKey)
    this.options.emit({ type: 'session:deleted', sessionKey })
  }

  /**
   * 获取会话的历史消息
   */
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
   * 列出所有可用的会话键
   */
  async list(): Promise<string[]> {
    return this.options.sessionManager.list()
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
