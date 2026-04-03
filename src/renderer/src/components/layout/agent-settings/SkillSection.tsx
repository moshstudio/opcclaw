import React, { useState, useMemo } from 'react'
import { Boxes, Search, RefreshCw, FileCode, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps } from './types'
import { useGatewayList } from '@renderer/hooks/useGatewayList'
import { cn } from '@renderer/lib/utils'

interface SkillInfo {
  name: string
  path: string
  description?: string
  isBuiltin?: boolean
}

export const SkillSection: React.FC<SettingsSectionProps & { agentId: string }> = ({
  formData,
  isOpen,
  onToggle,
  agentId
}) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const skillParams = useMemo(() => ({ agentId }), [agentId])
  const {
    data: skills,
    loading,
    refresh
  } = useGatewayList<SkillInfo>({
    method: 'skills:list',
    params: skillParams,
    autoFetch: isOpen
  })

  const filteredSkills = useMemo(() => {
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(search.toLowerCase())
    )
  }, [skills, search])

  const builtinSkills = filteredSkills.filter((s) => s.isBuiltin)
  const extraSkills = filteredSkills.filter((s) => !s.isBuiltin)

  const isEnabled = (_name: string) => formData.enableSkills

  return (
    <CollapsibleSection
      title={t('common.skills')}
      icon={<Boxes />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-6 pt-1">
        <div className="flex flex-col gap-3 px-1">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                {t('common.skills')}
              </h3>
              <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-bold tracking-tight">
                {t('common.skills_desc', { status: `${skills.length}/${skills.length}` })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg group"
              onClick={() => refresh()}
            >
              <RefreshCw
                className={cn(
                  'w-3 h-3 text-muted-foreground/75 group-hover:text-primary transition-colors',
                  loading && 'animate-spin'
                )}
              />
            </Button>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-2.5 w-3 h-3 text-muted-foreground/75 group-focus-within:text-primary transition-colors" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search_skills')}
              className="h-9 pl-9 bg-muted/20 border-border/40 rounded-xl text-xs font-bold tracking-tight shadow-inner"
            />
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg bg-muted/5 border-border/10 hover:bg-primary/5 hover:border-primary/20 hover:text-primary transition-all shadow-sm"
            >
              {t('common.use_all')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg bg-muted/5 border-border/10 hover:bg-destructive/5 hover:border-destructive/20 hover:text-destructive transition-all shadow-sm"
            >
              {t('common.disable_all')}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {extraSkills.length > 0 && (
            <div className="space-y-3 px-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-black uppercase tracking-[0.2em] px-1">
                <span>{t('common.extra_skills')}</span>
                <span className="bg-muted/10 px-1 rounded-sm border border-border/20">
                  {extraSkills.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {extraSkills.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/20 transition-all group shadow-sm shadow-primary/[0.01]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-background shadow-xs text-muted-foreground/60 group-hover:text-primary transition-colors">
                          <FileCode className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-foreground tracking-tight truncate">
                            {skill.name}
                          </span>
                        </div>
                      </div>
                      <Switch checked={isEnabled(skill.name)} />
                    </div>
                    {skill.description && (
                      <p className="text-[10px] text-muted-foreground/80 line-clamp-2 px-1 py-0.5 leading-relaxed font-bold tracking-tight">
                        {skill.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 pt-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      <span className="text-[9px] font-mono text-muted-foreground/75 truncate">
                        {skill.path.split(/[\\/]/).slice(-3).join('/')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {builtinSkills.length > 0 && (
            <div className="space-y-3 px-1">
              <div className="flex items-center justify-between text-[8px] text-muted-foreground/60 font-black uppercase tracking-[0.2em] px-1">
                <span>{t('common.builtin_skills')}</span>
                <span className="bg-muted/10 px-1 rounded-sm border border-border/20">
                  {builtinSkills.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                <div className="py-8 flex flex-col items-center justify-center border border-dashed border-border/20 rounded-2xl">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground/20" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/20 mt-2">
                    {t('common.no_builtin_skills')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading && !skills.length && (
          <div className="py-12 flex justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-primary/40" />
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
