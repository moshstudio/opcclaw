import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import MainLayout from './components/layout/MainLayout'
import SettingsPage from './components/settings/SettingsPage'
import { useSettingsStore } from './store/useSettingsStore'
import { OnboardingOverlay } from './components/layout/OnboardingOverlay'
import { ThemeProvider } from './components/ThemeProvider'
import { initGatewaySync } from './store/gateway/gateway-sync'
import ScheduledTasks from './components/tasks/ScheduledTasks'

import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm-dialog'
import { ConfigProvider } from 'antd'

function AppContent(): React.JSX.Element {
  const location = useLocation()
  const { i18n } = useTranslation()
  const { appSettings } = useSettingsStore()

  const pageVariants = {
    initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -8, filter: 'blur(4px)' }
  }

  const pageTransition = {
    type: 'tween' as const,
    ease: 'easeInOut' as const,
    duration: 0.2
  }

  useEffect(() => {
    initGatewaySync()
  }, [])

  useEffect(() => {
    if (i18n.language !== appSettings.language) {
      i18n.changeLanguage(appSettings.language)
    }
  }, [appSettings.language, i18n])

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily:
            "'Alibaba PuHui Ti', 'AlibabaPuHuiTi', 'Alibaba PuHui Ti 2.0', 'Alibaba PuHui Ti 3.0', 'PingFang SC', 'SimHei', '黑体', 'Microsoft YaHei', '微软雅黑', 'Inter', 'Hiragino Sans GB', 'Heiti SC', 'WenQuanYi Micro Hei', sans-serif"
        }
      }}
    >
      <ThemeProvider>
        <ConfirmProvider>
          <OnboardingOverlay />
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <motion.div
                    className="w-full h-full"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={pageVariants}
                    transition={pageTransition}
                  >
                    <MainLayout />
                  </motion.div>
                }
              />
              <Route
                path="/tasks"
                element={
                  <motion.div
                    className="w-full h-full"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={pageVariants}
                    transition={pageTransition}
                  >
                    <ScheduledTasks />
                  </motion.div>
                }
              />
              <Route
                path="/settings"
                element={
                  <motion.div
                    className="w-full h-full"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={pageVariants}
                    transition={pageTransition}
                  >
                    <SettingsPage />
                  </motion.div>
                }
              />
            </Routes>
          </AnimatePresence>
          <Toaster position="top-center" richColors />
        </ConfirmProvider>
      </ThemeProvider>
    </ConfigProvider>
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
