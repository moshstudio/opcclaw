import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'
import { applyAgentLifecycleEvent } from './gateway/agent-handler'
import { useChatStore } from './useChatStore'

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
  createAgent: (config: any) => Promise<{ agentId: string; sessionKey: string }>
  updateAgent: (agentId: string, updates: any) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

const ACTIVE_AGENT_STORAGE_KEY = 'opcclaw_active_agent_id'

export const useAgentStore = create<AgentState>((set, get) => {
  const savedActiveAgentId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY) : null

  return {
    agents: [],
    activeAgentId: savedActiveAgentId || 'main',
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
          const nextActive = get().agents[0]?.id || 'main'
          set({ activeAgentId: nextActive })
          localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, nextActive)
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
        // 如果当前没有 activeId 或者当前的 id 在列表中不存在，则回退到列表第一个
        if (agents.length > 0 && (!currentActive || !agents.find((a) => a.id === currentActive))) {
          const nextActive = agents[0].id
          set({ activeAgentId: nextActive })
          localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, nextActive)
          useChatStore.getState().fetchSessions(nextActive)
        } else if (currentActive) {
          // 如果当前 id 有效，也尝试拉取一次会话
          useChatStore.getState().fetchSessions(currentActive)
        }
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false })
      }
    },

    setActiveAgent: (id) => {
      set({ activeAgentId: id })
      if (id) {
        localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, id)
        useChatStore.getState().fetchSessions(id)
      } else {
        localStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY)
      }
    },

    createAgent: async (config) => {
      set({ isLoading: true, error: null })
      try {
        const res = await getGatewayClient().request<{ agentId: string; sessionKey: string }>(
          'agent:create',
          config
        )
        // 同步更新会话状态
        useChatStore.setState((s) => ({
          sessionKeys: { ...s.sessionKeys, [res.agentId]: res.sessionKey }
        }))
        return res
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
  }
})
