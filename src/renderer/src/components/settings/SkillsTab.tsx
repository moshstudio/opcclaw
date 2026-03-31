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
import { Skill, Agent } from '@shared/types/agent'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody
} from '@renderer/components/ui/dialog'

/**
 * 技能详情对话框组件
 */
const SkillDetail: React.FC<{
  skill: Skill
  agent?: Agent
  onDelete?: () => void
}> = ({ skill, agent, onDelete }) => {
  const { t } = useTranslation()

  return (
    <DialogBody className="space-y-6 py-6 font-sans">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-primary/10 rounded-2xl text-primary shrink-0">
          <Puzzle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold">{skill.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={
                skill.source === 'built-in'
                  ? 'secondary'
                  : skill.source === 'managed'
                    ? 'default'
                    : 'outline'
              }
            >
              {t(`skills.source.${skill.source}`)}
            </Badge>
            {agent && (
              <Badge variant="outline" className="text-primary/70 border-primary/30">
                {agent.config.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          {t('common.description')}
        </h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {skill.description || t('common.no_description')}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          {t('common.path')}
        </h4>
        <div className="bg-muted/50 p-3 rounded-xl border group relative overflow-hidden">
          <code className="text-xs break-all block text-muted-foreground">{skill.path}</code>
        </div>
      </div>

      {onDelete && skill.source !== 'built-in' && (
        <div className="pt-4 mt-4 border-t border-dashed">
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 rounded-xl"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
            {t('common.delete')}
          </Button>
        </div>
      )}
    </DialogBody>
  )
}

/**
 * 紧凑型技能卡片
 */
const SkillCard: React.FC<{
  skill: Skill
  agent?: Agent
  onDelete?: (agentId: string, name: string) => void
}> = ({ skill, agent, onDelete }) => {
  const { t } = useTranslation()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="p-3 flex items-start gap-3 group transition-all hover:border-primary/50 cursor-pointer hover:shadow-md hover:shadow-primary/5 active:scale-[0.98] rounded-2xl">
          <div className="p-2 bg-primary/5 rounded-xl text-primary shrink-0 group-hover:bg-primary/10 transition-colors">
            <Puzzle className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 overflow-hidden">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-xs truncate uppercase tracking-tight">{skill.name}</h4>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 leading-tight">
              {skill.description || t('common.no_description')}
            </p>
          </div>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{t('skills.detail') || 'Skill Detail'}</DialogTitle>
        </DialogHeader>
        <SkillDetail
          skill={skill}
          agent={agent}
          onDelete={onDelete ? () => onDelete(agent?.id || '', skill.name) : undefined}
        />
      </DialogContent>
    </Dialog>
  )
}

const SkillsTab: React.FC = () => {
  const { t } = useTranslation()
  const { agents } = useAgentStore()
  const { skills, fetchSkills, deleteSkill } = useSkillStore()

  const [loading, setLoading] = useState(false)
  const confirm = useConfirm()

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

  // 数据处理：分离全局与专属技能
  const processed = React.useMemo(() => {
    const builtInMap = new Map<string, Skill>()
    const managedMap = new Map<string, Skill>()
    const agentGroups: { agent: Agent; skills: Skill[] }[] = []

    Object.entries(skills).forEach(([agentId, agentSkills]) => {
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) return

      const workspaceSkills: Skill[] = []

      agentSkills.forEach((skill) => {
        if (skill.source === 'built-in') {
          if (!builtInMap.has(skill.name)) {
            builtInMap.set(skill.name, skill)
          }
        } else if (skill.source === 'managed') {
          if (!managedMap.has(skill.name)) {
            managedMap.set(skill.name, skill)
          }
        } else if (skill.source === 'workspace') {
          workspaceSkills.push(skill)
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

    if (isConfirmed.confirmed) {
      try {
        await deleteSkill(agentId, name)
        toast.success(t('common.success'))
      } catch (err) {
        toast.error(t('common.delete_failed') + ': ' + err)
      }
    }
  }

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
          <Button size="sm" className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            {t('skills.create')}
          </Button>
        </div>
      </div>

      {/* 系统内置技能 */}
      {processed.builtIn.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
            <div className="w-1 h-3 bg-primary/30 rounded-full" />
            {t('skills.built_in_group') || 'system skills'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {processed.builtIn.map((s) => (
              <SkillCard key={`built-in-${s.name}`} skill={s} />
            ))}
          </div>
        </section>
      )}

      {/* 全局共享/托管技能 */}
      {processed.managed.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
            <div className="w-1 h-3 bg-orange-400/30 rounded-full" />
            {t('skills.managed_group') || 'global shared skills'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {processed.managed.map((s) => (
              <SkillCard key={`managed-${s.name}`} skill={s} />
            ))}
          </div>
        </section>
      )}

      {/* 按照智能体分类渲染专属技能 (Workspace) */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
      ) : (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
            <div className="w-1 h-3 bg-primary/30 rounded-full" />
            {t('skills.agent_specific') || 'agent skills'}
          </div>
          <div className="border border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-muted-foreground/60 bg-muted/5">
            <Puzzle className="w-10 h-10 mb-4 opacity-10" />
            <p className="text-sm">{t('skills.empty')}</p>
          </div>
        </section>
      )}

      {/* 说明栏 */}
      <div className="bg-muted/30 rounded-2xl p-5 border flex gap-4 mt-8">
        <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0 self-start">
          <Info className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-[11px]">
          <h5 className="font-bold text-xs uppercase tracking-wider opacity-60">
            {t('skills.category_label')}
          </h5>
          <p className="text-muted-foreground leading-relaxed space-y-1">
            {t('skills.category_desc')
              .split('<br />')
              .map((line, i) => (
                <span key={i} className="block">
                  {line
                    .split('**')
                    .map((part, index) =>
                      index % 2 === 1 ? <strong key={index}>{part}</strong> : part
                    )}
                </span>
              ))}
          </p>
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
