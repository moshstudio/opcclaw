import { AgentEventPayload } from '@shared/types/gateway'
import { Message, ChatStatus } from '@shared/types/agent'

/** 会话状态补丁接口 */
export interface SessionStorePatch {
  sessions: Record<string, Message[]>
  allSessions: Record<string, string[]>
  sessionKeys: Record<string, string> // agentId -> activeSessionKey
  chatStatuses: Record<string, ChatStatus>
  errorMessages: Record<string, string | null>
  toolResultsMap: Record<string, Record<string, unknown>>
}

/**
 * 会话领域事件处理器 (商用级解耦)
 * 职责：管理 Agent 下 its 会话列表关系及会话生命周期
 */
export const applySessionLifecycleEvent = (
  payload: AgentEventPayload,
  state: SessionStorePatch
): Partial<SessionStorePatch> => {
  const updates: Partial<SessionStorePatch> = {}

  switch (payload.type) {
    case 'session:created': {
      const { agentId, sessionKey: sk } = payload
      if (agentId && sk) {
        const list = state.allSessions[agentId] || []
        if (!list.includes(sk)) {
          updates.allSessions = { ...state.allSessions, [agentId]: [...list, sk] }
          updates.sessions = { ...state.sessions, [sk]: [] }
          updates.chatStatuses = { ...state.chatStatuses, [sk]: 'idle' }
          updates.errorMessages = { ...state.errorMessages, [sk]: null }
          updates.toolResultsMap = { ...state.toolResultsMap, [sk]: {} }
          const currentActive = state.sessionKeys[agentId]
          const isCurrentEmpty =
            !currentActive || (state.sessions[currentActive]?.length || 0) === 0

          if (isCurrentEmpty) {
            updates.sessionKeys = { ...state.sessionKeys, [agentId]: sk }
          }
        }
      }
      break
    }

    case 'session:deleted': {
      const { agentId, sessionKey: sk } = payload
      if (agentId && sk) {
        const list = (state.allSessions[agentId] || []).filter((k) => k !== sk)
        const sessions = { ...state.sessions }
        const statuses = { ...state.chatStatuses }
        const errors = { ...state.errorMessages }
        const tools = { ...state.toolResultsMap }

        delete sessions[sk]
        delete statuses[sk]
        delete errors[sk]
        if (tools) delete tools[sk]

        updates.allSessions = { ...state.allSessions, [agentId]: list }
        updates.sessions = sessions
        updates.chatStatuses = statuses
        updates.errorMessages = errors
        updates.toolResultsMap = tools
      }
      break
    }

    case 'session:reset': {
      const { sessionKey: sk } = payload
      if (sk) {
        updates.sessions = { ...state.sessions, [sk]: [] }
        updates.chatStatuses = { ...state.chatStatuses, [sk]: 'idle' }
        updates.errorMessages = { ...state.errorMessages, [sk]: null }
        updates.toolResultsMap = { ...state.toolResultsMap, [sk]: {} }
      }
      break
    }
  }

  return updates
}
