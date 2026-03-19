import { create } from 'zustand'

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

  fetchModels: async () => {
    set({ isLoading: true, error: null })
    try {
      const config = await window.api.config.get()
      set({
        models: config.models || [],
        defaultModelId: config.defaultModelId || null,
        isLoading: false
      })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addModel: async (model) => {
    try {
      const result = await window.api.config.addModel(model)

      // 如果没有默认模型，设置它
      const config = await window.api.config.get()
      if (!config.defaultModelId && result.model) {
        config.defaultModelId = result.model.id
        await window.api.config.save(config)
      }

      await get().fetchModels()
      return true
    } catch (err) {
      console.error('Failed to add model:', err)
      return false
    }
  },

  updateModel: async (id, updates) => {
    try {
      await window.api.config.updateModel(id, updates)
      await get().fetchModels()
      return true
    } catch (err) {
      console.error('Failed to update model:', err)
      return false
    }
  },

  deleteModel: async (id) => {
    try {
      await window.api.config.deleteModel(id)
      await get().fetchModels()
      return true
    } catch (err) {
      console.error('Failed to delete model:', err)
      return false
    }
  },

  testModel: async (model) => {
    try {
      const result = await window.api.config.testModel(model)
      return result
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },
  setDefaultModel: async (id) => {
    try {
      await window.api.config.save({ defaultModelId: id })
      set({ defaultModelId: id })
      return true
    } catch (err) {
      console.error('Failed to set default model:', err)
      return false
    }
  }
}))
