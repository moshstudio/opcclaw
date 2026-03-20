import type { SessionManager, Message } from '@main/services/session/session'
import { installSessionToolResultGuard } from '@main/services/session/session-tool-result-guard'

/**
 * Agent 状态管理器
 *
 * 管理运行中的任务、会话映射、中断控制器以及动态指令队列 (Steering Queue)。
 * 使 Agent 主类免于直接处理复杂的状态清理逻辑。
 */
export class AgentStateManager {
  /** 运行中的 AbortController 映射 (runId → controller) */
  private runAbortControllers = new Map<string, AbortController>()

  /** Session 与 RunId 的映射关系 (sessionKey → Set<runId>) */
  private sessionRunIds = new Map<string, Set<string>>()

  /** Steering 消息队列 (sessionKey → messages[]) */
  private steeringQueues = new Map<string, string[]>()

  /** 工具结果守卫（用于自动补全工具结果，防止 API 调用冲突） */
  private toolResultGuard: ReturnType<typeof installSessionToolResultGuard>

  constructor(sessions: SessionManager) {
    this.toolResultGuard = installSessionToolResultGuard(sessions)
  }

  /**
   * 注册一个新的任务运行状态
   */
  startRun(sessionKey: string, runId: string): AbortSignal {
    const controller = new AbortController()
    this.runAbortControllers.set(runId, controller)

    if (!this.sessionRunIds.has(sessionKey)) {
      this.sessionRunIds.set(sessionKey, new Set())
    }
    this.sessionRunIds.get(sessionKey)!.add(runId)

    if (!this.steeringQueues.has(sessionKey)) {
      this.steeringQueues.set(sessionKey, [])
    }

    return controller.signal
  }

  /**
   * 清理已完成的任务运行状态
   */
  async endRun(sessionKey: string, runId: string): Promise<void> {
    this.runAbortControllers.delete(runId)

    const runIds = this.sessionRunIds.get(sessionKey)
    if (runIds) {
      runIds.delete(runId)
      if (runIds.size === 0) {
        this.sessionRunIds.delete(sessionKey)
      }
    }

    // 在运行结束时，确保刷掉所有挂起的工具结果
    await this.toolResultGuard.flushPendingToolResults(sessionKey)
  }

  /**
   * 中断指定的任务或所有运行中的任务
   */
  abort(runId?: string): void {
    if (runId) {
      this.runAbortControllers.get(runId)?.abort()
    } else {
      for (const controller of this.runAbortControllers.values()) {
        controller.abort()
      }
    }
  }

  /**
   * 中断指定会话的所有运行任务
   */
  abortSession(sessionKey: string): void {
    const runIds = this.sessionRunIds.get(sessionKey)
    if (runIds) {
      for (const rid of runIds) {
        this.abort(rid)
      }
    }
  }

  /**
   * 向运行中会话注入 Steering 指令
   */
  steer(sessionKey: string, text: string): void {
    const queue = this.steeringQueues.get(sessionKey)
    if (queue) {
      queue.push(text)
    } else {
      this.steeringQueues.set(sessionKey, [text])
    }
  }

  /**
   * 提取并清空会话的 Steering 消息
   */
  async drainSteering(sessionKey: string): Promise<Message[]> {
    const queue = this.steeringQueues.get(sessionKey)
    if (!queue || queue.length === 0) return []

    const drained = queue.splice(0)
    return drained.map((text) => ({
      role: 'user' as const,
      content: text,
      timestamp: Date.now()
    }))
  }

  /**
   * 检查会话当前是否有活动的运行任务
   */
  isSessionActive(sessionKey: string): boolean {
    const runIds = this.sessionRunIds.get(sessionKey)
    return (runIds?.size ?? 0) > 0
  }

  /**
   * 获取工具结果守卫实例
   */
  getToolResultGuard() {
    return this.toolResultGuard
  }
}
