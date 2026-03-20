import { newShortId } from '@shared/utils/id.js'
import type { SessionManager, Message } from '@main/services/session/session'
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

    // 启动异步运行链
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

      // 1. 整理并在父级会话注入总结消息
      const summary = result.text.slice(0, 600)
      const summaryMsg: Message = {
        id: `sa_sum_${newShortId(8)}`,
        role: 'user',
        content: [
          {
            type: 'subagent',
            subagent: {
              task: params.task,
              status: 'success',
              summary,
              label: params.label,
              agentId: this.agentId,
              runId: result.runId,
              childSessionKey
            }
          }
        ],
        timestamp: Date.now()
      }

      await this.sessions.append(params.parentSessionKey, summaryMsg)

      // 2. 发出用户消息事件，通知前端更新
      this.emit({
        type: 'chat:user-message',
        runId: result.runId || childSessionKey,
        sessionKey: params.parentSessionKey,
        message: summaryMsg
      } as any)

      // 3. 注入 Steering
      const steerText = `[Subagent Summary] ${params.label ? `(${params.label}) ` : ''}${params.task}\n\n${summary}`
      this.steer(params.parentSessionKey, steerText)

      // 4. 通知宿主 Agent 处理后续
      this.onSubagentResult(params.parentSessionKey)

      // 5. 可选清理
      if (params.cleanup === 'delete') {
        await this.sessions.delete(childSessionKey)
        this.emit({ type: 'session:deleted', sessionKey: childSessionKey })
      }
    } catch (err) {
      await this.handleSubagentError(params, childSessionKey, err)
    }
  }

  private async handleSubagentError(
    params: SubagentOptions,
    childSessionKey: string,
    err: any
  ): Promise<void> {
    const errorMsg: Message = {
      id: `sa_err_${newShortId(8)}`,
      role: 'user',
      content: [
        {
          type: 'subagent',
          subagent: {
            task: params.task,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            label: params.label,
            agentId: this.agentId,
            childSessionKey
          }
        }
      ],
      timestamp: Date.now()
    }

    await this.sessions.append(params.parentSessionKey, errorMsg)

    this.emit({
      type: 'chat:user-message',
      runId: childSessionKey,
      sessionKey: params.parentSessionKey,
      message: errorMsg
    } as any)

    const steerText = `[Subagent Error] ${params.label ? `(${params.label}) ` : ''}${params.task}\n\nError: ${err instanceof Error ? err.message : String(err)}`
    this.steer(params.parentSessionKey, steerText)

    this.onSubagentResult(params.parentSessionKey)
  }

  private buildSubagentSessionKey(agentId: string): string {
    const id = newShortId(6)
    return `agent:${normalizeAgentId(agentId)}:subagent:${id}`
  }
}
