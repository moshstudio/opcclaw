import { AgentInfo } from './useAgentStore'

export interface AgentPatch {
  agents: AgentInfo[]
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
  payload: any,
  currentAgents: AgentInfo[]
): AgentPatch => {
  const { type, agentId, agent } = payload
  let nextAgents = [...currentAgents]
  let shouldRefetch = false

  switch (type) {
    case 'agent_created':
      if (agent) {
        if (!nextAgents.some(a => a.id === agent.id)) {
          nextAgents.push(agent)
        }
      } else {
        shouldRefetch = true
      }
      break

    case 'agent_updated':
      if (agent) {
        nextAgents = nextAgents.map(a => a.id === agent.id ? agent : a)
      } else if (agentId) {
        // 后端没发全量数据时，标记由 Store 发起 fetch
        shouldRefetch = true
      }
      break

    case 'agent_deleted':
      if (agentId) {
        nextAgents = nextAgents.filter(a => a.id !== agentId)
      } else if (payload.id) {
        nextAgents = nextAgents.filter(a => a.id !== payload.id)
      }
      break
  }

  return { agents: nextAgents, shouldRefetch }
}
