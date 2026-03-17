import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Globe, Brain, Network } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/useSettingsStore'
import { cn } from '@renderer/lib/utils'
import ModelsTab from './ModelsTab'
import GatewayTab from './GatewayTab'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

const SettingsPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { appSettings, setAppSetting } = useSettingsStore()

  const queryParams = new URLSearchParams(location.search)
  const initialTab = (queryParams.get('tab') as 'general' | 'models' | 'gateway') || 'general'
  const autoAction = queryParams.get('action')

  const [activeTab, setActiveTab] = useState<'general' | 'models' | 'gateway'>(initialTab)

  // Clear action query param after it's been captured to prevent re-triggering on tab switch
  React.useEffect(() => {
    if (autoAction) {
      const newParams = new URLSearchParams(location.search)
      newParams.delete('action')
      const newSearch = newParams.toString()
      navigate({ search: newSearch ? `?${newSearch}` : '' }, { replace: true })
    }
  }, [autoAction, location.search, navigate])

  const tabs = [
    { id: 'general', icon: Globe, label: t('settings.app_settings') },
    { id: 'models', icon: Brain, label: t('models.title') },
    { id: 'gateway', icon: Network, label: t('gateway.title') }
  ] as const

  const languageOptions = [
    { value: 'zh', label: '简体中文' },
    { value: 'en', label: 'English (US)' }
  ]

  const fontSizeOptions = [
    { value: '12', label: `12px (${t('common.small')})` },
    { value: '14', label: `14px (${t('common.normal')})` },
    { value: '16', label: `16px (${t('common.large')})` },
    { value: '18', label: `18px (${t('common.huge')})` },
    { value: '20', label: `20px (${t('common.giant')})` }
  ]

  return (
    <div className="h-full w-full bg-background flex flex-col overflow-hidden">
      <header className="h-16 border-b flex items-center px-6 shrink-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold">{t('settings.title')}</h1>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r p-4 flex flex-col gap-2 bg-muted/30">
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

        <main className="flex-1 overflow-y-auto p-10 bg-background">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'general' && (
                <motion.div
                  key="general"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-10"
                >
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold">{t('settings.app_settings')}</h2>
                    <p className="text-xs text-muted-foreground font-medium">
                      {t('settings.app_settings')}
                    </p>
                  </div>

                  <div className="space-y-6 max-w-2xl">
                    <Card className="flex items-center justify-between p-6 font-bold border-muted">
                      <div>
                        <h4 className="text-sm mb-1">{t('settings.theme_label')}</h4>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {t('settings.theme_label')}
                        </p>
                      </div>
                      <div className="flex gap-2 p-1 bg-muted rounded-xl border">
                        {(['dark', 'light', 'system'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setAppSetting('theme', mode)}
                            className={cn(
                              'px-4 py-1.5 rounded-lg text-xs transition-all capitalize',
                              appSettings.theme === mode
                                ? 'bg-primary text-primary-foreground shadow-md'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {t(`common.theme_${mode}`)}
                          </button>
                        ))}
                      </div>
                    </Card>

                    <Card className="flex items-center justify-between p-6 font-bold border-muted">
                      <div>
                        <h4 className="text-sm mb-1">{t('settings.language_label')}</h4>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {t('settings.language_label')}
                        </p>
                      </div>
                      <Select
                        value={appSettings.language}
                        onValueChange={(val) => setAppSetting('language', val as 'zh' | 'en')}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>

                    <Card className="flex items-center justify-between p-6 font-bold border-muted">
                      <div>
                        <h4 className="text-sm mb-1">{t('settings.fontSize_label')}</h4>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {t('settings.fontSize_label')}
                        </p>
                      </div>
                      <Select
                        value={appSettings.fontSize.toString()}
                        onValueChange={(val) => setAppSetting('fontSize', parseInt(val))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fontSizeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  </div>
                </motion.div>
              )}

              {activeTab === 'models' && (
                <motion.div
                  key="models"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ModelsTab autoAction={autoAction} />
                </motion.div>
              )}
              {activeTab === 'gateway' && (
                <motion.div
                  key="gateway"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <GatewayTab />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
