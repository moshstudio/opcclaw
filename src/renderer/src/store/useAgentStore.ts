import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'
import { applyAgentLifecycleEvent } from './agent-handler'

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
  initialized: boolean

  handleLifecycleEvent: (payload: any) => Promise<void>
  init: () => void

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
  initialized: false,

  handleLifecycleEvent: async (payload: any) => {
    if (
      payload.type === 'agent:created' ||
      payload.type === 'agent:updated' ||
      payload.type === 'agent:deleted'
    ) {
      const result = applyAgentLifecycleEvent(payload, get().agents)

      if (result.shouldRefetch) {
        await get().fetchAgents()
      } else {
        set({ agents: result.agents })
      }

      if (
        payload.type === 'agent:deleted' &&
        get().activeAgentId === (payload.agentId || (payload as any).id)
      ) {
        set({ activeAgentId: get().agents[0]?.id || 'main' })
      }
    }
  },

  init: () => {
    // 基础配置初始化 (如有逻辑)
  },

  fetchAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await getGatewayClient().request<{ agents: AgentInfo[] }>('agent:list')
      const agents = response.agents || []
      set({ agents, isLoading: false })

      const currentActive = get().activeAgentId
      if (agents.length > 0 && (!currentActive || !agents.find((a) => a.id === currentActive))) {
        set({ activeAgentId: agents[0].id })
      }
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
      const res = await getGatewayClient().request<{ agentId: string }>('agent:create', config)
      return res.agentId
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  },

  updateAgent: async (agentId, updates) => {
    set({ isLoading: true, error: null })
    try {
      await getGatewayClient().request('agent:update', { agentId, ...updates })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  },

  deleteAgent: async (id) => {
    if (id === 'main') return
    set({ isLoading: true, error: null })
    try {
      await getGatewayClient().request('agent:delete', { agentId: id })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  }
}))
