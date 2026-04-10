import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useSkillStore } from '@renderer/store/useSkillStore'
import { Puzzle, RefreshCw, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { Skill, Agent } from '@shared/types/agent'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { SkillCard } from './skills/SkillCard'
import { MarketDialog } from './skills/MarketDialog'

/**
 * 技能管理主界面
 */
const SkillsTab: React.FC = () => {
  const { t } = useTranslation()
  const { agents } = useAgentStore()
  const { skills, fetchSkills, deleteSkill } = useSkillStore()

  const [loading, setLoading] = useState(false)
  const confirm = useConfirm()

  // 初始加载所有智能体的技能
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        await Promise.all(agents.map((agent) => fetchSkills(agent.id)))
      } finally {
        setLoading(false)
      }
    }
    if (agents.length > 0) {
      fetchAll()
    }
  }, [agents, fetchSkills])

  /**
   * 数据处理：按来源和智能体对技能进行分类
   * 1. built-in: 系统内置技能 (去重显示)
   * 2. managed: 远程仓库托管技能 (全局共享，去重显示)
   * 3. agentGroups: 智能体专属技能 (Workspace 模式)
   */
  const processed = useMemo(() => {
    const builtInMap = new Map<string, Skill>()
    const managedMap = new Map<string, { skill: Skill; agentId: string }>()
    const agentGroups: { agent: Agent; skills: Skill[] }[] = []

    Object.entries(skills).forEach(([agentId, agentSkills]) => {
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) return

      const workspaceSkills: Skill[] = []

      agentSkills.forEach((skill) => {
        switch (skill.source) {
          case 'built-in':
            if (!builtInMap.has(skill.name)) {
              builtInMap.set(skill.name, skill)
            }
            break
          case 'managed':
            if (!managedMap.has(skill.name)) {
              managedMap.set(skill.name, { skill, agentId })
            }
            break
          case 'workspace':
            workspaceSkills.push(skill)
            break
        }
      })

      if (workspaceSkills.length > 0) {
        agentGroups.push({ agent, skills: workspaceSkills })
      }
    })

    return {
      builtIn: Array.from(builtInMap.values()),
      managed: Array.from(managedMap.values()),
      agentGroups: agentGroups.sort((a, b) =>
        a.agent.config.name.localeCompare(b.agent.config.name)
      )
    }
  }, [skills, agents])

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all(agents.map((agent) => fetchSkills(agent.id)))
      toast.success(t('common.success'))
    } finally {
      setLoading(false)
    }
  }, [agents, fetchSkills, t])

  const handleDelete = useCallback(
    async (agentId: string, name: string) => {
      const isConfirmed = await confirm({
        title: t('common.delete'),
        description: t('skills.delete_confirm', { name }),
        variant: 'destructive'
      })

      if (isConfirmed.confirmed) {
        try {
          await deleteSkill(agentId, name)
          // 如果删除的是托管技能，可能影响多个智能体，刷新全部
          const isManaged = processed.managed.some((m) => m.skill.name === name)
          if (isManaged) {
            await Promise.all(agents.map((a) => fetchSkills(a.id)))
          }
          toast.success(t('common.success'))
        } catch (err) {
          toast.error(`${t('common.delete_failed')}: ${err}`)
        }
      }
    },
    [confirm, deleteSkill, agents, fetchSkills, processed.managed, t]
  )

  return (
    <div className="space-y-8 pb-20">
      {/* 头部区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-primary" />
            {t('skills.title')}
          </h2>
          <p className="text-xs text-muted-foreground/80 mt-1">{t('skills.desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-xl"
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            {t('skills.refresh')}
          </Button>
          <MarketDialog />
        </div>
      </div>

      {/* 系统内置技能 */}
      {processed.builtIn.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/80 uppercase tracking-widest">
            <div className="w-1 h-3 bg-primary/30 rounded-full" />
            {t('skills.built_in_group') || 'system skills'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            {processed.builtIn.map((s) => (
              <SkillCard key={`built-in-${s.name}`} skill={s} />
            ))}
          </div>
        </section>
      )}

      {/* 托管技能 (托管在远程仓库，可多智能体共享) */}
      {processed.managed.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/80 uppercase tracking-widest">
            <div className="w-1 h-3 bg-orange-400/30 rounded-full" />
            {t('skills.managed_group') || 'global shared skills'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            {processed.managed.map(({ skill, agentId }) => (
              <SkillCard
                key={`managed-${skill.name}`}
                skill={skill}
                agentId={agentId}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      {/* 智能体专属技能 (Workspace) */}
      {processed.agentGroups.length > 0 ? (
        processed.agentGroups.map(({ agent, skills }) => (
          <section key={agent.id} className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <div className="w-1 h-4 bg-primary rounded-full" />
              {agent.config.name}
              <span className="text-[10px] font-normal text-muted-foreground ml-2">
                ({skills.length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
              {skills.map((s) => (
                <SkillCard
                  key={`${agent.id}-${s.name}`}
                  skill={s}
                  agent={agent}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        ))
      ) : processed.builtIn.length === 0 && processed.managed.length === 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/80 uppercase tracking-widest">
            <div className="w-1 h-3 bg-primary/30 rounded-full" />
            {t('skills.agent_specific') || 'agent skills'}
          </div>
          <div className="border border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-muted-foreground/80 bg-muted/5">
            <Puzzle className="w-10 h-10 mb-4 opacity-30" />
            <p className="text-sm">{t('skills.empty')}</p>
          </div>
        </section>
      ) : null}

      {/* 底部信息提示 */}
      <div className="bg-muted/30 rounded-2xl p-5 border flex gap-4 mt-8">
        <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0 self-start">
          <Info className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-[11px]">
          <h5 className="font-bold text-xs uppercase tracking-wider opacity-80">
            {t('skills.category_label')}
          </h5>
          <div className="text-muted-foreground leading-relaxed space-y-1">
            {t('skills.category_desc')
              .split('<br />')
              .map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SkillsTab
