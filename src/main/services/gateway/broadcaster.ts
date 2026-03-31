import type { AIModelConfig } from '@shared/types/models'
import type { MiniAgentEvent } from '../agent/agent-events'
import { mapEventToChatFields } from './handlers/chat-bridge'
import type {
  ChatPayload,
  AgentEventPayload,
  GatewayEvent,
  ModelsPayload,
  TickPayload,
  ShutdownPayload,
  HeartbeatEventPayload,
  HeartbeatTaskStatus
} from '@shared/types/gateway'
import type { GwClient } from './handlers/types'
import { type EventFrame, MAX_BUFFERED_BYTES } from './protocol'
import { formatGatewayDebugData } from './helpers/debug-utils'
import type { Logger } from '@main/services/common/logger'

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
  | { type: 'models:list'; models: AIModelConfig[]; defaultModelId: string | null }
  | { type: 'system:tick'; ts: number }
  | { type: 'system:shutdown'; reason: string; restartExpectedMs: number | null }
  | { type: 'heartbeat:created'; agentId: string; status: HeartbeatTaskStatus }
  | { type: 'heartbeat:updated'; agentId: string; status: HeartbeatTaskStatus }
  | { type: 'heartbeat:deleted'; agentId: string }
  | { type: 'heartbeat:triggered'; agentId: string; status: HeartbeatTaskStatus }

/**
 * 广播器发送选项
 */
export interface BroadcastOptions {
  dropIfSlow?: boolean
}

/**
 * 广播负载联合类型
 */
export type BroadcastPayload =
  | ChatPayload
  | AgentEventPayload
  | ModelsPayload
  | TickPayload
  | ShutdownPayload
  | HeartbeatEventPayload
  | MiniAgentEvent // 用于转发原始事件时

/**
 * 广播函数签名
 */
export type BroadcastFn = (
  channel: GatewayEvent | (string & {}),
  payload: BroadcastPayload,
  opts?: BroadcastOptions
) => void

/**
 * 统一网关分流器 (Gateway Dispatcher)
 *
 * 全新实现：直接分发 BEM (Business Event Model) 数据，不进行任何兼容性转换。
 */
export class Broadcaster {
  private lastChunkIdMap = new Map<string, string>() // sessionKey -> lastChunkId
  private sessionToAgentMap = new Map<string, string>() // sessionKey -> agentId

  constructor(private readonly broadcast: BroadcastFn) {}

  /**
   * 业务分发核心入口 (BEM)
   */
  public dispatch(event: GatewayBusinessEvent) {
    const [ns] = event.type.split(':')

    switch (ns) {
      case 'agent':
      case 'session':
        this.handleLifecycleNamespace(event as any) // 借用生命周期处理器
        break

      case 'models':
        if (event.type === 'models:list') {
          this.emit('models', {
            type: 'models:list',
            models: event.models,
            defaultModelId: event.defaultModelId
          } as ModelsPayload)
        }
        break

      case 'system':
        this.handleSystemNamespace(event)
        break

      case 'heartbeat':
        this.emit('heartbeat', event as HeartbeatEventPayload)
        break

      case 'config':
        if (event.type === 'config:saved') {
          this.emit('agent', event as AgentEventPayload)
        }
        break
    }
  }

  /**
   * 处理系统命名空间的事件
   */
  private handleSystemNamespace(event: GatewayBusinessEvent) {
    switch (event.type) {
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
    const [ns] = event.type.split(':')

    switch (ns) {
      case 'chat':
        this.handleChatNamespace(event)
        break

      case 'agent':
      case 'session':
        this.handleLifecycleNamespace(event)
        break

      default:
        // 通用转发/兜底 (如 future notification 等频道)
        this.emit((ns || 'system') as GatewayEvent, event)
    }
  }

  /**
   * 处理聊天命名空间的事件
   */
  private handleChatNamespace(event: MiniAgentEvent) {
    const payload = mapEventToChatFields(event)
    if (!payload) return

    // chat 命名空间下的事件均持有 sessionKey 和 runId
    const { sessionKey, runId } = event as Extract<
      MiniAgentEvent,
      { sessionKey: string; runId: string }
    >

    const chunkId = `chunk_${Math.random().toString(36).slice(2, 11)}`
    const parentId = this.lastChunkIdMap.get(sessionKey)

    // 尝试从事件中提取 agentId，若无则使用缓存
    const agentId =
      ('agentId' in event ? event.agentId : this.sessionToAgentMap.get(sessionKey)) || ''

    this.chat({
      agentId,
      runId,
      sessionKey,
      chunkId,
      parentId,
      ...payload
    } as ChatPayload)

    // 状态机管理：结束或错误时重置 ID 链
    if (payload.state === 'final' || payload.state === 'error') {
      this.lastChunkIdMap.delete(sessionKey)
    } else {
      this.lastChunkIdMap.set(sessionKey, chunkId)
    }
  }

  /**
   * 处理生命周期命名空间的事件 (agent:* / session:*)
   */
  private handleLifecycleNamespace(event: MiniAgentEvent) {
    const [ns] = event.type.split(':')

    // 1. 特殊业务逻辑处理
    switch (event.type) {
      case 'agent:run-start':
        this.sessionToAgentMap.set(event.sessionKey, event.agentId)
        break

      case 'session:reset':
      case 'session:deleted':
        this.lastChunkIdMap.delete(event.sessionKey)
        this.sessionToAgentMap.delete(event.sessionKey)
        break
    }

    // 2. 统一广播
    this.emit(ns as GatewayEvent, event as AgentEventPayload)
  }

  /**
   * 聊天流桥接 (高性能专用)
   */
  public chat(payload: ChatPayload) {
    const isDelta = payload.state === 'delta' || payload.state === 'thinking'
    this.emit('chat', payload, isDelta ? { dropIfSlow: true } : undefined)
  }

  private emit(
    channel: GatewayEvent | (string & {}),
    payload: BroadcastPayload,
    opts?: BroadcastOptions
  ) {
    this.broadcast(channel, payload, opts)
  }
}

/**
 * 创建底层广播函数 (对齐高并发场景)
 */
export function createBroadcastFn(clients: Set<GwClient>, logger: Logger): BroadcastFn {
  let seq = 0
  return (
    event: GatewayEvent | (string & {}),
    payload: BroadcastPayload,
    opts?: BroadcastOptions
  ) => {
    const frame = { type: 'event', event, payload, seq: ++seq } as EventFrame
    const data = JSON.stringify(frame)

    logger.debug(`[GW-OUT] BROADCAST: ${formatGatewayDebugData(frame)}`)

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
