import { create } from 'zustand'
import { getGatewayClient } from '@renderer/services/gateway-client'
import type { AppConfig } from '@shared/types/config'

interface ConfigState {
  config: AppConfig | null
  loading: boolean

  // Actions
  fetchConfig: () => Promise<void>
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
  clearRememberedChoices: () => Promise<void>
}

/**
 * 全局配置配置仓 (Backend-Synced Config Store)
 * 职责：同步后端 config.json 中的持久化配置
 */
export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,

  fetchConfig: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const client = getGatewayClient()
      const res = await client.request<AppConfig>('config:get', {})
      if (res) {
        set({ config: res })
      }
    } catch (err) {
      console.error('[ConfigStore] Failed to fetch config:', err)
    } finally {
      set({ loading: false })
    }
  },

  updateConfig: async (patch: Partial<AppConfig>) => {
    const { config } = get()
    if (!config) return

    const nextConfig = { ...config, ...patch }
    // 乐观更新 (Optimistic UI)
    set({ config: nextConfig })

    try {
      const client = getGatewayClient()
      await client.request('config:save', nextConfig)
    } catch (err) {
      console.error('[ConfigStore] Failed to save config:', err)
      // 回滚？目前的逻辑倾向于让后端为准，下次 fetch 会刷回来
    }
  },

  clearRememberedChoices: async () => {
    const { config } = get()
    if (!config) return

    const nextConfig = { ...config, rememberedChoices: undefined }
    set({ config: nextConfig })

    try {
      const client = getGatewayClient()
      await client.request('config:save', { rememberedChoices: undefined })
    } catch (err) {
      console.error('[ConfigStore] Failed to clear remembered choices:', err)
    }
  }
}))
