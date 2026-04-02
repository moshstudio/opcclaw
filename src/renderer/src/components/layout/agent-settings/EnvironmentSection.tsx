import React from 'react'
import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { NumberInput } from '@renderer/components/ui/number-input'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps } from './types'
import { DEFAULT_MAX_CONCURRENT_RUNS } from '@shared/types/agent'

export const EnvironmentSection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()

  return (
    <CollapsibleSection
      title={t('common.environment')}
      icon={<Zap />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              {t('common.workspace_dir')}
            </label>
            <span className="text-[10px] font-mono text-muted-foreground/40 bg-muted/10 px-1.5 py-0.5 rounded uppercase tracking-tighter">
              {t('common.workspace_full_path')}
            </span>
          </div>
          <Input
            value={formData.workspaceDir}
            onChange={(e) => setFormData((prev) => ({ ...prev, workspaceDir: e.target.value }))}
            placeholder="./workspace"
            className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm font-mono"
          />
          {formData.workspaceDir && (
            <p className="text-[10px] text-muted-foreground/40 px-1 font-mono truncate">
              {formData.workspaceDir}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('common.max_turns')}
            </label>
            <NumberInput
              value={formData.maxTurns}
              onChange={(val) => setFormData((prev) => ({ ...prev, maxTurns: val }))}
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('common.concurrency_limit')}
            </label>
            <NumberInput
              value={DEFAULT_MAX_CONCURRENT_RUNS}
              disabled
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-xs opacity-60 cursor-not-allowed"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
