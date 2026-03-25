import { create } from 'zustand'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { Agent, AgentConfig } from '@shared/types/agent'
import { AgentEventPayload } from '@shared/types/gateway'

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null

  // Actions
  fetchAgents: () => Promise<void>
  createAgent: (config: AgentConfig) => Promise<void>
  updateAgent: (id: string, config: Partial<AgentConfig>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setActiveAgent: (id: string | null) => void
  handleLifecycleEvent: (payload: AgentEventPayload) => void
}

const ACTIVE_AGENT_STORAGE_KEY = 'opcclaw_active_agent_id'

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  activeAgentId: localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY),

  fetchAgents: async () => {
    try {
      const { agents } = await getGatewayClient().request<{ agents: Agent[] }>('agent:list', {})
      set({ agents })
    } catch (err) {
      console.error('[AgentStore] Failed to fetch agents:', err)
    }
  },

  setActiveAgent: (id) => {
    if (id) {
      localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY)
    }
    set({ activeAgentId: id })
  },

  createAgent: async (config) => {
    try {
      await getGatewayClient().request('agent:create', config)
      await get().fetchAgents()
    } catch (err) {
      console.error('[AgentStore] Failed to create agent:', err)
      throw err
    }
  },

  updateAgent: async (id, config) => {
    try {
      await getGatewayClient().request('agent:update', { id, ...config })
      await get().fetchAgents()
    } catch (err) {
      console.error('[AgentStore] Failed to update agent:', err)
      throw err
    }
  },

  deleteAgent: async (id) => {
    try {
      await getGatewayClient().request('agent:delete', { id })
      await get().fetchAgents()
      if (get().activeAgentId === id) {
        get().setActiveAgent(null)
      }
    } catch (err) {
      console.error('[AgentStore] Failed to delete agent:', err)
      throw err
    }
  },

  handleLifecycleEvent: (payload) => {
    const { type } = payload
    // 简单的生命周期处理，直接刷新列表以保持一致性
    if (type === 'agent:created' || type === 'agent:updated' || type === 'agent:deleted') {
      get().fetchAgents()
    }
  }
}))
