import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps } from './types'

export const SecuritySection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()

  return (
    <CollapsibleSection
      title={t('common.security')}
      icon={<ShieldCheck />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex flex-col">
            <span className="text-[11px] font-black">{t('common.sandbox_enabled')}</span>
            <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
              {t('common.isolated_env')}
            </span>
          </div>
          <Switch
            checked={formData.sandboxEnabled}
            onCheckedChange={(v) => setFormData((prev) => ({ ...prev, sandboxEnabled: v }))}
          />
        </div>

        <AnimatePresence>
          {formData.sandboxEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/20 ml-2">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {t('common.allow_exec')}
                </span>
                <Switch
                  checked={formData.sandboxAllowExec}
                  onCheckedChange={(v) => setFormData((prev) => ({ ...prev, sandboxAllowExec: v }))}
                />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/20 ml-2">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {t('common.allow_write')}
                </span>
                <Switch
                  checked={formData.sandboxAllowWrite}
                  onCheckedChange={(v) =>
                    setFormData((prev) => ({ ...prev, sandboxAllowWrite: v }))
                  }
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CollapsibleSection>
  )
}
