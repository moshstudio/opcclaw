import { Agent, Message } from '@shared/types/agent'
import { AgentEventPayload } from '@shared/types/gateway'
import { normalizeMessage } from '@shared/utils/message'
import i18n from '@renderer/i18n'

export interface AgentStorePatch {
  agents?: Agent[]
  sessions?: Record<string, Message[]>
  chatStatuses?: Record<string, string>
  errorMessages?: Record<string, string | null>
  shouldRefetch?: boolean
}

/**
 * 智能体领域事件处理器 (商用级全量解耦)
 * 职责：处理智能体生命周期 (Lifecycle) 与 智能体运行态通知 (Runtime Status)
 */
export const applyAgentEvent = (
  payload: AgentEventPayload,
  state: {
    agents: Agent[]
    sessions: Record<string, Message[]>
    chatStatuses: Record<string, string>
  }
): AgentStorePatch => {
  // 使用宽松解构避免复杂联合类型的字段访问问题 (字段按需使用，运行时安全)
  const {
    type,
    agentId,
    agent: targetAgent,
    id,
    error,
    skillName,
    sessionKey: sk
  } = payload as AgentEventPayload & {
    sessionKey?: string
    agentId?: string
    agent?: Agent
    id?: string
    error?: string
    skillName?: string
  }
  const updates: AgentStorePatch = {}

  // 1. 生命周期处理 (Lifecycle)
  if (type === 'agent:created' || type === 'agent:updated' || type === 'agent:deleted') {
    let nextAgents = [...state.agents]

    switch (type) {
      case 'agent:created':
        if (targetAgent && !nextAgents.some((a) => a.id === targetAgent.id)) {
          nextAgents.push(targetAgent)
        } else {
          updates.shouldRefetch = true
        }
        break
      case 'agent:updated':
        if (targetAgent) {
          nextAgents = nextAgents.map((a) => (a.id === targetAgent.id ? targetAgent : a))
        } else {
          updates.shouldRefetch = true
        }
        break
      case 'agent:deleted': {
        const idToDelete = agentId || id
        if (idToDelete) {
          nextAgents = nextAgents.filter((a) => a.id !== idToDelete)
        }
        break
      }
    }
    updates.agents = nextAgents
  }

  // 2. 运行态状态处理 (Runtime Status) - 原 session-handler 迁移
  if (sk) {
    switch (type) {
      case 'agent:run-start':
        updates.chatStatuses = { ...state.chatStatuses, [sk]: 'waiting' }
        break

      case 'agent:run-end':
        if (state.chatStatuses[sk] !== 'completed') {
          updates.chatStatuses = { ...state.chatStatuses, [sk]: 'completed' }
        }
        break

      case 'agent:run-error':
        updates.chatStatuses = { ...state.chatStatuses, [sk]: 'error' }
        if (error) {
          updates.errorMessages = { [sk]: String(error) }
        }
        break

      case 'agent:skill-triggered': {
        const currentMsgs = state.sessions[sk] || []
        const noticeMsg = normalizeMessage({
          role: 'assistant',
          content: [{ type: 'text', text: i18n.t('skills.activated', { name: skillName }) }],
          timestamp: Date.now(),
          id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        })
        updates.sessions = { ...state.sessions, [sk]: [...currentMsgs, noticeMsg] }
        break
      }
    }
  }

  return updates
}
