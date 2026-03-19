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


  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    // 关键优化：监听智能体全频道
    getGatewayClient().onAgent(async (payload) => {
      // 1. 生命周期事件推式处理
      if (
        payload.type === 'agent_created' ||
        payload.type === 'agent_updated' ||
        payload.type === 'agent_deleted'
      ) {
        const result = applyAgentLifecycleEvent(payload, get().agents)
        
        // 如果后端只发了 ID (shouldRefetch === true)，我们被动刷新列表
        if (result.shouldRefetch) {
          await get().fetchAgents()
        } else {
          // 如果后端发了全量对象 (推模式)，直接 Patch 同步
          set({ agents: result.agents })
        }

        // 处理活动 Agent 丢失逻辑
        if (
          payload.type === 'agent_deleted' &&
          get().activeAgentId === (payload.agentId || payload.id)
        ) {
          set({ activeAgentId: get().agents[0]?.id || 'main' })
        }
      }
    })

    // 初始加载
    get().fetchAgents()
  },

  fetchAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await getGatewayClient().request<{ agents: AgentInfo[] }>('agent.list')
      const agents = response.agents || []
      
      set({ agents, isLoading: false })

      // 活动项漂移容错
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
      const res = await getGatewayClient().request<{ agentId: string }>('agent.create', config)
      const agentId = res.agentId
      // 注意：不再此处 fetchAgents，交由广播监听统一处理即可同步
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
      await getGatewayClient().request('agent.update', { agentId, ...updates })
      // 同上，交给广播自动更新
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  },

  deleteAgent: async (id) => {
    if (id === 'main') return
    set({ isLoading: true, error: null })
    try {
      await getGatewayClient().request('agent.delete', { agentId: id })
      // 同上，交给广播自动更新
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      throw err
    }
  }
}))
