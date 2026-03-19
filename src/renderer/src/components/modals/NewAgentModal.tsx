import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Plus, Loader2, Info, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { cn } from '@renderer/lib/utils'

interface NewAgentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NewAgentModal: React.FC<NewAgentModalProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation()
  const { createAgent, agents } = useAgentStore()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    systemPrompt: ''
  })

  const isNameDuplicate = agents.some((a) => a.config.name === formData.name.trim())
  const isValid = formData.name.trim().length > 0 && !isNameDuplicate

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setLoading(true)
    try {
      await createAgent({
        name: formData.name.trim(),
        systemPrompt: formData.systemPrompt
      })

      onOpenChange(false)
      // Reset form
      setTimeout(
        () =>
          setFormData({
            name: '',
            systemPrompt: ''
          }),
        300
      )
    } catch (err) {
      console.error('Failed to create agent:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border border-border bg-background shadow-2xl p-0 sm:rounded-3xl flex flex-col overflow-hidden">
        <div className="pt-8 pb-4 px-6 md:px-8 border-b border-border/50 shrink-0">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                <Bot className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl font-extrabold tracking-tight text-foreground">
                  {t('common.new_agent')}
                </DialogTitle>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-bold uppercase tracking-wider opacity-60">
                  <Info className="w-3.5 h-3.5" />
                  <span>{t('common.new_agent_desc')}</span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <DialogBody className="px-6 md:px-8 py-0 flex-1">
          <form id="new-agent-form" onSubmit={handleSubmit} className="space-y-6 py-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1 flex justify-between">
                <span>{t('common.agent_name')}</span>
                {isNameDuplicate && (
                  <span className="text-destructive flex items-center gap-1 normal-case tracking-normal">
                    <AlertCircle className="w-3 h-3" />
                    {t('common.name_exists')}
                  </span>
                )}
              </label>
              <Input
                required
                autoFocus
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('common.agent_name_placeholder')}
                className={cn(
                  'h-12 bg-background border-border/50 focus-visible:ring-primary/20 rounded-2xl font-bold text-base transition-all',
                  isNameDuplicate &&
                    'border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive'
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                {t('common.system_prompt')} {t('common.optional')}
              </label>
              <Textarea
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                placeholder={t('common.system_prompt_placeholder')}
                className="min-h-[180px] bg-background border-border/50 focus-visible:ring-primary/20 rounded-2xl p-4 text-sm resize-none leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground/50 px-1">
                {t('common.new_agent_hint')}
              </p>
            </div>
          </form>
        </DialogBody>

        <DialogFooter className="px-6 md:px-8 pb-8 pt-6 flex flex-row gap-3 border-t border-border/50 bg-background shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="flex-1 h-12 font-black rounded-2xl text-muted-foreground hover:bg-muted transition-all active:scale-[0.98]"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="new-agent-form"
            disabled={loading || !isValid}
            className={cn(
              'flex-[1.5] h-12 font-black rounded-2xl shadow-xl transition-all gap-2 relative overflow-hidden group active:scale-[0.98]',
              isValid
                ? 'bg-primary text-primary-foreground shadow-primary/20 hover:shadow-primary/30'
                : 'opacity-50 pointer-events-none'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                </motion.div>
              ) : (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  <span className="uppercase tracking-wider">{t('common.confirm')}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default NewAgentModal
