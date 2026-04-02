import { newShortId } from '@shared/utils/id'
import type { SessionManager } from '@main/services/session/session'
import { normalizeAgentId } from '@main/services/session/session-key'
import type { MiniAgentEvent } from '../agent-events'

export interface SubagentOptions {
  parentSessionKey: string
  task: string
  label?: string
  cleanup?: 'keep' | 'delete'
}

export type RunAgentFn = (
  sessionKey: string,
  userMessage?: string
) => Promise<{
  runId?: string
  text: string
}>

/**
 * 子智能体服务
 *
 * 管理子智能体的生命周期，包括启动、结果反馈和会话清理。
 */
export class SubagentService {
  constructor(
    private agentId: string,
    private sessions: SessionManager,
    private runAgent: RunAgentFn,
    private emit: (event: MiniAgentEvent) => void,
    private steer: (sessionKey: string, text: string) => void,
    private onSubagentResult: (parentSessionKey: string) => void
  ) {}

  /**
   * 启动子智能体
   */
  async spawn(params: SubagentOptions): Promise<{ runId: string; sessionKey: string }> {
    const childSessionKey = this.buildSubagentSessionKey(this.agentId)

    // 1. 初始化存储
    await this.sessions.create(childSessionKey)

    // 2. 广播创建事件 (通知前端更新列表)
    this.emit({
      type: 'session:created',
      sessionKey: childSessionKey,
      agentId: this.agentId
    })

    // 3. 启动异步运行链
    this.executeSubagentTask(params, childSessionKey).catch((err) => {
      console.error(`[SubagentService:${this.agentId}] Fatal runner error:`, err)
    })

    return {
      runId: childSessionKey,
      sessionKey: childSessionKey
    }
  }

  /**
   * 实际执行子任务并处理结果
   */
  private async executeSubagentTask(
    params: SubagentOptions,
    childSessionKey: string
  ): Promise<void> {
    try {
      const result = await this.runAgent(childSessionKey, params.task)

      // 1. 注入 Steering
      const summary = result.text.slice(0, 1000)
      const steerText = `> [!NOTE] 子代理总结: ${params.label ? `(${params.label}) ` : ''}${params.task}\n> \n> ${summary}`
      this.steer(params.parentSessionKey, steerText)

      // 3. 通知宿主 Agent 处理后续
      this.onSubagentResult(params.parentSessionKey)

      // 4. 可选清理
      if (params.cleanup === 'delete') {
        await this.sessions.delete(childSessionKey)
        this.emit({ type: 'session:deleted', sessionKey: childSessionKey, agentId: this.agentId })
      }
    } catch (err) {
      await this.handleSubagentError(params, err)
    }
  }

  private async handleSubagentError(params: SubagentOptions, err: any): Promise<void> {
    const steerText = `> [!CAUTION] Subagent Error: ${params.label ? `(${params.label}) ` : ''}${params.task}\n> \n> Error: ${err instanceof Error ? err.message : String(err)}`
    this.steer(params.parentSessionKey, steerText)

    this.onSubagentResult(params.parentSessionKey)
  }

  private buildSubagentSessionKey(agentId: string): string {
    const id = newShortId(6)
    return `${normalizeAgentId(agentId)}:subagent:${id}`
  }
}
