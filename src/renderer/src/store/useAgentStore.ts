import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'

export interface AgentInfo {
  id: string
  config: {
    name?: string
    icon?: string
    systemPrompt?: string
    [key: string]: any
  }
}

interface AgentState {
  agents: AgentInfo[]
  activeAgentId: string | null
  isLoading: boolean
  error: string | null

  fetchAgents: () => Promise<void>
  setActiveAgent: (id: string | null) => void
  createAgent: (config: any) => Promise<string>
  updateAgent: (agentId: string, updates: any) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
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
          (!state.activeAgentId || !response.agents.find((a) => a.id === state.activeAgentId))
        ) {
          return { activeAgentId: response.agents[0].id, isLoading: false }
        }
        return { isLoading: false }
      })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  setActiveAgent: (id) => {
    set({ activeAgentId: id })
  },

  createAgent: async (config) => {
    set({ isLoading: true, error: null })
    try {
      const client = getGatewayClient()
      const res = await client.request<{ agentId: string }>('agent.create', config)
      const agentId = res.agentId
      await get().fetchAgents()
      set({ activeAgentId: agentId })
      return agentId
    } catch (err) {
      const msg = (err as Error).message
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  updateAgent: async (agentId, updates) => {
    set({ isLoading: true, error: null })
    try {
      const client = getGatewayClient()
      await client.request('agent.update', { agentId, ...updates })
      await get().fetchAgents()
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  },

  deleteAgent: async (id) => {
    if (id === 'main') return
    set({ isLoading: true, error: null })
    try {
      const client = getGatewayClient()
      await client.request('agent.delete', { agentId: id })
      await get().fetchAgents()

      set((state) => {
        if (state.activeAgentId === id) {
          return { activeAgentId: state.agents[0]?.id || 'main' }
        }
        return {}
      })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  }
}))
