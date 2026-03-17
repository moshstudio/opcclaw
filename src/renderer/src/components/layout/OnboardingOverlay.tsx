import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Brain, Sparkles } from 'lucide-react'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

export function OnboardingOverlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const checkModels = async () => {
      const config = await window.api.config.get()
      if (!config.models || config.models.length === 0) {
        setShow(true)
      }
    }
    checkModels()
  }, [])

  if (!show) return null

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="max-w-md p-10 text-center">
        <div className="relative inline-block mb-8 mx-auto">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="relative p-6 rounded-3xl bg-primary/10 border border-primary/20 text-primary">
            <Brain className="w-12 h-12" />
          </div>
          <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-4">{t('onboarding.title')}</h2>
        <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-10">
          {t('onboarding.desc')}
        </p>

        <Button
          onClick={() => {
            setShow(false)
            navigate('/settings?tab=models&action=add')
          }}
          size="lg"
          className="w-full py-7 rounded-2xl font-bold transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.98]"
        >
          {t('onboarding.action')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
