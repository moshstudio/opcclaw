import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIConfig {
  sidebarCollapsed: boolean
  settingsPanelVisible: boolean
}

interface SettingsStore {
  uiConfig: UIConfig
  // Actions
  toggleSidebar: () => void
  setSettingsPanelVisible: (visible: boolean) => void
  toggleSettingsPanel: () => void
}

/**
 * 前端 UI 状态仓 (Frontend-Only UI State Store)
 * 职责：仅同步本地浏览器相关的瞬时 UI 状态，不涉及后端持久化配置
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      uiConfig: {
        sidebarCollapsed: false,
        settingsPanelVisible: false
      },
      toggleSidebar: () =>
        set((state) => ({
          uiConfig: {
            ...state.uiConfig,
            sidebarCollapsed: !state.uiConfig.sidebarCollapsed
          }
        })),
      setSettingsPanelVisible: (visible: boolean) =>
        set((state) => ({
          uiConfig: {
            ...state.uiConfig,
            settingsPanelVisible: visible
          }
        })),
      toggleSettingsPanel: () =>
        set((state) => ({
          uiConfig: {
            ...state.uiConfig,
            settingsPanelVisible: !state.uiConfig.settingsPanelVisible
          }
        }))
    }),
    {
      name: 'opcclaw-ui-storage' // 独立的 UI 存储名称
    }
  )
)
