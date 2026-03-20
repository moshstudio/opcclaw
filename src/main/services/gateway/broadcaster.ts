import type { MiniAgentEvent } from '../agent/agent-events.js'
import { mapEventToChatFields } from './handlers/chat-bridge.js'
import type {
  ChatPayload,
  AgentEventPayload,
  GatewayEvent,
  ModelsPayload,
  TickPayload,
  ShutdownPayload
} from '@shared/types/gateway'
import type { GwClient } from './handlers/types.js'
import { type EventFrame, MAX_BUFFERED_BYTES } from './protocol.js'

/**
 * 下一代网关业务事件模型 (BEM)
 * 采用 namespace:action 风格，彻底舍弃下划线风格
 */
export type GatewayBusinessEvent =
  | { type: 'agent:created'; agentId: string }
  | { type: 'agent:updated'; agentId: string }
  | { type: 'agent:deleted'; agentId: string }
  | { type: 'session:created'; agentId: string; sessionKey: string }
  | { type: 'session:reset'; agentId: string; sessionKey: string }
  | { type: 'session:deleted'; agentId: string; sessionKey: string }
  | { type: 'config:saved'; path: string }
  | { type: 'models:list'; models: any[]; defaultModelId: string | null }
  | { type: 'system:tick'; ts: number }
  | { type: 'system:shutdown'; reason: string; restartExpectedMs: number | null }

/**
 * 广播器发送选项
 */
export interface BroadcastOptions {
  dropIfSlow?: boolean
}

/**
 * 广播函数签名
 */
export type BroadcastFn = (channel: GatewayEvent, payload: any, opts?: BroadcastOptions) => void

/**
 * 统一网关分流器 (Gateway Dispatcher)
 *
 * 全新实现：直接分发 BEM (Business Event Model) 数据，不进行任何兼容性转换。
 */
export class Broadcaster {
  private lastChunkIdMap = new Map<string, string>() // sessionKey -> lastChunkId

  constructor(private readonly broadcast: BroadcastFn) {}

  /**
   * 业务分发核心入口 (BEM)
   */
  public dispatch(event: GatewayBusinessEvent) {
    switch (event.type) {
      case 'session:reset':
      case 'session:deleted':
        this.resetSession((event as any).sessionKey)
        this.emit('agent', event as AgentEventPayload)
        break

      case 'agent:created':
      case 'agent:updated':
      case 'agent:deleted':
      case 'session:created':
      case 'config:saved':
        this.emit('agent', event as AgentEventPayload)
        break

      case 'models:list':
        this.emit('models', {
          type: 'models:list',
          models: event.models,
          defaultModelId: event.defaultModelId
        } as ModelsPayload)
        break

      case 'system:tick':
        this.emit('system:tick', { ts: event.ts } as TickPayload, { dropIfSlow: true })
        break

      case 'system:shutdown':
        this.emit('system:shutdown', {
          reason: event.reason,
          restartExpectedMs: event.restartExpectedMs
        } as ShutdownPayload)
        break
    }
  }

/**
   * 处理智能体引擎产生的 MiniAgentEvent 并路由到对应的网关频道。
   * 支持 namespace:action 格式自动化分发。
   */
  public handleAgentEvent(event: MiniAgentEvent) {
    const sessionKey = (event as any).sessionKey || 'global'
    const [ns] = event.type.split(':')

    // 1. 聊天频道特殊逻辑 (管理消息 ID 连)
    if (ns === 'chat') {
      const payload = mapEventToChatFields(event)
      if (payload) {
        const chunkId = `chunk_${Math.random().toString(36).slice(2, 11)}`
        const parentId = this.lastChunkIdMap.get(sessionKey)

        this.chat({
          sessionKey,
          chunkId,
          parentId,
          ...payload
        } as any)

        if (payload.state === 'final' || payload.state === 'error') {
          this.lastChunkIdMap.delete(sessionKey)
        } else {
          this.lastChunkIdMap.set(sessionKey, chunkId)
        }
      }
      return
    }

    // 2. 智能体生命周期频道
    if (ns === 'agent' || ns === 'session') {
      if (event.type === 'session:reset' || event.type === 'session:deleted') {
        this.resetSession((event as any).sessionKey)
      }
      this.emit('agent', event as AgentEventPayload)
      return
    }

    // 3. 通用转发/兜底 (如 future notification 等频道)
    this.emit((ns || 'system') as any, event)
  }

  /**
   * 聊天流桥接 (高性能专用)
   */
  public chat(payload: ChatPayload) {
    const isDelta = payload.state === 'delta' || payload.state === 'thinking'
    this.emit('chat', payload, isDelta ? { dropIfSlow: true } : undefined)
  }

  /**
   * 重置会话 ID 链
   */
  public resetSession(sessionKey: string) {
    this.lastChunkIdMap.delete(sessionKey)
  }

  private emit(channel: GatewayEvent, payload: any, opts?: BroadcastOptions) {
    this.broadcast(channel, payload, opts)
  }
}

/**
 * 创建底层广播函数 (对齐高并发场景)
 */
export function createBroadcastFn(clients: Set<GwClient>): BroadcastFn {
  let seq = 0
  return (event: GatewayEvent, payload: any, opts?: BroadcastOptions) => {
    const frame = { type: 'event', event, payload, seq: ++seq } as EventFrame
    const data = JSON.stringify(frame)

    for (const c of clients) {
      if (!c.authed) continue
      const slow = c.socket.bufferedAmount > MAX_BUFFERED_BYTES

      if (slow && opts?.dropIfSlow) continue
      if (slow) {
        c.socket.close(1008, 'slow consumer')
        continue
      }

      try {
        c.socket.send(data)
      } catch {
        /* ignore */
      }
    }
  }
}
