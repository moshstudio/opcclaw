import {
  ChatPayload,
  AgentEventPayload,
  ModelsPayload,
  TickPayload,
  ShutdownPayload,
  NoticePayload,
  GatewayPayload
} from '@shared/types/gateway'
import { Message, ChatStatus, Agent } from '@shared/types/agent'
import { applyChatEvent, SessionPatch } from './chat-handler'
import { applyNoticeEvent } from './notice-handler'
import { applySessionLifecycleEvent, SessionStorePatch } from './session-handler'
import { applyAgentEvent } from './agent-handler'

// ============================================================================
// 1. 系统核心类型定义 (商用级扩展)
// ============================================================================

/**
 * 最小化 Store 状态接口定义
 * 包含：消息映射、状态机、模型池、错误追踪
 */
export interface MinimalChatStore extends SessionStorePatch {
  // 会话领域
  interactionMap?: Record<string, unknown>
  sessionKeys: Record<string, string> // 必须包含这个才能在 reducer 中更新它
  // 活跃智能体
  agents: Agent[]
  activeAgentId?: string | null

  // 资源领域 (预留/扩展)
  models?: ModelsPayload['models']
  defaultModelId?: string | null

  // 系统领域
  lastTick?: number
  shutdownReason?: string | null
}

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
// ============================================================================
// 2. 辅助工具逻辑 (Internal Helpers)
// ============================================================================

/** 获取特定会话的状态快照 */
const getSessionSnapshot = (
  state: MinimalChatStore,
  updates: Partial<MinimalChatStore>,
  sk: string
): SessionPatch => ({
  messages: (updates.sessions?.[sk] || state.sessions[sk] || []) as Message[],
  status: (updates.chatStatuses?.[sk] || state.chatStatuses[sk] || 'idle') as ChatStatus,
  errorMessage: updates.errorMessages?.[sk] ?? (state.errorMessages[sk] || null),
  toolResults:
    updates.toolResultsMap?.[sk] ||
    (state.toolResultsMap?.[sk] ? { ...state.toolResultsMap[sk] } : {}),
  interaction: (updates.interactionMap?.[sk] ||
    state.interactionMap?.[sk] ||
    null) as SessionPatch['interaction']
})

/** 将领域 Patch 合并回 PartialStore */
const mergePatch = (
  state: MinimalChatStore,
  updates: Partial<MinimalChatStore>,
  sk: string,
  patch: SessionPatch
) => {
  updates.sessions = { ...state.sessions, ...updates.sessions, [sk]: patch.messages }
  updates.chatStatuses = { ...state.chatStatuses, ...updates.chatStatuses, [sk]: patch.status }
  updates.errorMessages = {
    ...state.errorMessages,
    ...updates.errorMessages,
    [sk]: patch.errorMessage ?? null
  }
  updates.toolResultsMap = {
    ...state.toolResultsMap,
    ...updates.toolResultsMap,
    [sk]: patch.toolResults
  }
  updates.interactionMap = {
    ...state.interactionMap,
    ...updates.interactionMap,
    [sk]: patch.interaction
  }
}

// ============================================================================
// 3. 统一网关事件处理器 (中央 Reducer)
// ============================================================================

export const applyGatewayEvent = (
  state: MinimalChatStore,
  payload: GatewayPayload,
  event: 'chat' | 'notice' | 'agent' | 'session' | 'models' | 'system:tick' | 'system:shutdown'
): Partial<MinimalChatStore> => {
  const updates: Partial<MinimalChatStore> = {}

  switch (event) {
    case 'agent':
      if (isAgentPayload(payload)) {
        const patch = applyAgentEvent(payload, {
          agents: state.agents,
          sessions: state.sessions,
          chatStatuses: state.chatStatuses as Record<string, string>
        })
        if (patch.agents) updates.agents = patch.agents
        if (patch.shouldRefetch !== undefined) updates.lastTick = Date.now() // 借用 Tick 触发刷新
        // 合并运行态 Patch
        if (patch.sessions) updates.sessions = { ...state.sessions, ...patch.sessions }
        if (patch.chatStatuses)
          updates.chatStatuses = { ...state.chatStatuses, ...patch.chatStatuses } as Record<
            string,
            ChatStatus
          >
        if (patch.errorMessages)
          updates.errorMessages = { ...state.errorMessages, ...patch.errorMessages }
      }
      break

    case 'session':
      if (isSessionPayload(payload)) {
        Object.assign(updates, applySessionLifecycleEvent(payload, state))
      }
      break

    case 'chat': {
      const p = payload as ChatPayload
      if (p.sessionKey) {
        const sk = p.sessionKey
        const snapshot = getSessionSnapshot(state, updates, sk)
        const patch = applyChatEvent(p, snapshot)
        mergePatch(state, updates, sk, patch)
      }
      break
    }

    case 'notice': {
      const p = payload as NoticePayload
      if (p.sessionKey) {
        const sk = p.sessionKey
        const snapshot = getSessionSnapshot(state, updates, sk)
        const patch = applyNoticeEvent(p, snapshot)
        mergePatch(state, updates, sk, patch)
      }
      break
    }

    case 'models':
      if (isModelsPayload(payload)) {
        updates.models = payload.models
        updates.defaultModelId = payload.defaultModelId
      }
      break

    case 'system:tick':
      updates.lastTick = (payload as unknown as TickPayload).ts
      break

    case 'system:shutdown':
      updates.shutdownReason = (payload as unknown as ShutdownPayload).reason
      break
  }

  return updates
}
