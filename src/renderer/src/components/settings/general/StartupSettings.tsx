import React from 'react'
import { Card } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { toast } from 'sonner'

const StartupSettings: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()

  const handleToggleAutoLaunch = async (checked: boolean) => {
    try {
      await updateConfig({ autoLaunch: checked })
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to update auto launch:', err)
      toast.error(t('common.save_failed') + ': ' + err)
    }
  }

  const handleToggleMinimizeOnClose = async (checked: boolean) => {
    try {
      await updateConfig({ minimizeOnClose: checked })
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to update minimize on close:', err)
      toast.error(t('common.save_failed') + ': ' + err)
    }
  }

  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 px-1">
        <Monitor className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest leading-none">
          {t('settings.startup_settings')}
        </h3>
      </div>

      <Card className="border-muted bg-background/50 backdrop-blur-sm shadow-xs overflow-hidden divide-y divide-border/40">
        {/* 开机自启 */}
        <div className="flex items-center justify-between p-6 font-bold transition-colors hover:bg-muted/5">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">{t('settings.auto_launch')}</h4>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
              {t('settings.auto_launch_desc')}
            </p>
          </div>
          <Switch checked={!!config?.autoLaunch} onCheckedChange={handleToggleAutoLaunch} />
        </div>

        {/* 关闭软件最小化 */}
        <div className="flex items-center justify-between p-6 font-bold transition-colors hover:bg-muted/5">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">{t('settings.minimize_on_close')}</h4>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
              {t('settings.minimize_on_close_desc')}
            </p>
          </div>
          <Switch
            checked={config?.minimizeOnClose !== false}
            onCheckedChange={handleToggleMinimizeOnClose}
          />
        </div>
      </Card>
    </div>
  )
}

export default StartupSettings
