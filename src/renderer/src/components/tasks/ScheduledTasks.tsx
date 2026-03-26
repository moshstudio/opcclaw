import React, { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Clock, Calendar, ChevronLeft, Loader2, History } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useHeartbeatStore, HeartbeatTask, HeartbeatLog } from '@renderer/store/useHeartbeatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useChatStore } from '@renderer/store/useChatStore'
import { useConfirm } from '@renderer/hooks/use-confirm'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

// Sub-components
import TaskListItem from './scheduled/TaskListItem'
import FileEditorModal from './scheduled/FileEditorModal'
import ConfigEditorModal from './scheduled/ConfigEditorModal'
import LogsModal from './scheduled/LogsModal'

const ScheduledTasks: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const {
    heartbeatTasks,
    fetchHeartbeatTasks,
    updateHeartbeatConfig,
    triggerHeartbeat,
    deleteHeartbeatFile,
    saveHeartbeatFile,
    fetchHeartbeatFile,
    heartbeatLogs,
    heartbeatLogsHasMore,
    heartbeatLogsLoading,
    fetchHeartbeatLogs
  } = useHeartbeatStore()

  const { setActiveAgent } = useAgentStore()
  const { switchSession } = useChatStore()
  const translateReason = (reason?: string) => {
    if (!reason) return ''
    const map: Record<string, string> = {
      requested: t('common.requested_reason'),
      scheduled: t('common.scheduled_reason'),
      exec: t('common.exec_reason'),
      retry: t('common.retry_reason'),
      interval: t('common.interval_reason'),
      'outside-active-hours': t('common.outside_active_hours'),
      'empty-content': t('common.empty_content'),
      'no-callback': t('common.no_callback'),
      'duplicate-message': t('common.duplicate_message'),
      'callback-error': t('common.callback_error'),
      'requests-in-flight': t('common.requests_in_flight')
    }
    return map[reason] || reason
  }

  // State for modals
  const [editingConfigTask, setEditingConfigTask] = useState<HeartbeatTask | null>(null)
  const [editingFileTask, setEditingFileTask] = useState<HeartbeatTask | null>(null)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Data loading
  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      await fetchHeartbeatTasks()
    } finally {
      setIsLoading(false)
    }
  }, [fetchHeartbeatTasks])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Handlers
  const handleToggle = async (task: HeartbeatTask) => {
    try {
      await updateHeartbeatConfig({
        agentId: task.agentId,
        enabled: !task.status.enabled
      })
      toast.success(t('common.success'))
    } catch (err) {
      toast.error(t('common.operation_failed'))
    }
  }

  const handleTrigger = async (task: HeartbeatTask) => {
    toast.info(t('common.starting_task', { name: task.agentName }))
    try {
      const result = await triggerHeartbeat(task.agentId)
      if (result.status === 'failed') {
        const reason = translateReason(result.reason)
        toast.error(t('common.execution_failed') + (reason ? `: ${reason}` : ''))
      } else if (result.status === 'skipped') {
        const reason = translateReason(result.reason)
        toast.info(`${t('common.skipped')}: ${reason || ''}`)
      } else {
        toast.success(t('common.execution_completed'))
      }
    } catch (err) {
      toast.error(t('common.trigger_failed'))
    }
  }

  const handleDelete = async (agentId: string) => {
    const isConfirmed = await confirm({
      title: t('common.confirm_delete'),
      description: t('common.confirm_delete_agent_desc'),
      variant: 'destructive',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel')
    })

    if (isConfirmed) {
      try {
        await deleteHeartbeatFile(agentId)
        toast.success(t('common.success'))
      } catch (err) {
        toast.error(t('common.delete_failed'))
      }
    }
  }

  const handleSaveFile = async (agentId: string, content: string) => {
    try {
      await saveHeartbeatFile(agentId, content)
      toast.success(t('common.success'))
    } catch (err) {
      toast.error(t('common.save_failed'))
      throw err
    }
  }

  const handleSaveConfig = async (config: {
    agentId: string
    intervalMs: number
    activeHours?: { start: string; end: string }
  }) => {
    try {
      await updateHeartbeatConfig(config)
      toast.success(t('common.success'))
    } catch (err) {
      toast.error(t('common.save_failed'))
      throw err
    }
  }

  const openLogsModal = async () => {
    setIsLogsModalOpen(true)
    await fetchHeartbeatLogs({ limit: 50, offset: 0 })
  }

  const handleLoadMoreLogs = async () => {
    await fetchHeartbeatLogs({
      limit: 50,
      offset: heartbeatLogs.length,
      append: true
    })
  }

  const handleLogClick = (log: HeartbeatLog) => {
    setIsLogsModalOpen(false)
    setActiveAgent(log.agentId)
    // 修复：提供规范化的 sessionKey，避免产生无前缀的副本
    switchSession(log.agentId, `${log.agentId}:heartbeat`)
    navigate('/')
  }

  return (
    <div className="flex-1 h-screen overflow-hidden bg-background flex flex-col relative text-foreground select-none">
      {/* Header */}
      <div className="h-[64px] px-8 flex items-center justify-between border-b bg-background/50 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 text-muted-foreground hover:text-primary transition-all rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-primary" />
            </div>
            <h1 className="text-[17px] font-bold tracking-tight">{t('common.scheduled_tasks')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadTasks}
            disabled={isLoading}
            className="h-9 rounded-xl border-muted/60 hover:border-primary/40 gap-2 px-4 transition-all shadow-sm active:scale-95"
          >
            <Loader2 className={cn('w-3.5 h-3.5', isLoading && 'animate-spin text-primary')} />
            <span className="text-xs font-semibold">
              {isLoading ? t('common.loading') : t('common.refresh_tasks')}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openLogsModal}
            className="h-9 rounded-xl border-muted/60 hover:border-primary/40 gap-2 px-4 transition-all shadow-sm active:scale-95"
          >
            <History className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">{t('common.execution_logs')}</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 bg-muted/5">
        <div className="max-w-[1000px] mx-auto p-4 lg:p-6">
          {heartbeatTasks.length === 0 ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-card border border-white/5 shadow-lg flex items-center justify-center mb-8">
                <Calendar className="w-8 h-8 text-primary opacity-20" />
              </div>
              <h3 className="text-lg font-bold mb-3 opacity-90">{t('common.no_heartbeats')}</h3>
              <p className="max-w-xs text-xs font-medium opacity-50 leading-relaxed">
                {t('common.heartbeat_desc')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {heartbeatTasks.map((task) => (
                  <TaskListItem
                    key={task.agentId}
                    task={task}
                    onToggle={handleToggle}
                    onTrigger={handleTrigger}
                    onDelete={handleDelete}
                    onEditFile={setEditingFileTask}
                    onEditConfig={setEditingConfigTask}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <FileEditorModal
        task={editingFileTask}
        onClose={() => setEditingFileTask(null)}
        fetchFile={fetchHeartbeatFile}
        onSave={handleSaveFile}
      />

      <ConfigEditorModal
        task={editingConfigTask}
        onClose={() => setEditingConfigTask(null)}
        onSave={handleSaveConfig}
      />

      <LogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        logs={heartbeatLogs}
        loading={heartbeatLogsLoading}
        hasMore={heartbeatLogsHasMore}
        onLoadMore={handleLoadMoreLogs}
        onLogClick={handleLogClick}
        onRefresh={() => fetchHeartbeatLogs({ limit: 50, offset: 0 })}
      />
    </div>
  )
}

export default ScheduledTasks
