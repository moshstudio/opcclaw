import React from 'react'
import { Card } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/store/useConfigStore'

const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()

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
    <div className="space-y-6 max-w-2xl">
      <Card className="flex items-center justify-between p-6 font-bold border-muted">
        <div>
          <h4 className="text-sm mb-1">{t('settings.theme_label')}</h4>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {t('settings.theme_label')}
          </p>
        </div>
        <div className="flex gap-2 p-1 bg-muted rounded-xl border">
          {(['dark', 'light', 'system'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateConfig({ theme: mode })}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs transition-all capitalize',
                (config?.theme || 'dark') === mode
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
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {t('settings.language_label')}
          </p>
        </div>
        <Select
          value={config?.language || 'zh'}
          onValueChange={(val) => updateConfig({ language: val as 'zh' | 'en' })}
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
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {t('settings.fontSize_label')}
          </p>
        </div>
        <Select
          value={(config?.fontSize || 14).toString()}
          onValueChange={(val) => updateConfig({ fontSize: parseInt(val) })}
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
  )
}

export default AppearanceSettings
