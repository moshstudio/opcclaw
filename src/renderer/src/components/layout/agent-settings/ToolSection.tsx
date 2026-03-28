import React from 'react'
import { Wrench, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { useGatewayList } from '@renderer/hooks/useGatewayList'
import { cn } from '@renderer/lib/utils'
import { SettingsSectionProps } from './types'

interface Tool {
  name: string
  description: string
  type: string
}

export const ToolSection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()
  const {
    data: tools,
    loading,
    refresh
  } = useGatewayList<Tool>({
    method: 'tools:list',
    autoFetch: isOpen
  })

  const isEnabled = (name: string) => {
    const deny = formData.toolPolicy?.deny || []
    return !deny.includes(name)
  }

  const toggleTool = (name: string) => {
    const currentDeny = formData.toolPolicy?.deny || []
    let newDeny: string[]
    if (currentDeny.includes(name)) {
      newDeny = currentDeny.filter((n) => n !== name)
    } else {
      newDeny = [...currentDeny, name]
    }

    setFormData({
      ...formData,
      toolPolicy: {
        ...formData.toolPolicy,
        deny: newDeny,
        allow: formData.toolPolicy?.allow || []
      }
    })
  }

  return (
    <CollapsibleSection
      title={t('common.tools')}
      icon={<Wrench />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              {t('common.tools')}
            </h3>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-bold tracking-tight">
              {t('common.tools_desc', { status: `${tools.length}/${tools.length}` })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 border-l border-border/10 pl-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 sm:h-8 px-2 sm:px-3 text-xs font-bold rounded-lg border-border/60 hover:bg-muted/50"
              onClick={() => refresh()}
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5 mr-1.5 text-muted-foreground/40', loading && 'animate-spin')}
              />
              {t('common.refresh_config')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center justify-between p-3 rounded-2xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/20 transition-all group shadow-sm shadow-primary/[0.01]"
            >
              <div className="flex flex-col min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-foreground tracking-tight truncate">
                    {tool.name}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 bg-muted/5 px-1 rounded border border-border/10">
                    {tool.type}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 line-clamp-2 mt-0.5 leading-relaxed font-bold tracking-tight">
                  {tool.description}
                </p>
              </div>
              <Switch
                checked={isEnabled(tool.name)}
                onCheckedChange={() => toggleTool(tool.name)}
              />
            </div>
          ))}
          {!loading && tools.length === 0 && (
            <div className="py-8 flex flex-col items-center justify-center border border-dashed border-border/10 rounded-2xl text-muted-foreground/40">
              <span className="text-[10px] font-bold">{t('common.no_tools')}</span>
            </div>
          )}
          {loading && tools.length === 0 && (
            <div className="py-8 flex justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-primary/20" />
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  )
}
