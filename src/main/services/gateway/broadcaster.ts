import type { MiniAgentEvent } from '../agent/agent-events.js'
import type { ChatPayload, AgentEventPayload } from '@shared/types/gateway'

/**
 * 广播函数签名
 */
export type BroadcastFn = (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void

/**
 * 统一广播管理器
 *
 * 职责：
 * 1. 集中定义所有网关广播事件及其 Payload 结构。
 * 2. 提供语义化方法，确保类型安全。
 * 3. 屏蔽底层 ctx.broadcast 的复杂性（如同 dropIfSlow 的逻辑）。
 */
export class Broadcaster {
  constructor(private readonly broadcast: BroadcastFn) {}

  /**
   * 桥接智能体内部事件到 Gateway 的 'agent' 频道
   */
  agentBridge(
    agentId: string,
    sessionKey: string,
    runId: string | undefined,
    event: MiniAgentEvent
  ) {
    this.broadcast('agent', {
      agentId,
      sessionKey,
      runId,
      ...event
    } as AgentEventPayload)
  }

  /**
   * 广播会话生命周期事件 (agent 频道)
   */
  sessionEvent(
    type: 'session_created' | 'session_reset' | 'session_deleted',
    agentId: string,
    sessionKey: string
  ) {
    this.broadcast('agent', { type, agentId, sessionKey } as AgentEventPayload)
  }

  /**
   * 广播智能体管理事件 (agent 频道)
   */
  agentLifecycle(type: 'agent_created' | 'agent_updated' | 'agent_deleted', agentId: string) {
    this.broadcast('agent', { type, agentId } as AgentEventPayload)
  }

  /**
   * 广播配置保存事件 (agent 频道)
   */
  bootstrapSaved(path: string) {
    this.broadcast('agent', { type: 'bootstrap_saved', path } as AgentEventPayload)
  }

  /**
   * 广播聊天状态 (chat 频道)
   *
   * @param payload 聊天负载
   */
  chat(payload: ChatPayload) {
    const isDelta = payload.state === 'delta'
    // 流式增量内容在网络拥塞时优先丢弃，且必须是 chat 频道
    this.broadcast('chat', payload, isDelta ? { dropIfSlow: true } : undefined)
  }

  /**
   * 广播系统级心跳
   */
  tick(ts: number) {
    this.broadcast('tick', { ts }, { dropIfSlow: true })
  }

  /**
   * 广播关机/重启预警
   */
  shutdown(reason: string, restartExpectedMs: number | null) {
    this.broadcast('shutdown', { reason, restartExpectedMs })
  }
}
