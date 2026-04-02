import React from 'react'
import { Card } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/store/useConfigStore'

const AgentDefaultsSettings: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()

  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 px-1">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest leading-none">
          {t('settings.agent_defaults_title')}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5 border-muted bg-muted/5 flex flex-col gap-3 group/item">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground/80">
              {t('settings.default_temperature')}
            </span>
            <span className="text-xs font-black text-primary">
              {config?.agentDefaults?.temperature || 0.7}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.1"
            value={config?.agentDefaults?.temperature || 0.7}
            onChange={(e) =>
              updateConfig({
                agentDefaults: {
                  ...(config?.agentDefaults || {}),
                  temperature: parseFloat(e.target.value)
                }
              } as any)
            }
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary group-hover/item:bg-muted-foreground/20 transition-colors"
          />
          <p className="text-[10px] text-muted-foreground/60 leading-tight">
            {t('settings.default_temperature_desc')}
          </p>
        </Card>

        <Card className="p-5 border-muted bg-muted/5 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground/80">
              {t('settings.default_max_tokens')}
            </span>
            <span className="text-xs font-black text-primary">
              {config?.agentDefaults?.maxTokens || 2048}
            </span>
          </div>
          <Select
            value={(config?.agentDefaults?.maxTokens || 2048).toString()}
            onValueChange={(val) =>
              updateConfig({
                agentDefaults: {
                  ...(config?.agentDefaults || {}),
                  maxTokens: parseInt(val)
                }
              } as any)
            }
          >
            <SelectTrigger className="h-8 border-muted/50 bg-background/50 rounded-lg text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-2xl">
              {['1024', '2048', '4096', '8192', '16384', '32768', '65536'].map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground/60 leading-tight">
            {t('settings.default_max_tokens_desc')}
          </p>
        </Card>
      </div>
    </div>
  )
}

export default AgentDefaultsSettings
