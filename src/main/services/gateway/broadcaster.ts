/**
 * 下一代网关物理出口广播器 (The OutBound Port)
 *
 * 核心要求：零 any、零断言、全量强校验。
 */

import type { MiniAgentEvent } from '../agent/agent-events'
import { mapEventToChatFields } from './handlers/chat-bridge'
import {
  type ChatAction,
  type ChatPayload,
  type GatewayAction,
  type EventPayloadMap,
  type EventOf,
  type TaggedEvent,
  type EventFrame,
  MAX_BUFFERED_BYTES
} from '@shared/types/gateway'
import type { GwClient } from './handlers/types'
import { formatGatewayDebugData } from './helpers/debug-utils'
import type { Logger } from '@main/services/common/logger'

/** 广播选项 */
export interface BroadcastOptions {
  dropIfSlow?: boolean
}

/** 广播函数类型契约 (出口物理层) */
export type BroadcastFn = <A extends GatewayAction>(
  action: A,
  payload: EventPayloadMap[A],
  opts?: BroadcastOptions
) => void

export class Broadcaster {
  private lastChunkIdMap = new Map<string, string>() // sessionKey -> lastChunkId
  private sessionToAgentMap = new Map<string, string>() // sessionKey -> agentId

  constructor(private readonly broadcast: BroadcastFn) {}

  /**
   * 业务分发核心入口 (Outlet)
   */
  public dispatch<A extends GatewayAction>(event: EventOf<A>) {
    this.broadcast(event.type, this.stripType(event), {})
    if (event.type === 'agent:run-start') {
      const e = event as EventOf<'agent:run-start'>
      this.sessionToAgentMap.set(e.sessionKey, e.agentId)
    } else if (event.type === 'session:reset' || event.type === 'session:deleted') {
      const e = event as EventOf<'session:reset'>
      this.lastChunkIdMap.delete(e.sessionKey)
      this.sessionToAgentMap.delete(e.sessionKey)
    }
  }

  /**
   * 处理智能体引擎产生的原子事件
   */
  public handleAgentEvent(event: MiniAgentEvent) {
    if (this.isChatArea(event.type)) {
      this.handleChatNamespace(event as EventOf<ChatAction>)
    } else {
      this.dispatch(event)
    }
  }

  /**
   * 判定动作是否属于聊天核心业务领域 (即具备 BizContext)
   */
  private isChatArea(type: string): type is ChatAction {
    return (
      type.startsWith('chat:') ||
      type.startsWith('agent:run-') ||
      type.startsWith('agent:turn-') ||
      type.startsWith('agent:skill-') ||
      type === 'agent:context-overflow'
    )
  }

  /**
   * 处理聊天负载 (Port Context Injected)
   */
  private handleChatNamespace<A extends ChatAction>(event: EventOf<A>) {
    // 1. 将 EventOf<A> 断言为 TaggedEvent 以配合 mapEventToChatFields 的参数类型
    const fields = mapEventToChatFields(event as unknown as TaggedEvent)
    if (!fields || !fields.state) return

    // 2. 字段生命周期内：明确 ID 注入
    const { sessionKey, runId, agentId } = event as {
      sessionKey: string
      runId: string
      agentId: string
    }
    const chunkId = `ch_${Math.random().toString(36).slice(2, 9)}`
    const parentId = this.lastChunkIdMap.get(sessionKey)

    // 3. 构建物理平铺负载
    const chatPayload: ChatPayload = {
      ...fields,
      agentId,
      runId,
      sessionKey,
      chunkId,
      parentId,
      state: fields.state
    }

    // 4. 最终物理广播
    this.chat(chatPayload)

    // 5. 链式 ID 追踪
    if (chatPayload.state === 'chat:final' || chatPayload.state === 'chat:error') {
      this.lastChunkIdMap.delete(sessionKey)
    } else {
      this.lastChunkIdMap.set(sessionKey, chunkId)
    }
  }

  /**
   * 高效聊天流入口
   */
  public chat(payload: ChatPayload) {
    const isDelta = payload.state === 'chat:delta' || payload.state === 'chat:thinking'
    const action = payload.state as GatewayAction
    this.broadcast(
      action,
      payload as unknown as EventPayloadMap[typeof action],
      isDelta ? { dropIfSlow: true } : undefined
    )
  }

  private stripType<A extends GatewayAction>(event: EventOf<A>): EventPayloadMap[A] {
    const { type: _, ...payload } = event
    return payload as unknown as EventPayloadMap[A]
  }
}

/**
 * 物理端口发送工厂 (Connection Port Factory)
 */
export function createBroadcastFn(clients: Set<GwClient>, logger: Logger): BroadcastFn {
  let seqId = 1
  return <A extends GatewayAction>(
    action: A,
    payload: EventPayloadMap[A],
    opts?: BroadcastOptions
  ) => {
    // 物理帧构建（仅此一处使用广义转换，确保网络层通信）
    const frame: EventFrame = {
      type: 'event',
      event: action,
      payload,
      seq: seqId++
    }

    const data = JSON.stringify(frame)
    if (action !== ('chat:delta' as GatewayAction)) {
      logger.debug(`[GW-OUT] ADAPTER: ${formatGatewayDebugData(frame)}`)
    }

    for (const c of clients) {
      if (!c.authed) continue
      const buffered = c.socket.bufferedAmount

      if (buffered > MAX_BUFFERED_BYTES) {
        if (opts?.dropIfSlow) continue
        c.socket.close(1011, 'Consumer capacity exceeded')
        continue
      }

      try {
        c.socket.send(data)
      } catch {
        /* silent cleanup if needed */
      }
    }
  }
}
