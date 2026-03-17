import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'

export interface AgentInfo {
  id: string
  config: {
    name?: string
    description?: string
    icon?: string
    [key: string]: any
  }
}

interface AgentState {
  agents: AgentInfo[]
  activeAgentId: string
  isLoading: boolean
  error: string | null

  fetchAgents: () => Promise<void>
  setActiveAgent: (id: string) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  activeAgentId: 'main',
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const client = getGatewayClient()
      const response = await client.request<{ agents: AgentInfo[] }>('agent.list')

      set({ agents: response.agents, isLoading: false })

      // 如果当前的 activeAgentId 不在列表中且列表非空，选择第一个
      set((state) => {
        if (
          response.agents.length > 0 &&
          !response.agents.find((a) => a.id === state.activeAgentId)
        ) {
          return { activeAgentId: response.agents[0].id }
        }
        return {}
      })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  setActiveAgent: (id) => {
    set({ activeAgentId: id })
  }
}))
