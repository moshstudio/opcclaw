import { create } from 'zustand'
import { getGatewayClient } from '@renderer/services/gateway-client'
import type { AppConfig } from '@shared/types/config'

interface ConfigState {
  config: AppConfig | null
  loading: boolean
  fetchConfig: () => Promise<void>
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
  clearRememberedChoices: () => Promise<void>
  deleteRememberedChoice: (key: string) => Promise<void>
}

// 配置常量
const GATEWAY_RESTART_DELAY = 2000

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,

  /** 拉取全量配置 */
  fetchConfig: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await getGatewayClient().request<AppConfig>('config:get', {})
      if (res) set({ config: res })
    } catch (err) {
      console.error('[ConfigStore] Fetch failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  /**
   * 更新配置 (带回滚机制)
   */
  updateConfig: async (patch: Partial<AppConfig>) => {
    const current = get().config
    if (!current) return

    // 1. 实质性变更预判 (用于触发 Side Effects)
    const gatewayDirty =
      patch.gateway && JSON.stringify(patch.gateway) !== JSON.stringify(current.gateway)

    // 2. 乐观更新
    const next = { ...current, ...patch }
    set({ config: next })

    try {
      const client = getGatewayClient()
      await client.request('config:save', next)

      if (gatewayDirty) {
        setTimeout(() => client.reconnect().catch(() => {}), GATEWAY_RESTART_DELAY)
      }
    } catch (err) {
      set({ config: current }) // 失败回滚
      throw err
    }
  },

  /** 清除所有记住的选择 */
  clearRememberedChoices: async () => {
    const current = get().config
    if (!current) return
    set({ config: { ...current, rememberedChoices: undefined } })
    try {
      await getGatewayClient().request('config:save', { rememberedChoices: undefined })
    } catch (err) {
      set({ config: current })
    }
  },

  deleteRememberedChoice: async (key: string) => {
    const current = get().config
    if (!current?.rememberedChoices) return

    const nextChoices = { ...current.rememberedChoices }
    delete nextChoices[key]

    set({ config: { ...current, rememberedChoices: nextChoices } })
    try {
      await getGatewayClient().request('config:save', { rememberedChoices: nextChoices })
    } catch (err) {
      set({ config: current })
    }
  }
}))

// 自动初始化：监听网关发出的配置变更信号
getGatewayClient().onConfig(() => {
  useConfigStore.getState().fetchConfig()
})
