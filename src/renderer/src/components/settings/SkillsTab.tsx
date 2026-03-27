import React, { useEffect, useState } from 'react'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useSkillStore } from '@renderer/store/useSkillStore'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Puzzle, Trash2, RefreshCw, Plus, FolderOpen, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { Skill } from '@shared/types/agent'

const SkillsTab: React.FC = () => {
  const { t } = useTranslation()
  const { agents } = useAgentStore()
  const { skills, fetchSkills, deleteSkill } = useSkillStore()

  const [loading, setLoading] = useState(false)
  const confirm = useConfirm()

  // 1. 发起全局拉取
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      await Promise.all(agents.map((agent) => fetchSkills(agent.id)))
      setLoading(false)
    }
    if (agents.length > 0) {
      fetchAll()
    }
  }, [agents, fetchSkills])

  // 2. 数据处理：平铺并聚合信息
  const processedSkills = React.useMemo(() => {
    const builtInMap = new Map<string, Skill>()
    const workspaceSkills: (Skill & { agentName: string; agentId: string })[] = []
    const managedSkills: (Skill & { agentName: string; agentId: string })[] = []

    Object.entries(skills).forEach(([agentId, agentSkills]) => {
      const agent = agents.find((a) => a.id === agentId)
      const agentName = agent?.config.name || t('common.unknown')

      agentSkills.forEach((skill) => {
        if (skill.source === 'built-in') {
          // 内置技能去重
          if (!builtInMap.has(skill.name)) {
            builtInMap.set(skill.name, skill)
          }
        } else if (skill.source === 'workspace') {
          workspaceSkills.push({ ...skill, agentName, agentId })
        } else {
          managedSkills.push({ ...skill, agentName, agentId })
        }
      })
    })

    return {
      builtIn: Array.from(builtInMap.values()),
      workspace: workspaceSkills,
      managed: managedSkills
    }
  }, [skills, agents, t])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await Promise.all(agents.map((agent) => fetchSkills(agent.id)))
      toast.success(t('common.success'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (agentId: string, name: string) => {
    const isConfirmed = await confirm({
      title: t('common.delete'),
      description: t('skills.delete_confirm', { name }),
      variant: 'destructive'
    })

    if (isConfirmed) {
      try {
        await deleteSkill(agentId, name)
        toast.success(t('common.success'))
      } catch (err) {
        toast.error('删除失败: ' + err)
      }
    }
  }

  const renderSkillCard = (
    skill: Skill & { agentName?: string; agentId?: string },
    showOwner = false
  ) => (
    <Card
      key={`${skill.agentId || 'global'}-${skill.name}`}
      className="p-5 flex flex-col gap-4 group transition-all hover:border-primary/50 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0">
            <Puzzle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm">{skill.name}</h4>
              <Badge
                variant={
                  skill.source === 'built-in'
                    ? 'secondary'
                    : skill.source === 'managed'
                      ? 'default'
                      : 'outline'
                }
                className="text-[10px] h-4 px-1.5"
              >
                {t(`skills.source.${skill.source}`)}
              </Badge>
              {showOwner && skill.agentName && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-primary/30 text-primary/70"
                >
                  {skill.agentName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {skill.description || t('common.no_description')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-auto pt-4 border-t border-muted/50">
        <div className="flex-1 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
          <FolderOpen className="w-3 h-3 shrink-0" />
          <span className="truncate">{skill.path}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Info className="w-3.5 h-3.5" />
          </Button>
          {skill.source !== 'built-in' && skill.agentId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => handleDelete(skill.agentId!, skill.name)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-primary" />
            {t('skills.title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t('skills.desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            {t('skills.refresh')}
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('skills.create')}
          </Button>
        </div>
      </div>

      {/* 系统内置技能 */}
      {processedSkills.builtIn.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <div className="w-1 h-4 bg-primary/40 rounded-full" />
            系统内置基础技能 (Deduplicated)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {processedSkills.builtIn.map((s) => renderSkillCard(s))}
          </div>
        </section>
      )}

      {/* 专用与托管技能 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <div className="w-1 h-4 bg-orange-400/40 rounded-full" />
          专属与扩展技能 (Agent Specific)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...processedSkills.managed, ...processedSkills.workspace].length === 0 ? (
            <div className="col-span-full border border-dashed rounded-3xl p-20 flex flex-col items-center justify-center text-muted-foreground">
              <Puzzle className="w-10 h-10 mb-4 opacity-10" />
              <p className="text-sm">{t('skills.empty')}</p>
            </div>
          ) : (
            [...processedSkills.managed, ...processedSkills.workspace].map((s) =>
              renderSkillCard(s, true)
            )
          )}
        </div>
      </section>

      <div className="bg-muted/30 rounded-2xl p-6 border flex gap-4">
        <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0 self-start">
          <Info className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h5 className="font-bold text-sm">{t('skills.category_label')}</h5>
          <p
            className="text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t('skills.category_desc') }}
          />
        </div>
      </div>
    </div>
  )
}

/** 辅助工具 */
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default SkillsTab
