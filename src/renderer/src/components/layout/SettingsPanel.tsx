import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Settings2, Save, Loader2, Bot, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useModelStore } from '@renderer/store/useModelStore'
import { AgentSettingsFormData } from './agent-settings/types'
import { BaseConfigSection } from './agent-settings/BaseConfigSection'
import { ModelConfigSection } from './agent-settings/ModelConfigSection'
import { EnvironmentSection } from './agent-settings/EnvironmentSection'
import { SecuritySection } from './agent-settings/SecuritySection'
import { FileSection } from './agent-settings/FileSection'
import { ToolSection } from './agent-settings/ToolSection'
import { SkillSection } from './agent-settings/SkillSection'
import { DEFAULT_MAX_CONCURRENT_RUNS } from '@shared/types/agent'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { UsageStats } from '@shared/types/usage'
import { Activity, Zap, TrendingUp, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ visible, onClose }) => {
  const { t } = useTranslation()
  const { agents, activeAgentId, updateAgent, deleteAgent } = useAgentStore()
  const confirm = useConfirm()
  const { models } = useModelStore()
  const [loading, setLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'usage'>('settings')
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  const editingAgent = agents.find((a) => a.id === activeAgentId)

  const [formData, setFormData] = useState<AgentSettingsFormData>({
    name: '',
    systemPrompt: '',
    modelSelectId: 'default',
    temperature: 0.7,
    reasoning: 'medium',
    contextTokens: 128000,
    maxTokens: 4096,
    enableMemory: true,
    enableSkills: true,
    enableContext: true,
    enableHeartbeat: false,
    workspaceDir: '',
    maxTurns: 20,
    maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_RUNS,
    sandboxEnabled: false,
    sandboxAllowExec: false,
    sandboxAllowWrite: true,
    isPinned: false
  })

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    base: true,
    model: false,
    file: false,
    tool: false,
    skill: false,
    environment: false,
    security: false
  })

  const [initialFormData, setInitialFormData] = useState<AgentSettingsFormData | null>(null)

  useEffect(() => {
    if (visible && editingAgent) {
      const config = editingAgent.config || {}
      const initialData: AgentSettingsFormData = {
        name: config.name || '',
        systemPrompt: config.systemPrompt || '',
        modelSelectId: 'default',
        temperature: config.temperature ?? 0.7,
        reasoning: config.reasoning || 'medium',
        contextTokens: config.contextTokens ?? 128000,
        maxTokens: config.maxTokens ?? 4096,
        enableMemory: config.enableMemory ?? true,
        enableSkills: config.enableSkills ?? true,
        enableContext: config.enableContext ?? true,
        enableHeartbeat: config.enableHeartbeat ?? false,
        workspaceDir: config.workspaceDir || '',
        maxTurns: config.maxTurns ?? 20,
        maxConcurrentRuns: config.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS,
        sandboxEnabled: config.sandbox?.enabled ?? false,
        sandboxAllowExec: config.sandbox?.allowExec ?? false,
        sandboxAllowWrite: config.sandbox?.allowWrite ?? true,
        isPinned: config.isPinned ?? editingAgent.id === 'main',
        toolPolicy: config.toolPolicy || { allow: [], deny: [] }
      }
      setFormData(initialData)
      setInitialFormData(initialData)
    }
  }, [visible, editingAgent])

  const isChanged = useMemo(() => {
    if (!initialFormData) return false
    return JSON.stringify(initialFormData) !== JSON.stringify(formData)
  }, [formData, initialFormData])

  const fetchUsageStats = useCallback(async () => {
    if (!activeAgentId) return
    setLoadingUsage(true)
    try {
      const res = (await getGatewayClient().request('usage:stats', {
        agentId: activeAgentId
      })) as { stats: UsageStats }

      if (res && res.stats) {
        setUsageStats(res.stats)
      }
    } catch (err) {
      console.error('Failed to fetch usage stats:', err)
    } finally {
      setLoadingUsage(false)
    }
  }, [activeAgentId])

  useEffect(() => {
    if (visible && activeTab === 'usage') {
      fetchUsageStats()
    }
  }, [visible, activeTab, fetchUsageStats])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleSave = async () => {
    if (!activeAgentId || !formData.name.trim() || !isChanged) return

    setLoading(true)
    try {
      const selectedModelMsg = models.find((m) => m.id === formData.modelSelectId)

      const updates: any = {
        name: formData.name,
        systemPrompt: formData.systemPrompt,
        temperature: formData.temperature,
        reasoning: formData.reasoning,
        contextTokens: formData.contextTokens,
        maxTokens: formData.maxTokens,
        enableMemory: formData.enableMemory,
        enableSkills: formData.enableSkills,
        enableContext: formData.enableContext,
        enableHeartbeat: formData.enableHeartbeat,
        workspaceDir: formData.workspaceDir || undefined,
        maxTurns: formData.maxTurns,
        maxConcurrentRuns: formData.maxConcurrentRuns,
        isPinned: formData.isPinned,
        sandbox: {
          enabled: formData.sandboxEnabled,
          allowExec: formData.sandboxAllowExec,
          allowWrite: formData.sandboxAllowWrite
        },
        toolPolicy: formData.toolPolicy
      }

      if (selectedModelMsg && formData.modelSelectId !== 'default') {
        updates.provider = selectedModelMsg.provider
        updates.model = selectedModelMsg.model
        updates.apiKey = selectedModelMsg.apiKey
        updates.baseUrl = selectedModelMsg.baseUrl
        updates.supportsVision = selectedModelMsg.supportsVision
      }

      await updateAgent(activeAgentId, updates)
      setInitialFormData({ ...formData })
    } catch (err) {
      console.error('Failed to update agent:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/10 dark:bg-black/40 backdrop-blur-[2px] z-[60] cursor-default"
          />
          <motion.div
            initial={{
              x: '100%',
              opacity: 0,
              width: isExpanded ? 800 : 420
            }}
            animate={{
              x: 0,
              opacity: 1,
              width: isExpanded ? 800 : 420
            }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{
              duration: 0.35,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="fixed top-0 right-0 h-full bg-background border-l z-[70] flex flex-col shadow-2xl overflow-hidden max-w-full will-change-transform"
          >
            <header className="h-16 flex items-center justify-between px-6 border-b shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                  <motion.div
                    animate={{ rotate: visible ? 0 : -90 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Settings2 className="w-4 h-4" />
                  </motion.div>
                </div>
                <div className="flex flex-col">
                  <h3 className="text-xs font-black uppercase tracking-widest text-foreground/90">
                    {t('common.agent_settings_title')}
                  </h3>
                  <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tighter truncate max-w-[150px]">
                    {editingAgent?.config.name || 'Settings'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-xl hover:bg-muted"
                  title={isExpanded ? t('common.collapse') : t('common.expand')}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isExpanded ? 'min' : 'max'}
                      initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="flex items-center justify-center"
                    >
                      {isExpanded ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-xl hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </header>

            <div className="px-6 border-b shrink-0 flex gap-6">
              <button
                onClick={() => setActiveTab('settings')}
                className={`h-12 text-[10px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2 ${
                  activeTab === 'settings'
                    ? 'text-primary'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Settings2 className="w-3 h-3" />
                {t('common.settings')}
                {activeTab === 'settings' && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab('usage')}
                className={`h-12 text-[10px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2 ${
                  activeTab === 'usage'
                    ? 'text-primary'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Activity className="w-3 h-3" />
                {t('common.usage_stats')}
                {activeTab === 'usage' && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            </div>

            <ScrollArea className="flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="p-5 space-y-4 pb-48">
                {!editingAgent ? (
                  <div className="h-[40vh] flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-40">
                    <Bot className="w-12 h-12 text-muted-foreground" />
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {t('common.select_agent_to_configure')}
                    </p>
                  </div>
                ) : activeTab === 'settings' ? (
                  <>
                    <BaseConfigSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.base}
                      onToggle={() => toggleSection('base')}
                    />
                    <ModelConfigSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.model}
                      onToggle={() => toggleSection('model')}
                    />
                    <FileSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.file}
                      onToggle={() => toggleSection('file')}
                      agentId={activeAgentId!}
                    />
                    <ToolSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.tool}
                      onToggle={() => toggleSection('tool')}
                    />
                    <SkillSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.skill}
                      onToggle={() => toggleSection('skill')}
                      agentId={activeAgentId!}
                    />
                    <EnvironmentSection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.environment}
                      onToggle={() => toggleSection('environment')}
                    />
                    <SecuritySection
                      formData={formData}
                      setFormData={setFormData}
                      isOpen={expandedSections.security}
                      onToggle={() => toggleSection('security')}
                    />
                  </>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {loadingUsage && !usageStats ? (
                      <div className="h-[30vh] flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-primary">
                              <Zap className="w-3 h-3" />
                              <span className="text-[10px] font-black uppercase tracking-tighter">
                                {t('common.usage_total_tokens')}
                              </span>
                            </div>
                            <div className="text-xl font-black">
                              {(usageStats?.totalTokens ?? 0).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-1">
                            {t('common.usage_details')}
                          </div>
                          <div className="rounded-2xl border bg-muted/30 divide-y overflow-hidden">
                            <div className="p-4 flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                <span className="text-[11px] font-bold">
                                  {t('common.usage_throughput')}
                                </span>
                              </div>
                              <span className="text-xs font-black">
                                {(usageStats?.avgThroughput ?? 0).toFixed(2)} t/s
                              </span>
                            </div>
                            <div className="p-4 flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <Clock className="w-4 h-4 text-blue-500" />
                                <span className="text-[11px] font-bold">
                                  {t('common.usage_avg_latency')}
                                </span>
                              </div>
                              <span className="text-xs font-black">
                                {(usageStats?.avgLatencyMs ?? 0).toFixed(0)} ms
                              </span>
                            </div>
                            <div className="p-4 flex justify-between items-center text-muted-foreground/60">
                              <div className="flex items-center gap-3">
                                <Bot className="w-4 h-4" />
                                <span className="text-[11px] font-bold">
                                  {t('common.usage_total_runs')}
                                </span>
                              </div>
                              <span className="text-xs font-black">
                                {usageStats?.runCount ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-1">
                            {t('common.usage_cache_performance')}
                          </div>
                          <div className="p-4 rounded-2xl border bg-muted/30 grid grid-cols-2 gap-8 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-muted-foreground italic tracking-tight">
                                {t('common.usage_cache_read')}
                              </span>
                              <div className="text-lg font-black text-emerald-500">
                                {(usageStats?.cacheReadTokens ?? 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-muted-foreground italic tracking-tight">
                                {t('common.usage_cache_write')}
                              </span>
                              <div className="text-lg font-black text-amber-500">
                                {(usageStats?.cacheWriteTokens ?? 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {usageStats?.errorCount ? (
                          <div className="p-4 rounded-2xl border border-destructive/20 bg-destructive/5 flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black uppercase text-destructive tracking-widest">
                                {t('common.usage_anomalies')}
                              </span>
                              <span className="text-xs font-bold">
                                {usageStats.errorCount} {t('common.usage_errors_recorded')}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchUsageStats}
                          disabled={loadingUsage}
                          className="w-full rounded-xl text-[10px] font-black uppercase tracking-widest h-9"
                        >
                          {loadingUsage ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                          {t('common.usage_refresh')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            {editingAgent && (
              <div className="p-6 border-t bg-background/80 backdrop-blur-md sticky bottom-0 z-10 flex flex-col gap-3">
                <Button
                  onClick={handleSave}
                  disabled={loading || !isChanged}
                  className={cn(
                    'w-full h-11 font-black rounded-2xl gap-2 transition-all active:scale-[0.98] group relative overflow-hidden',
                    isChanged ? 'shadow-xl shadow-primary/20 bg-primary' : 'bg-primary/50 text-foreground/40 shadow-none cursor-default'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span className="uppercase tracking-widest text-[11px]">
                        {t('common.save_settings')}
                      </span>
                    </>
                  )}
                </Button>
                {editingAgent.id !== 'main' && (
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const isConfirmed = await confirm({
                        title: t('common.confirm_delete_agent'),
                        description: t('common.confirm_delete_agent_desc'),
                        confirmText: t('common.delete'),
                        variant: 'destructive'
                      })
                      if (isConfirmed) {
                        deleteAgent(editingAgent.id)
                        onClose()
                      }
                    }}
                    className="w-full h-11 font-black shadow-xl shadow-destructive/20 rounded-2xl gap-2 transition-all active:scale-[0.98] group relative overflow-hidden"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="uppercase tracking-widest text-[11px]">
                      {t('common.delete')}
                    </span>
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default SettingsPanel
