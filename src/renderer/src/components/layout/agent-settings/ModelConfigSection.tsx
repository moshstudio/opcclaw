import React from 'react'
import { Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '@renderer/components/ui/number-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { useModelStore } from '@renderer/store/useModelStore'
import { MIN_CONTEXT_TOKENS, CONTEXT_RESERVE_TOKENS } from '@shared/types/agent'
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
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 px-1">
            {t('common.model_select')}
          </label>
          <Select
            value={formData.modelSelectId}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, modelSelectId: v }))}
          >
            <SelectTrigger className="h-9 rounded-xl text-sm bg-muted/20 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-sm">
                {t('common.use_default_model')}
              </SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-sm">
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 px-1">
              {t('settings.temperature_label')}
            </label>
            <NumberInput
              step={0.1}
              min={0}
              max={2}
              value={formData.temperature}
              onChange={(val) => setFormData((prev) => ({ ...prev, temperature: val }))}
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 px-1">
              {t('common.reasoning')}
            </label>
            <Select
              value={formData.reasoning}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, reasoning: v }))}
            >
              <SelectTrigger className="h-9 rounded-xl text-sm bg-muted/20 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['minimal', 'low', 'medium', 'high', 'xhigh'].map((r) => (
                  <SelectItem key={r} value={r} className="text-sm uppercase font-bold">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 pt-2">
          <div className="space-y-2">
            <div className="flex flex-col gap-1 px-1">
              <label className="text-xs font-black uppercase tracking-widest text-foreground/80">
                {t('common.context_tokens')}
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground/75 font-medium italic">
                {t('common.context_tokens_desc', {
                  reserve: Math.round(CONTEXT_RESERVE_TOKENS / 1000),
                  min: Math.round(MIN_CONTEXT_TOKENS / 1000)
                })}{' '}
                {t('common.context_tokens_warning')}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 px-1 py-1">
              {[32000, 128000, 256000, 512000, 1000000].map((v) => (
                <button
                  key={v}
                  onClick={() => setFormData((prev) => ({ ...prev, contextTokens: v }))}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all border ${
                    formData.contextTokens === v
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                      : 'bg-muted/30 text-muted-foreground/80 border-transparent hover:border-border'
                  }`}
                >
                  {v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`}
                </button>
              ))}
            </div>
            <NumberInput
              min={MIN_CONTEXT_TOKENS}
              max={2000000}
              step={1000}
              value={formData.contextTokens}
              onChange={(val) => {
                setFormData((prev) => ({
                  ...prev,
                  contextTokens: Math.min(2000000, Math.max(MIN_CONTEXT_TOKENS, val))
                }))
              }}
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm font-mono tracking-tight"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-1 px-1">
              <label className="text-xs font-black uppercase tracking-widest text-foreground/80">
                {t('settings.maxTokens_label')}
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground/75 font-medium italic">
                限制单次模型回复的最大长度。较高的值允许长篇大论，但也可能消耗更多 Token。
              </p>
            </div>
            <NumberInput
              min={1}
              max={128000}
              step={100}
              value={formData.maxTokens}
              onChange={(val) => {
                setFormData((prev) => ({ ...prev, maxTokens: Math.min(128000, Math.max(1, val)) }))
              }}
              className="h-9 bg-muted/20 border-border/40 rounded-xl text-sm font-mono tracking-tight"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
