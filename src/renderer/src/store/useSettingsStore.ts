import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  language: 'zh' | 'en'
  fontSize: number
}

interface AgentSettings {
  temperature: number
  maxTokens: number
  topP: number
  capabilities: {
    webSearch: boolean
    codeExecution: boolean
    vision: boolean
  }
}

interface UIConfig {
  sidebarCollapsed: boolean
  settingsPanelVisible: boolean
}

interface SettingsState {
  appSettings: AppSettings
  agentSettings: AgentSettings
  uiConfig: UIConfig

  // Actions
  setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setAgentSetting: <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => void
  toggleSidebar: () => void
  toggleSettingsPanel: () => void
  setSettingsPanelVisible: (visible: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appSettings: {
        theme: 'dark',
        language: 'zh',
        fontSize: 14
      },
      agentSettings: {
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1.0,
        capabilities: {
          webSearch: true,
          codeExecution: true,
          vision: false
        }
      },
      uiConfig: {
        sidebarCollapsed: false,
        settingsPanelVisible: false
      },

      setAppSetting: (key, value) =>
        set((state) => ({
          appSettings: { ...state.appSettings, [key]: value }
        })),

      setAgentSetting: (key, value) =>
        set((state) => ({
          agentSettings: { ...state.agentSettings, [key]: value }
        })),

      toggleSidebar: () =>
        set((state) => ({
          uiConfig: { ...state.uiConfig, sidebarCollapsed: !state.uiConfig.sidebarCollapsed }
        })),

      toggleSettingsPanel: () =>
        set((state) => ({
          uiConfig: {
            ...state.uiConfig,
            settingsPanelVisible: !state.uiConfig.settingsPanelVisible
          }
        })),

      setSettingsPanelVisible: (visible) =>
        set((state) => ({
          uiConfig: { ...state.uiConfig, settingsPanelVisible: visible }
        }))
    }),
    {
      name: 'openclaw-settings-storage'
    }
  )
)
