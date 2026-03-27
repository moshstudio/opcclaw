import { AgentEventPayload } from '@shared/types/gateway'
import { Message, ChatStatus } from '@shared/types/agent'
import { normalizeMessage } from '@shared/utils/message'
import i18n from '@renderer/i18n'

/** 会话状态补丁接口 */
export interface SessionStorePatch {
  sessions: Record<string, Message[]>
  allSessions: Record<string, string[]>
  chatStatuses: Record<string, ChatStatus>
  errorMessages: Record<string, string | null>
  toolResultsMap: Record<string, Record<string, unknown>>
}

/**
 * 会话领域事件处理器 (商用级解耦)
 * 职责：管理 Agent 下的会话列表关系及会话生命周期
 */
export const applySessionLifecycleEvent = (
  payload: AgentEventPayload,
  state: SessionStorePatch
): Partial<SessionStorePatch> => {
  const { type, agentId, sessionKey: sk } = payload
  if (!sk) return {}

  const updates: Partial<SessionStorePatch> = {}

  switch (type) {
    case 'session:created':
      if (agentId) {
        const list = state.allSessions[agentId] || []
        if (!list.includes(sk)) {
          updates.allSessions = { ...state.allSessions, [agentId]: [...list, sk] }
          updates.sessions = { ...state.sessions, [sk]: [] }
          updates.chatStatuses = { ...state.chatStatuses, [sk]: 'idle' }
          updates.errorMessages = { ...state.errorMessages, [sk]: null }
          updates.toolResultsMap = { ...state.toolResultsMap, [sk]: {} }
        }
      }
      break

    case 'session:deleted': {
      if (agentId) {
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

    case 'session:reset':
      updates.sessions = { ...state.sessions, [sk]: [] }
      updates.chatStatuses = { ...state.chatStatuses, [sk]: 'idle' }
      updates.errorMessages = { ...state.errorMessages, [sk]: null }
      updates.toolResultsMap = { ...state.toolResultsMap, [sk]: {} }
      break

    case 'agent:run-start':
      updates.chatStatuses = { ...state.chatStatuses, [sk]: 'waiting' }
      break

    case 'agent:run-end':
      // 这里的最终状态通常由 chat:final 覆盖，这里作为 fallback
      if (state.chatStatuses[sk] !== 'completed') {
        updates.chatStatuses = { ...state.chatStatuses, [sk]: 'completed' }
      }
      break

    case 'agent:run-error':
      updates.chatStatuses = { ...state.chatStatuses, [sk]: 'error' }
      if (payload.error) {
        updates.errorMessages = { ...state.errorMessages, [sk]: String(payload.error) }
      }
      break

    case 'agent:skill-triggered': {
      const skillName = payload.skillName as string
      if (sk) {
        const currentMsgs = state.sessions[sk] || []
        const noticeMsg = normalizeMessage({
          role: 'assistant',
          content: [{ type: 'text', text: i18n.t('skills.activated', { name: skillName }) }],
          timestamp: Date.now(),
          id: `skill-${Date.now()}`
        })
        updates.sessions = { ...state.sessions, [sk]: [...currentMsgs, noticeMsg] }
      }
      break
    }
  }

  return updates
}
