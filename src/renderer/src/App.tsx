import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import MainLayout from './components/layout/MainLayout'
import SettingsPage from './components/settings/SettingsPage'
import { useSettingsStore } from './store/useSettingsStore'
import { OnboardingOverlay } from './components/layout/OnboardingOverlay'
import { ThemeProvider } from './components/ThemeProvider'
import { initGatewaySync } from './store/gateway-sync'

import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm-dialog'

function AppContent(): React.JSX.Element {
  const { i18n } = useTranslation()
  const { appSettings } = useSettingsStore()

  useEffect(() => {
    initGatewaySync()
  }, [])

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
