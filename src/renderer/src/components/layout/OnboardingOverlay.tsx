import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogBody } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useModelStore } from '@renderer/store/useModelStore'
import { useSystemStore } from '@renderer/store/useSystemStore'
import icon from '@renderer/assets/icon.png'

export function OnboardingOverlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const models = useModelStore((s) => s.models)
  const modelsInitialized = useModelStore((s) => s.initialized)
  const isInitializing = useSystemStore((s) => s.isInitializing)

  // 仅在系统初始化完成、且模型列表仍为空时展示
  const [hasClosed, setHasClosed] = useState(false)
  const show = !isInitializing && modelsInitialized && models.length === 0 && !hasClosed

  if (!show) return null

  return (
    <Dialog open={show} onOpenChange={(open) => !open && setHasClosed(true)}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogBody className="p-10 text-center flex flex-col items-center">
          <div className="relative inline-block mb-8 mx-auto">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative p-6 rounded-3xl bg-primary/10 border border-primary/20">
              <img src={icon} className="w-12 h-12 object-contain" alt="App Icon" />
            </div>
            <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-4">{t('onboarding.title')}</h2>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-10">
            {t('onboarding.desc')}
          </p>

          <Button
            onClick={() => {
              setHasClosed(true)
              navigate('/settings?tab=models&action=add')
            }}
            size="lg"
            className="w-full py-7 rounded-2xl font-bold transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {t('onboarding.action')}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
