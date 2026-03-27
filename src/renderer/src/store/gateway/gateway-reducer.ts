import {
  ChatPayload,
  AgentEventPayload,
  ModelsPayload,
  TickPayload,
  ShutdownPayload
} from '@shared/types/gateway'
import { Message, ChatStatus, Skill } from '@shared/types/agent'
import { applyChatEvent, SessionPatch } from './chat-handler'
import { applySessionLifecycleEvent, SessionStorePatch } from './session-handler'

// ============================================================================
// 1. 系统核心类型定义 (商用级扩展)
// ============================================================================

/** 网关广播全量载荷联合类型 */
export type GatewayPayload =
  | ChatPayload
  | AgentEventPayload
  | ModelsPayload
  | TickPayload
  | ShutdownPayload

/**
 * 最小化 Store 状态接口定义
 * 包含：消息映射、状态机、模型池、错误追踪
 */
export interface MinimalChatStore {
  // 会话领域
  sessions: Record<string, Message[]>
  allSessions: Record<string, string[]>
  chatStatuses: Record<string, ChatStatus>
  errorMessages: Record<string, string | null>
  toolResultsMap?: Record<string, Record<string, unknown>>
  interactionMap?: Record<string, ChatPayload['interaction'] | null>
  skills?: Record<string, Skill[]>

  // 资源领域 (预留/扩展)
  models?: ModelsPayload['models']
  defaultModelId?: string | null

  // 系统领域
  lastTick?: number
  shutdownReason?: string | null
}

const isChatPayload = (p: GatewayPayload): p is ChatPayload => 'state' in p
const isAgentPayload = (p: GatewayPayload): p is AgentEventPayload =>
  'type' in p && typeof p.type === 'string' && p.type.startsWith('agent:')

const isSessionPayload = (p: GatewayPayload): p is AgentEventPayload =>
  'type' in p && typeof p.type === 'string' && p.type.startsWith('session:')

const isModelsPayload = (p: GatewayPayload): p is ModelsPayload =>
  'type' in p && p.type === 'models:list'

// ============================================================================
// 2. 统一网关事件处理器 (中央 Reducer)
// ============================================================================

/**
 * applyGatewayEvent - Store 状态更新的中枢神经
 * 职责：解析网关原始帧，分发给领域驱动模块，产出原子级的状态补丁。
 */
export const applyGatewayEvent = (
  state: MinimalChatStore,
  payload: GatewayPayload,
  event: 'chat' | 'agent' | 'session' | 'models' | 'system:tick' | 'system:shutdown'
): Partial<MinimalChatStore> => {
  // 核心元数据提取
  let updates: Partial<MinimalChatStore> = {}

  // --- 区域 I: 领域驱动调度 (Domain-Driven Dispatch) ---

  switch (event) {
    // 1. 智能体领域 (Agent Domain)
    case 'agent': {
      if (isAgentPayload(payload)) {
        updates = applySessionLifecycleEvent(
          payload,
          state as unknown as SessionStorePatch
        ) as Partial<MinimalChatStore>
      }
      break
    }

    // 2. 会话领域 (Session Domain)
    case 'session': {
      if (isSessionPayload(payload)) {
        updates = applySessionLifecycleEvent(
          payload,
          state as unknown as SessionStorePatch
        ) as Partial<MinimalChatStore>
      }
      break
    }

    // 3. 消息流与流式渲染 (Streaming & Content)
    case 'chat': {
      if (isChatPayload(payload) && payload.sessionKey) {
        const sk = payload.sessionKey
        // 构建单次渲染的基准 Patch
        const basePatch: SessionPatch = {
          messages: (updates.sessions?.[sk] || state.sessions[sk] || []) as Message[],
          status: (updates.chatStatuses?.[sk] || state.chatStatuses[sk] || 'idle') as ChatStatus,
          errorMessage: updates.errorMessages?.[sk] ?? (state.errorMessages[sk] || null),
          toolResults:
            updates.toolResultsMap?.[sk] ||
            (state.toolResultsMap?.[sk] ? { ...state.toolResultsMap[sk] } : {}),
          interaction: updates.interactionMap?.[sk] || state.interactionMap?.[sk] || null
        }

        const next = applyChatEvent(payload, basePatch)

        // 深度合并会话状态
        updates.sessions = { ...state.sessions, ...updates.sessions, [sk]: next.messages }
        updates.chatStatuses = { ...state.chatStatuses, ...updates.chatStatuses, [sk]: next.status }
        updates.errorMessages = {
          ...state.errorMessages,
          ...updates.errorMessages,
          [sk]: next.errorMessage ?? null
        }
        updates.toolResultsMap = {
          ...state.toolResultsMap,
          ...updates.toolResultsMap,
          [sk]: next.toolResults
        }
        updates.interactionMap = {
          ...state.interactionMap,
          ...updates.interactionMap,
          [sk]: next.interaction
        }
      }
      break
    }

    // 4. 模型池同步 (Resource Management)
    case 'models': {
      if (isModelsPayload(payload)) {
        updates.models = payload.models
        updates.defaultModelId = payload.defaultModelId
      }
      break
    }

    // 5. 系统信号维护 (System Reliability)
    case 'system:tick': {
      updates.lastTick = (payload as TickPayload).ts
      break
    }

    case 'system:shutdown': {
      updates.shutdownReason = (payload as ShutdownPayload).reason
      break
    }
  }

  // --- 区域 II: 补丁整合与归一化 ---

  return updates
}
