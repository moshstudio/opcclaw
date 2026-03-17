import React from 'react'
import Sidebar from './Sidebar'
import ChatBox from './ChatBox'
import SettingsPanel from './SettingsPanel'
import { useSettingsStore } from '@renderer/store/useSettingsStore'

const MainLayout: React.FC = () => {
  const { uiConfig, setSettingsPanelVisible, toggleSettingsPanel, toggleSidebar } =
    useSettingsStore()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Left Sidebar */}
      <Sidebar collapsed={uiConfig.sidebarCollapsed} />

      {/* Center Chat Area */}
      <ChatBox
        toggleSidebar={toggleSidebar}
        settingsVisible={uiConfig.settingsPanelVisible}
        toggleSettings={toggleSettingsPanel}
      />

      {/* Right Settings Panel (Agent Settings) */}
      <SettingsPanel
        visible={uiConfig.settingsPanelVisible}
        onClose={() => setSettingsPanelVisible(false)}
      />
    </div>
  )
}

export default MainLayout
