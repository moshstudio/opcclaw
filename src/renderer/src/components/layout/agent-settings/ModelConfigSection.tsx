import React from 'react'
import { Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { useModelStore } from '@renderer/store/useModelStore'
import { SettingsSectionProps } from './types'

export const ModelConfigSection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()
  const { models } = useModelStore()

  return (
    <CollapsibleSection
      title={t('common.model_config')}
      icon={<Cpu />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
            {t('common.model_select')}
          </label>
          <Select
            value={formData.modelSelectId}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, modelSelectId: v }))}
          >
            <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">
                {t('common.use_default_model')}
              </SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('settings.temperature_label')}
            </label>
            <Input
              type="number"
              step="0.1"
              value={formData.temperature}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
              }
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('common.reasoning')}
            </label>
            <Select
              value={formData.reasoning}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, reasoning: v }))}
            >
              <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['minimal', 'low', 'medium', 'high', 'xhigh'].map((r) => (
                  <SelectItem key={r} value={r} className="text-xs uppercase font-bold">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('common.context_tokens')}
            </label>
            <Input
              type="number"
              value={formData.contextTokens}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, contextTokens: parseInt(e.target.value) }))
              }
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              {t('settings.maxTokens_label')}
            </label>
            <Input
              type="number"
              value={formData.maxTokens}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) }))
              }
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
