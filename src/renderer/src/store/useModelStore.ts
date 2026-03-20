import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'

export interface AIModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  supportsVision?: boolean
}

interface ModelTestResult {
  ok: boolean
  error?: string
}

interface ModelState {
  models: AIModelConfig[]
  defaultModelId: string | null
  isLoading: boolean
  error: string | null
  initialized: boolean

  handleModelsUpdate: (payload: any) => void
  init: () => void

  fetchModels: () => Promise<void>
  addModel: (model: Omit<AIModelConfig, 'id'>) => Promise<boolean>
  updateModel: (id: string, updates: Partial<AIModelConfig>) => Promise<boolean>
  deleteModel: (id: string) => Promise<boolean>
  testModel: (model: AIModelConfig) => Promise<ModelTestResult>
  setDefaultModel: (id: string) => Promise<boolean>
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  defaultModelId: null,
  isLoading: false,
  error: null,
  initialized: false,

  handleModelsUpdate: (payload: any) => {
    if (payload.type === 'models:list') {
      set({
        models: payload.models || [],
        defaultModelId: payload.defaultModelId || null,
        isLoading: false,
        initialized: true
      })
    }
  },

  init: () => {
    // 基础配置初始化 (如有逻辑)
  },

  fetchModels: async () => {
    set({ isLoading: true, error: null })
    try {
      // 仅触发拉取，更新由 onModels 广播闭环
      await getGatewayClient().request('models:fetch', {})
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addModel: async (model) => {
    try {
      await getGatewayClient().request('models:add', model)
      return true
    } catch (err) {
      console.error('Failed to add model:', err)
      return false
    }
  },

  updateModel: async (id, updates) => {
    try {
      await getGatewayClient().request('models:update', { id, updates })
      return true
    } catch (err) {
      console.error('Failed to update model:', err)
      return false
    }
  },

  deleteModel: async (id) => {
    try {
      await getGatewayClient().request('models:delete', { id })
      return true
    } catch (err) {
      console.error('Failed to delete model:', err)
      return false
    }
  },

  testModel: async (model) => {
    try {
      return await getGatewayClient().request<ModelTestResult>('models:test', model)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  setDefaultModel: async (id) => {
    try {
      await getGatewayClient().request('models:setDefault', { id })
      return true
    } catch (err) {
      console.error('Failed to set default model:', err)
      return false
    }
  }
}))
