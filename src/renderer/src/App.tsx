import React, { useEffect } from 'react'
import { HashRouter as Router, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import MainLayout from './components/layout/MainLayout'
import SettingsPage from './components/settings/SettingsPage'
import CssKeepAlive from './components/layout/CssKeepAlive'
import { useConfigStore } from './store/useConfigStore'
import { OnboardingOverlay } from './components/layout/OnboardingOverlay'
import { ThemeProvider } from './components/ThemeProvider'
import { initGatewaySync } from './store/gateway/gateway-sync'
import ScheduledTasks from './components/tasks/ScheduledTasks'
import { useSystemStore } from './store/useSystemStore'

import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm-dialog'
import { ConfigProvider } from 'antd'

function AppContent(): React.JSX.Element {
  const location = useLocation()
  const { i18n } = useTranslation()
  const { config } = useConfigStore()
  const { isInitializing } = useSystemStore()
  const pathname = location.pathname

  useEffect(() => {
    initGatewaySync()
  }, [])

  useEffect(() => {
    if (config?.language && i18n.language !== config.language) {
      i18n.changeLanguage(config.language)
    }
  }, [config?.language, i18n])

  useEffect(() => {
    // Control index.html native loader
    // This loader is outside of #root so it stays visible during React mount
    const loader = document.getElementById('initial-loader')
    if (loader) {
      if (!isInitializing) {
        // Add class to trigger CSS transition defined in index.html
        loader.classList.add('ready')
        // Clean up DOM after transition finishes
        const timer = setTimeout(() => {
          loader.remove()
        }, 500)
        return () => clearTimeout(timer)
      }
    }
    return undefined
  }, [isInitializing])

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
