import type { MiniAgentEvent } from '../agent/agent-events.js'
import type { ChatPayload, AgentEventPayload, GatewayEvent } from '@shared/types/gateway'

import type { GwClient } from './handlers/types.js'
import { type EventFrame, MAX_BUFFERED_BYTES } from './protocol.js'

/**
 * 广播函数签名
 */
export type BroadcastFn = (
  event: GatewayEvent,
  payload: any,
  opts?: { dropIfSlow?: boolean }
) => void

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
   * 广播模型列表更新 (models 频道)
   */
  modelsList(models: any[], defaultModelId: string | null) {
    this.broadcast('models', { type: 'models.list', models, defaultModelId })
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

/**
 * 创建底层广播函数 (对齐 openclaw server-broadcast.ts)
 *
 * 逻辑：
 * 1. seq 全局递增。
 * 2. dropIfSlow: 非关键事件（tick、delta）跳过慢消费者而非断开。
 * 3. 强制关闭: 关键事件时，慢消费者直接断开防止内存泄漏。
 */
export function createBroadcastFn(clients: Set<GwClient>): BroadcastFn {
  let seq = 0
  return (event: GatewayEvent, payload: any, opts?: { dropIfSlow?: boolean }) => {
    const frame = { type: 'event', event, payload, seq: ++seq } as EventFrame

    const data = JSON.stringify(frame)

    // if (event !== 'tick') {
    //   console.log(`[GW-OUT] Broadcast: ${event} seq=${frame.seq}`, payload)
    // }

    for (const c of clients) {
      if (!c.authed) continue
      const slow = c.socket.bufferedAmount > MAX_BUFFERED_BYTES
      if (slow && opts?.dropIfSlow) {
        // 非关键事件：跳过慢消费者
        continue
      }
      if (slow) {
        // 关键事件：强制关闭慢消费者防止内存泄漏
        c.socket.close(1008, 'slow consumer')
        continue
      }
      try {
        c.socket.send(data)
      } catch {
        /* 忽略已断开的连接 */
      }
    }
  }
}
