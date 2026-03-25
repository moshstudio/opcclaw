import { Agent } from '@shared/types/agent'
import { AgentEventPayload } from '@shared/types/gateway'

export interface AgentPatch {
  agents: Agent[]
  shouldRefetch?: boolean
}

/**
 * 智能体领域事件处理器 (商用解耦优化)
 *
 * 逻辑：
 * 1. 收到广播载荷后，计算最新的智能体列表。
 * 2. 如果载荷包含完整对象，则直接 Patch；否则标记需要刷新。
 */
export const applyAgentLifecycleEvent = (
  payload: AgentEventPayload,
  currentAgents: Agent[]
): AgentPatch => {
  const { type, agentId, agent } = payload
  let nextAgents = [...currentAgents]
  let shouldRefetch = false

  const targetAgent = agent as Agent | undefined

  switch (type) {
    case 'agent:created':
      if (targetAgent) {
        if (!nextAgents.some((a) => a.id === targetAgent.id)) {
          nextAgents.push(targetAgent)
        }
      } else {
        shouldRefetch = true
      }
      break

    case 'agent:updated':
      if (targetAgent) {
        nextAgents = nextAgents.map((a) => (a.id === targetAgent.id ? targetAgent : a))
      } else if (agentId) {
        // 后端没发全量数据时，标记由 Store 发起 fetch
        shouldRefetch = true
      }
      break

    case 'agent:deleted': {
      const idToDelete = agentId || (payload.id as string)
      if (idToDelete) {
        nextAgents = nextAgents.filter((a) => a.id !== idToDelete)
      }
      break
    }
  }

  return { agents: nextAgents, shouldRefetch }
}
