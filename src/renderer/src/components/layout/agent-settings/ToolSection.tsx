import React, { useState, useEffect } from 'react'
import { Wrench, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { cn } from '@renderer/lib/utils'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { SettingsSectionProps } from './types'

interface Tool {
  name: string
  description: string
  category: string
}

export const ToolSection: React.FC<SettingsSectionProps> = ({
  formData,
  setFormData,
  isOpen,
  onToggle
}) => {
  const { t } = useTranslation()
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTools = async () => {
    setLoading(true)
    try {
      const res = await getGatewayClient().request<{ tools: Tool[] }>('tools.list')
      setTools(res.tools || [])
    } catch (err) {
      console.error('Failed to fetch tools:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && tools.length === 0) {
      fetchTools()
    }
  }, [isOpen])

  const isEnabled = (name: string) => {
    const deny = formData.toolPolicy?.deny || []
    return !deny.includes(name)
  }

  const toggleTool = (name: string) => {
    const currentDeny = [...(formData.toolPolicy?.deny || [])]
    const index = currentDeny.indexOf(name)

    let newDeny: string[]
    if (index >= 0) {
      newDeny = currentDeny.filter((n) => n !== name)
    } else {
      newDeny = [...currentDeny, name]
    }

    setFormData((prev) => ({
      ...prev,
      toolPolicy: {
        ...prev.toolPolicy,
        deny: newDeny
      }
    }))
  }

  const getPresetDeny = (preset: string) => {
    switch (preset) {
      case 'minimal':
        return tools
          .map((t) => t.name)
          .filter((name) => !['read', 'list', 'grep', 'ls'].includes(name))
      case 'coding':
        return tools
          .map((t) => t.name)
          .filter((name) => !['read', 'write', 'edit', 'list', 'grep', 'exec', 'ls'].includes(name))
      case 'chat':
        return tools.map((t) => t.name).filter((name) => !name.startsWith('memory'))
      case 'full':
      default:
        return []
    }
  }

  const applyPreset = (preset: string) => {
    const newDeny = getPresetDeny(preset)
    setFormData((prev) => ({
      ...prev,
      toolPolicy: {
        ...prev.toolPolicy,
        deny: newDeny
      }
    }))
  }

  const isPresetActive = (preset: string) => {
    if (loading || !tools.length) return false
    const currentDeny = formData.toolPolicy?.deny || []
    const presetDeny = getPresetDeny(preset)

    if (currentDeny.length !== presetDeny.length) return false
    const currentSet = new Set(currentDeny)
    return presetDeny.every((name) => currentSet.has(name))
  }

  const categories = [
    { id: 'file', label: t('common.tool_category_file', '文件') },
    { id: 'runtime', label: t('common.tool_category_runtime', '运行时') },
    { id: 'network', label: t('common.tool_category_network', '网络') },
    { id: 'memory', label: t('common.tool_category_memory', '记忆') },
    { id: 'session', label: t('common.tool_category_session', '会话') }
  ]

  const enabledCount = tools.filter((t) => isEnabled(t.name)).length

  return (
    <CollapsibleSection
      title={t('common.tools_full_access')}
      icon={<Wrench />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-6 pt-2">
        {/* Header - Stacked on mobile, row on desktop */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 pb-2">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-foreground">{t('common.tools_full_access')}</h3>
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              {
                t('common.tools_full_access_desc', {
                  status: `${enabledCount}/${tools.length || 0}`
                }) as any
              }
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 sm:h-8 px-2 sm:px-3 text-[9px] sm:text-[10px] font-bold rounded-lg border-border/60 hover:bg-muted/50"
              onClick={() => fetchTools()}
            >
              {t('common.refresh_config')}
            </Button>
          </div>
        </div>

        {/* Presets - Added flex-wrap */}
        <div className="space-y-3 px-1">
          <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
            {t('common.quick_presets')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {['minimal', 'coding', 'chat', 'full'].map((preset) => {
              const active = isPresetActive(preset)
              return (
                <Button
                  key={preset}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'h-7 sm:h-8 px-3 sm:px-4 text-[9px] sm:text-[10px] font-black rounded-xl transition-all duration-300',
                    active
                      ? 'bg-primary/10 text-primary border-primary/20 shadow-[0_4px_12px_-4px_rgba(var(--primary),0.3)] hover:bg-primary/20'
                      : 'bg-background border-border/40 text-muted-foreground/70 hover:border-primary/30 hover:text-primary hover:bg-primary/5'
                  )}
                >
                  {t(`common.preset_${preset}`)}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Categories - Grid adapts based on container width */}
        <div className="space-y-4">
          {categories.map((cat) => {
            const catTools = tools.filter((t) => t.category === cat.id)
            if (catTools.length === 0) return null

            const isSandboxDisabled = (name: string) => {
              if (!formData.sandboxEnabled) return false
              if (name === 'exec' && !formData.sandboxAllowExec) return true
              if ((name === 'write' || name === 'edit') && !formData.sandboxAllowWrite) return true
              return false
            }

            return (
              <div
                key={cat.id}
                className="p-3 sm:p-4 rounded-xl border border-border/40 bg-muted/5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-foreground/70">{cat.label}</span>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {catTools.map((tool) => {
                    const sandboxDisabled = isSandboxDisabled(tool.name)
                    const enabled = isEnabled(tool.name) && !sandboxDisabled

                    return (
                      <div
                        key={tool.name}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-xl border transition-all bg-background min-h-[54px]',
                          enabled
                            ? 'border-border/60 shadow-sm'
                            : 'border-border/20 opacity-50 grayscale'
                        )}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span
                            className={cn(
                              'text-[10px] font-black tracking-tight truncate',
                              enabled ? 'text-foreground' : 'text-muted-foreground'
                            )}
                          >
                            {tool.name}
                          </span>
                          <p className="text-[9px] font-medium text-muted-foreground/50 truncate mt-0.5 max-w-[120px] sm:max-w-[160px]">
                            {tool.description}
                          </p>
                        </div>
                        <Switch
                          checked={enabled}
                          disabled={sandboxDisabled}
                          onCheckedChange={() => toggleTool(tool.name)}
                          className="data-[state=checked]:bg-green-500 scale-90 sm:scale-100"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {loading && !tools.length && (
          <div className="py-12 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-primary/40" />
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
