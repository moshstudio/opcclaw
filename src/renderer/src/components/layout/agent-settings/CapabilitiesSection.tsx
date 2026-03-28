import React, { useState, useEffect } from 'react'
import { Sparkles, Settings2, Zap, Wrench, Boxes, FileCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps, AgentSettingsFormData } from './types'
import { getGatewayClient } from '@renderer/services/gateway-client'

export const CapabilitiesSection: React.FC<SettingsSectionProps & { agentId: string }> = ({
  formData,
  setFormData,
  isOpen,
  onToggle,
  agentId
}) => {
  const { t } = useTranslation()
  const [tools, setTools] = useState<{ name: string; description: string }[]>([])
  const [skills, setSkills] = useState<{ name: string; path: string }[]>([])

  useEffect(() => {
    if (isOpen) {
      const fetchToolsAndSkills = async () => {
        try {
          const client = getGatewayClient()
          const [toolsRes, skillsRes] = await Promise.all([
            client.request<{ tools: { name: string; description: string }[] }>('tools:list'),
            client.request<{ skills: { name: string; path: string }[] }>('skills:list', { agentId })
          ])
          setTools(toolsRes.tools)
          setSkills(skillsRes.skills)
        } catch (err) {
          console.error('Failed to fetch tools/skills:', err)
        }
      }
      fetchToolsAndSkills()
    }
  }, [isOpen, agentId])

  return (
    <CollapsibleSection
      title={t('common.capabilities')}
      icon={<Sparkles />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-6">
        {/* 开关部分 */}
        <div className="grid grid-cols-1 gap-2.5">
          {[
            {
              id: 'enableMemory',
              label: t('common.enable_memory'),
              icon: <Settings2 />
            },
            { id: 'enableSkills', label: t('common.enable_skills'), icon: <Zap /> }
          ].map((cap) => (
            <div
              key={cap.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-muted/10 border border-border/20 shadow-sm transition-all hover:bg-muted/15"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-background text-muted-foreground shadow-sm group-hover:text-primary transition-colors">
                  {React.cloneElement(cap.icon as React.ReactElement<any>, {
                    className: 'w-3.5 h-3.5'
                  })}
                </div>
                <span className="text-sm font-bold text-foreground/80 tracking-tight">
                  {cap.label}
                </span>
              </div>
              <Switch
                checked={!!formData[cap.id as keyof AgentSettingsFormData]}
                onCheckedChange={(v) => setFormData((prev) => ({ ...prev, [cap.id]: v }))}
              />
            </div>
          ))}
        </div>

        {/* 工具列表 */}
        <div className="space-y-3 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-muted-foreground/60" />
              <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                {t('common.tools')}
              </h4>
            </div>
            <span className="text-[9px] font-bold text-muted-foreground/30 px-2 py-0.5 rounded-full bg-muted/10 border border-border/20">
              {tools.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {tools.length > 0 ? (
              tools.map((tool) => (
                <div
                  key={tool.name}
                  className="group flex flex-col p-2.5 rounded-xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/20 transition-all cursor-default"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors shrink-0" />
                    <span className="text-xs font-black text-foreground/70 group-hover:text-primary transition-colors truncate">
                      {tool.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 line-clamp-1 group-hover:line-clamp-none transition-all">
                    {tool.description}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[9px] text-muted-foreground/40 italic">{t('common.no_tools')}</p>
            )}
          </div>
        </div>

        {/* 技能列表 */}
        {formData.enableSkills && (
          <div className="space-y-3 px-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-3 h-3 text-muted-foreground/60" />
                <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                  {t('common.skills')}
                </h4>
              </div>
              <span className="text-[9px] font-bold text-muted-foreground/30 px-2 py-0.5 rounded-full bg-muted/10 border border-border/20">
                {skills.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {skills.length > 0 ? (
                skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/20 transition-all group"
                  >
                    <div className="p-1 rounded-lg bg-background shadow-xs text-muted-foreground/40 group-hover:text-primary transition-colors">
                      <FileCode className="w-3 h-3" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-foreground/80 truncate">
                        {skill.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 font-mono truncate">
                        {skill.path.split(/[\\/]/).slice(-3).join('/')}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-2 px-1 text-[9px] text-muted-foreground/40 italic flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                  {t('common.no_skills')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
