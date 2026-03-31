import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Globe, Brain, Network, Puzzle, Share2 } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import ModelsTab from './ModelsTab'
import GatewayTab from './GatewayTab'
import SkillsTab from './SkillsTab'
import { ChannelsTab } from './ChannelsTab'
import GeneralTab from './GeneralTab'
import { Button } from '@renderer/components/ui/button'
import { useConfigStore } from '@renderer/store/useConfigStore'

const SettingsPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { config, fetchConfig } = useConfigStore()

  const queryParams = new URLSearchParams(location.search)
  const autoAction = queryParams.get('action')

  const tabs = [
    {
      id: 'general' as const,
      icon: Globe,
      label: t('settings.app_settings'),
      component: <GeneralTab />
    },
    {
      id: 'models' as const,
      icon: Brain,
      label: t('models.title'),
      component: <ModelsTab autoAction={autoAction} />
    },
    {
      id: 'skills' as const,
      icon: Puzzle,
      label: t('skills.title'),
      component: <SkillsTab />
    },
    {
      id: 'channels' as const,
      icon: Share2,
      label: t('settings.channels_title'),
      component: <ChannelsTab />
    },
    {
      id: 'gateway' as const,
      icon: Network,
      label: t('gateway.title'),
      component: <GatewayTab />
    }
  ]

  type TabId = (typeof tabs)[number]['id']
  const SETTINGS_TAB_KEY = 'last_settings_tab'

  const getInitialTab = (): TabId => {
    const fromUrl = queryParams.get('tab') as TabId
    if (fromUrl && tabs.some((t) => t.id === fromUrl)) return fromUrl

    const fromStorage = localStorage.getItem(SETTINGS_TAB_KEY) as TabId
    if (fromStorage && tabs.some((t) => t.id === fromStorage)) return fromStorage

    return 'general'
  }

  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab())

  // Save active tab to localStorage
  React.useEffect(() => {
    localStorage.setItem(SETTINGS_TAB_KEY, activeTab)
  }, [activeTab])

  // Track which tabs have been rendered to support lazy loading yet keep-alive
  const [renderedTabs, setRenderedTabs] = useState<Set<TabId>>(new Set([activeTab]))

  // Update rendered tabs when active tab changes
  React.useEffect(() => {
    if (!renderedTabs.has(activeTab)) {
      setRenderedTabs((prev) => new Set([...prev, activeTab]))
    }
  }, [activeTab, renderedTabs])

  // Fetch config on mount
  React.useEffect(() => {
    if (!config) fetchConfig()
  }, [config, fetchConfig])

  // Clear action query param after it's been captured to prevent re-triggering on tab switch
  React.useEffect(() => {
    if (autoAction) {
      const newParams = new URLSearchParams(location.search)
      newParams.delete('action')
      const newSearch = newParams.toString()
      navigate({ search: newSearch ? `?${newSearch}` : '' }, { replace: true })
    }
  }, [autoAction, location.search, navigate])

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden">
      <header className="h-16 border-b flex items-center px-6 shrink-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold">{t('settings.title')}</h1>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <aside className="w-64 border-r p-4 flex flex-col gap-2 bg-muted/30 overflow-y-auto min-h-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 min-h-0 bg-background overflow-y-auto">
          <div className="max-w-4xl mx-auto p-10">
            {tabs.map((tab) => {
              // Lazy load: Only render if it has been visited at least once
              if (!renderedTabs.has(tab.id)) return null

              return (
                <div key={tab.id} className={cn(activeTab === tab.id ? 'block' : 'hidden')}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={activeTab === tab.id ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.2 }}
                  >
                    {tab.component}
                  </motion.div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
