import React, { useState } from 'react'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { NumberInput } from '@renderer/components/ui/number-input'
import { MousePointer2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { toast } from 'sonner'
import { cn } from '@renderer/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody
} from '@renderer/components/ui/dialog'

const InteractionSettings: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig, clearRememberedChoices, deleteRememberedChoice } = useConfigStore()
  const confirm = useConfirm()

  const [localTimeout, setLocalTimeout] = useState(config?.interactionTimeout || 300)
  const [prevTimeout, setPrevTimeout] = useState(config?.interactionTimeout)

  // 校验逻辑
  const isTimeoutInvalid = localTimeout < 10 || localTimeout > 3600

  // 同步配置到本地状态
  if (config?.interactionTimeout !== prevTimeout) {
    setPrevTimeout(config?.interactionTimeout)
    setLocalTimeout(config?.interactionTimeout || 300)
  }

  const handleSaveTimeout = async () => {
    if (isTimeoutInvalid) return
    try {
      await updateConfig({ interactionTimeout: localTimeout })
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to save timeout:', err)
      toast.error(t('common.save_failed') + ': ' + err)
    }
  }

  const handleClearAll = async () => {
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
  }

  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 px-1">
        <MousePointer2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest leading-none">
          {t('settings.interaction_settings')}
        </h3>
      </div>

      <Card className="border-muted bg-background/50 backdrop-blur-sm shadow-xs overflow-hidden divide-y divide-border/40">
        {/* 超时设置 */}
        <div className="flex items-center justify-between p-6 font-bold transition-colors hover:bg-muted/5">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">
              {t('settings.interaction_timeout')}
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
              {t('settings.interaction_timeout_desc')}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NumberInput
              min={10}
              max={3600}
              value={localTimeout}
              onChange={setLocalTimeout}
              isInvalid={isTimeoutInvalid}
              errorText={t('settings.interaction_timeout_range_error', {
                defaultValue: '范围应在 10-3600 秒之间'
              })}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !isTimeoutInvalid &&
                  localTimeout !== (config?.interactionTimeout || 300)
                ) {
                  handleSaveTimeout()
                }
              }}
              className="w-32 h-9 bg-muted/40 border-muted/50 font-mono text-xs text-center rounded-xl shadow-none transition-all hover:bg-muted/60"
            />
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                'h-9 px-4 rounded-xl text-xs font-extrabold shadow-sm transition-all',
                !isTimeoutInvalid && localTimeout !== (config?.interactionTimeout || 300)
                  ? 'active:scale-95 hover:bg-secondary/80'
                  : 'opacity-40 cursor-not-allowed'
              )}
              disabled={isTimeoutInvalid || localTimeout === (config?.interactionTimeout || 300)}
              onClick={handleSaveTimeout}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>

        {/* 清除记忆 */}
        <div className="flex items-center justify-between p-6 font-bold transition-colors hover:bg-muted/5">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">
              {t('settings.clear_remembered_choices')}
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
              {t('settings.clear_remembered_choices_desc')}
            </p>
          </div>
          <div className="flex gap-2">
            {config?.rememberedChoices && Object.keys(config.rememberedChoices).length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 rounded-xl text-xs font-bold border-muted/50 hover:bg-muted/30 transition-all"
                  >
                    {t('settings.manage_remembered_choices')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {t('settings.remembered_choices_list_title', {
                        defaultValue: '已记住的选择列表'
                      })}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground font-medium">
                      {t('settings.selective_clear_prompt')}
                    </p>
                  </DialogHeader>
                  <DialogBody className="space-y-3 pb-8 max-h-[60vh] overflow-y-auto">
                    {Object.entries(config.rememberedChoices).map(([key, item]) => {
                      const isLegacy = Array.isArray(item)
                      const result = (isLegacy ? (item as any) : item?.result) || []
                      const description = isLegacy ? `[Record] ${key}` : item?.description || key

                      return (
                        <div
                          key={key}
                          className="group flex items-center justify-between p-4 bg-muted/20 border border-muted/50 rounded-2xl hover:bg-muted/30 transition-all border-dashed"
                        >
                          <div className="flex flex-col gap-1.5 min-w-0 pr-4">
                            <span className="text-xs font-bold truncate text-foreground/80 leading-tight">
                              {description}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center text-[10px] font-black h-[18px] px-2 bg-primary/10 text-primary rounded-lg uppercase tracking-tighter border border-primary/20 leading-none">
                                {result?.join?.(' / ') || 'None'}
                              </span>
                              {!isLegacy && (
                                <span className="text-[9px] font-medium text-muted-foreground/40">
                                  {new Date(item.timestamp).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                            onClick={() => deleteRememberedChoice(key)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </DialogBody>
                </DialogContent>
              </Dialog>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="h-9 px-4 rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all"
              onClick={handleClearAll}
            >
              {t('common.clear')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default InteractionSettings
