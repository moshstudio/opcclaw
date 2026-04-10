import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, X, Search, Loader2, Puzzle, Download, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useSkillStore } from '@renderer/store/useSkillStore'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Card } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { RepoManageDialog } from './RepoManageDialog'

interface SkillExploreItem {
  name: string
  path: string
  fullPath: string
  description?: string
}

/**
 * 技能市场/添加对话框
 */
export const MarketDialog: React.FC = () => {
  const { t } = useTranslation()
  const { config } = useConfigStore()
  const { agents } = useAgentStore()
  const { fetchSkills } = useSkillStore()

  const [open, setOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [skills, setSkills] = useState<SkillExploreItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [targetAgent, setTargetAgent] = useState<string>('main')
  const [targetSource, setTargetSource] = useState<'workspace' | 'managed'>('managed')
  const [displayLimit, setDisplayLimit] = useState(60)

  useEffect(() => {
    if (open && config?.skillsRepositories?.length && !selectedRepo) {
      setSelectedRepo(config.skillsRepositories[0].url)
    }
  }, [open, config, selectedRepo])

  const fetchRepoSkills = useCallback(
    async (refresh = false) => {
      if (!selectedRepo) return
      setLoading(true)
      try {
        const repo = config?.skillsRepositories?.find((r) => r.url === selectedRepo)
        const res = await getGatewayClient().request<{
          skills: SkillExploreItem[]
        }>('skills:repo:explore', {
          url: selectedRepo,
          branch: repo?.branch,
          refresh
        })
        setSkills(res.skills || [])
        if (refresh) {
          toast.success(t('common.success'))
        }
      } catch (err) {
        toast.error(t('skills.pull_failed') || 'Failed to pull skills')
      } finally {
        setLoading(false)
      }
    },
    [selectedRepo, config, t]
  )

  useEffect(() => {
    if (open && selectedRepo) {
      fetchRepoSkills()
    }
  }, [open, selectedRepo, fetchRepoSkills])

  useEffect(() => {
    setDisplayLimit(60)
  }, [search])

  const handleInstall = async (skill: SkillExploreItem) => {
    setInstalling(skill.name)
    try {
      const repo = config?.skillsRepositories?.find((r) => r.url === selectedRepo)
      await getGatewayClient().request('skills:repo:install', {
        agentId: targetAgent,
        target: targetSource,
        url: selectedRepo,
        branch: repo?.branch,
        path: skill.fullPath || skill.path,
        name: skill.name
      })
      toast.success(t('skills.install_success'))
      fetchSkills(targetAgent)
    } catch (err) {
      toast.error(t('skills.install_failed') + ': ' + err)
    } finally {
      setInstalling(null)
    }
  }

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return skills.filter(
      (item) => item.name.toLowerCase().includes(s) || item.description?.toLowerCase().includes(s)
    )
  }, [skills, search])

  const displayed = filtered.slice(0, displayLimit)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl">
          <Plus className="w-4 h-4 mr-2" />
          {t('skills.create')}
        </Button>
      </DialogTrigger>
      <DialogContent
        hideClose
        className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl"
      >
        <DialogHeader className="h-20 px-8 border-b flex flex-row items-center justify-between space-y-0 text-left">
          <DialogTitle className="text-xl">{t('skills.market_title')}</DialogTitle>
          <div className="flex items-center gap-3">
            <Select value={selectedRepo} onValueChange={setSelectedRepo}>
              <SelectTrigger className="w-64 h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(config?.skillsRepositories || []).map((r) => (
                  <SelectItem key={r.url} value={r.url}>
                    {r.url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RepoManageDialog />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-10 w-10 text-muted-foreground hover:text-primary transition-colors"
              onClick={() => fetchRepoSkills(true)}
              disabled={loading}
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl opacity-70 hover:opacity-100 transition-all h-10 w-10"
              >
                <X className="w-6 h-6" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="p-4 border-b bg-muted/20 flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              className="pl-10 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('common.target')}:</span>
            <Select value={targetAgent} onValueChange={setTargetAgent}>
              <SelectTrigger className="w-32 h-8 rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetSource} onValueChange={(v: any) => setTargetSource(v)}>
              <SelectTrigger className="w-24 h-8 rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="managed">{t('skills.source.managed')}</SelectItem>
                <SelectItem value="workspace">{t('skills.source.workspace')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          {!open ? null : loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('skills.pulling')}</p>
            </div>
          ) : displayed.length > 0 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayed.map((skill) => (
                  <motion.div
                    key={skill.path}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="p-5 h-full flex flex-col justify-between group hover:border-primary/20 transition-all duration-200 rounded-2xl bg-card border-muted/30 hover:shadow-md relative overflow-hidden">
                      <div className="space-y-3 relative z-10">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-primary/5 rounded-xl text-primary group-hover:bg-primary/10 transition-all duration-200 shadow-inner group-hover:shadow-sm">
                            <Puzzle className="w-4 h-4 transition-transform duration-200" />
                          </div>
                          <h4 className="font-bold text-sm truncate uppercase tracking-tight group-hover:text-primary transition-colors">
                            {skill.name}
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground/80 line-clamp-3 min-h-[48px] leading-relaxed group-hover:text-foreground/90 transition-colors">
                          {skill.description || t('common.no_description')}
                        </p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-muted/10 flex justify-between items-center gap-2 relative z-10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-xl h-8 px-3 text-[10px] text-muted-foreground hover:text-primary gap-1.5 transition-colors group/view font-bold tracking-wider"
                          onClick={() => {
                            const repo = config?.skillsRepositories?.find(
                              (r) => r.url === selectedRepo
                            )
                            const branch = repo?.branch || 'main'
                            window.open(
                              `https://github.com/${selectedRepo}/tree/${branch}/${skill.path}`,
                              '_blank'
                            )
                          }}
                        >
                          <ExternalLink className="w-3 h-3 group-hover/view:translate-x-0.5 transition-transform" />
                          {t('skills.repo_visit') || 'VIEW'}
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-xl h-8 px-4 gap-2 font-bold shadow-sm"
                          onClick={() => handleInstall(skill)}
                          disabled={!!installing}
                        >
                          {installing === skill.name ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {t('skills.install')}
                        </Button>
                      </div>

                      {/* 饰品背景 */}
                      <div className="absolute -right-4 -bottom-4 opacity-[0.01] transition-all duration-300 pointer-events-none">
                        <Puzzle className="w-24 h-24" />
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
              {filtered.length > displayLimit && (
                <div className="flex justify-center pb-10">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setDisplayLimit((prev) => prev + 60)}
                  >
                    {t('common.show_more') || 'Show More'} ({filtered.length - displayLimit}{' '}
                    remaining)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Puzzle className="w-12 h-12 mb-4 opacity-20" />
              <p>{t('common.no_results')}</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
