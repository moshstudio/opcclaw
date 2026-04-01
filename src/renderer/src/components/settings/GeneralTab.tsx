import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/useSettingsStore'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import { Globe, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

const GeneralTab: React.FC = () => {
  const { t } = useTranslation()
  const { appSettings, setAppSetting } = useSettingsStore()
  const { config, updateConfig, clearRememberedChoices } = useConfigStore()
  const confirm = useConfirm()

  const [localProxy, setLocalProxy] = useState(config?.proxy || '')
  const [prevProxy, setPrevProxy] = useState(config?.proxy)

  // Sync prop to state during render to avoid cascading renders from useEffect
  if (config?.proxy !== prevProxy) {
    setPrevProxy(config?.proxy)
    setLocalProxy(config?.proxy || '')
  }

  const handleSaveProxy = async () => {
    try {
      await updateConfig({ proxy: localProxy })
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to save proxy:', err)
      toast.error(t('common.save_failed') + ': ' + err)
    }
  }

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-xl font-bold">{t('settings.app_settings')}</h2>
        <p className="text-xs text-muted-foreground font-medium">{t('settings.app_settings')}</p>
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

        <Card className="flex items-center justify-between p-6 font-bold border-muted bg-muted/10">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">
              {t('settings.clear_remembered_choices')}
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
              {t('settings.clear_remembered_choices_desc')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-9 px-4 rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all"
            onClick={async () => {
              const isConfirmed = await confirm({
                title: t('settings.clear_remembered_choices'),
                description: t('settings.clear_remembered_choices_confirm'),
                confirmText: t('common.confirm')
              })
              if (isConfirmed.confirmed) {
                try {
                  await clearRememberedChoices()
                  toast.success(t('common.success'))
                } catch (err) {
                  console.error('Failed to clear choices:', err)
                  toast.error(t('common.clear_failed') + ': ' + err)
                }
              }
            }}
          >
            {t('common.clear')}
          </Button>
        </Card>
        <Card className="p-6 font-bold border-muted">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold tracking-tight">{t('settings.global_proxy')}</h4>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none">
                  GLOBAL NETWORK PROXY (HTTP/SOCKS5)
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 group">
                <Input
                  placeholder="e.g. http://127.0.0.1:7890 或 socks5://127.0.0.1:7890"
                  value={localProxy}
                  onChange={(e) => setLocalProxy(e.target.value)}
                  className="h-10 bg-muted/40 border-muted/50 font-mono text-xs focus-visible:ring-1 focus-visible:ring-primary/20 pr-10 shadow-none hover:bg-muted/60 transition-all rounded-xl"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveProxy()
                    }
                  }}
                />
                <div className="absolute right-1 top-1 bottom-1 flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-muted-foreground/10 text-muted-foreground/60 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[260px] p-2 rounded-2xl shadow-2xl border-muted/50 backdrop-blur-xl bg-background/95"
                    >
                      <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest leading-none mb-1">
                        Quick Presets
                      </div>
                      {[
                        { label: 'Clash / Stash (7890)', value: 'http://127.0.0.1:7890' },
                        { label: 'Clash Verge / Mihomo (7897)', value: 'http://127.0.0.1:7897' },
                        { label: 'V2Ray / SS / SSR (1080)', value: 'socks5://127.0.0.1:1080' },
                        {
                          label: 'v2rayN / V2Ray Desktop (10808)',
                          value: 'socks5://127.0.0.1:10808'
                        }
                      ].map((p) => (
                        <DropdownMenuItem
                          key={p.value}
                          onClick={() => setLocalProxy(p.value)}
                          className="flex flex-col items-start gap-0.5 py-2 px-3 rounded-xl hover:bg-primary/5 cursor-pointer group"
                        >
                          <span className="text-xs font-bold transition-colors group-hover:text-primary">
                            {p.label}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/70 truncate w-full">
                            {p.value}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className={cn(
                  'h-10 px-5 rounded-xl text-xs font-extrabold shadow-sm transition-all',
                  localProxy !== (config?.proxy || '')
                    ? 'active:scale-95 hover:bg-secondary/80'
                    : 'opacity-40 cursor-not-allowed'
                )}
                disabled={localProxy === (config?.proxy || '')}
                onClick={handleSaveProxy}
              >
                {t('common.save')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-medium">
              {t('settings.global_proxy_desc')}
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-6 pt-10 border-t border-destructive/20">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-destructive flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t('settings.danger_zone')}
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            {t('settings.reset_app_desc')}
          </p>
        </div>

        <Card className="flex items-center justify-between p-6 font-bold border-destructive/30 bg-destructive/5">
          <div>
            <h4 className="text-sm mb-1">{t('settings.reset_app')}</h4>
            <p className="text-[10px] text-destructive uppercase tracking-widest">
              {t('settings.danger_zone')}
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={async () => {
              const isConfirmed = await confirm({
                title: t('settings.reset_app'),
                description: t('settings.reset_app_confirm'),
                variant: 'destructive',
                confirmText: t('common.confirm')
              })
              if (isConfirmed.confirmed) {
                try {
                  await window.api.app.reset()
                  toast.success(t('common.success'))
                } catch (err) {
                  console.error('Failed to reset app:', err)
                  toast.error(t('common.reset_failed') + ': ' + err)
                }
              }
            }}
          >
            {t('settings.reset_app')}
          </Button>
        </Card>
      </div>
    </motion.div>
  )
}

export default GeneralTab
