import React, { useEffect } from 'react'
import { HashRouter as Router, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import MainLayout from './components/layout/MainLayout'
import SettingsPage from './components/settings/SettingsPage'
import CssKeepAlive from './components/layout/CssKeepAlive'
import { useSettingsStore } from './store/useSettingsStore'
import { OnboardingOverlay } from './components/layout/OnboardingOverlay'
import { ThemeProvider } from './components/ThemeProvider'
import { initGatewaySync } from './store/gateway/gateway-sync'
import ScheduledTasks from './components/tasks/ScheduledTasks'
import { useAgentStore } from './store/useAgentStore'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { useMinimumLoading } from './hooks/useMinimumLoading'

import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm-dialog'
import { ConfigProvider } from 'antd'

function AppContent(): React.JSX.Element {
  const location = useLocation()
  const { i18n } = useTranslation()
  const { appSettings } = useSettingsStore()
  const { isLoading } = useAgentStore()
  const showLoading = useMinimumLoading(isLoading, 1000)

  const pathname = location.pathname

  useEffect(() => {
    initGatewaySync()
  }, [])

  useEffect(() => {
    if (i18n.language !== appSettings.language) {
      i18n.changeLanguage(appSettings.language)
      // 同步给主进程 (用于托盘菜单等)
      window.api.app.changeLanguage(appSettings.language)
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
          <AnimatePresence mode="wait">
            {showLoading && <LoadingScreen key="loading-screen" />}
          </AnimatePresence>
          <OnboardingOverlay />
          {/* CSS Keep-Alive 路由：组件始终挂载在同一 React 树中，仅通过 CSS display 控制显隐 */}
          <CssKeepAlive active={pathname === '/'}>
            <MainLayout />
          </CssKeepAlive>
          <CssKeepAlive active={pathname === '/tasks'}>
            <ScheduledTasks />
          </CssKeepAlive>
          <CssKeepAlive active={pathname === '/settings'}>
            <SettingsPage />
          </CssKeepAlive>
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
