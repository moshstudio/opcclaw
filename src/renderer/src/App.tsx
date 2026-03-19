import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import MainLayout from './components/layout/MainLayout'
import SettingsPage from './components/settings/SettingsPage'
import { useSettingsStore } from './store/useSettingsStore'
import { useModelStore } from './store/useModelStore'
import { OnboardingOverlay } from './components/layout/OnboardingOverlay'
import { ThemeProvider } from './components/ThemeProvider'
import { useChatStore } from './store/useChatStore'
import { useAgentStore } from './store/useAgentStore'
import { useSystemStore } from './store/useSystemStore'

import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm-dialog'

function AppContent(): React.JSX.Element {
  const { i18n } = useTranslation()
  const { appSettings } = useSettingsStore()
  const initModels = useModelStore((s) => s.init)
  const initChat = useChatStore((s) => s.init)
  const initAgents = useAgentStore((s) => s.init)
  const initSystem = useSystemStore((s) => s.init)

  useEffect(() => {
    initModels()
    initChat()
    initAgents()
    initSystem()
  }, [initModels, initChat, initAgents, initSystem])

  useEffect(() => {
    if (i18n.language !== appSettings.language) {
      i18n.changeLanguage(appSettings.language)
    }
  }, [appSettings.language, i18n])

  return (
    <ThemeProvider>
      <ConfirmProvider>
        <OnboardingOverlay />
        <Routes>
          <Route path="/" element={<MainLayout />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </ConfirmProvider>
    </ThemeProvider>
  )
}

function App(): React.JSX.Element {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
