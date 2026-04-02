import React from 'react'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { toast } from 'sonner'

const DangerZone: React.FC = () => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  const handleReset = async () => {
    const isConfirmed = await confirm({
      title: t('settings.reset_app'),
      description: t('settings.reset_app_confirm'),
      variant: 'destructive',
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel')
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
  }

  return (
    <div className="space-y-6 pt-10 border-t border-destructive/20 max-w-2xl">
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-destructive flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {t('settings.danger_zone')}
        </h3>
        <p className="text-xs text-muted-foreground font-medium">{t('settings.reset_app_desc')}</p>
      </div>

      <Card className="flex items-center justify-between p-6 font-bold border-destructive/30 bg-destructive/5">
        <div>
          <h4 className="text-sm mb-1">{t('settings.reset_app')}</h4>
          <p className="text-[10px] text-destructive uppercase tracking-widest">
            {t('settings.danger_zone')}
          </p>
        </div>
        <Button variant="destructive" onClick={handleReset}>
          {t('settings.reset_app')}
        </Button>
      </Card>
    </div>
  )
}

export default DangerZone
