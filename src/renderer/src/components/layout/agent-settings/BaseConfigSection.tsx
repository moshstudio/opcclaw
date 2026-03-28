import React from 'react'
import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps } from './types'

export const BaseConfigSection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()

  return (
    <CollapsibleSection
      title={t('common.base_config')}
      icon={<Settings2 />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
            {t('common.agent_name')}
          </label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm font-bold transition-all focus:bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
            {t('common.system_prompt')}
          </label>
          <span className="text-[10px] text-muted-foreground/40 italic px-1 block pb-1">
            {t('common.system_prompt_desc')}
          </span>
          <Textarea
            value={formData.systemPrompt}
            onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))}
            className="min-h-[140px] bg-muted/20 border-border/40 rounded-xl p-3 text-sm leading-relaxed resize-none transition-all focus:bg-background"
          />
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between p-3 bg-muted/10 border border-border/20 rounded-2xl hover:bg-muted/15 transition-all group">
            <div className="space-y-0.5">
              <label className="text-sm font-black uppercase tracking-tight text-foreground/80 group-hover:text-primary transition-colors">
                {t('common.pin_agent')}
              </label>
              <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                {t('common.pin_agent_desc')}
              </p>
            </div>
            <Switch
              checked={formData.isPinned}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isPinned: checked }))}
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
