import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Clock,
  Settings2,
  FileEdit,
  Trash2,
  X,
  Calendar,
  Zap,
  ChevronLeft,
  Save,
  Loader2,
  Timer,
  Settings,
  History,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react'
import { useHeartbeatStore, HeartbeatTask } from '@renderer/store/useHeartbeatStore'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useConfirm } from '@renderer/hooks/use-confirm'

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
    fetchHeartbeatLogs
  } = useHeartbeatStore()

  const [editingConfigTask, setEditingConfigTask] = useState<HeartbeatTask | null>(null)
  const [editingFileTask, setEditingFileTask] = useState<HeartbeatTask | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingFile, setIsFetchingFile] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [isFetchingLogs, setIsFetchingLogs] = useState(false)

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

  const handleToggle = async (task: HeartbeatTask) => {
    try {
      await updateHeartbeatConfig({
        agentId: task.agentId,
        enabled: !task.status.enabled
      })
      toast.success(t('common.success'))
    } catch (err) {
      toast.error('Failed to toggle heartbeat')
    }
  }

  const handleTrigger = async (agentId: string) => {
    try {
      await triggerHeartbeat(agentId)
      toast.success(t('common.trigger_now') + '...')
    } catch (err) {
      toast.error('Trigger failed')
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
        toast.error('Delete failed')
      }
    }
  }

  const openFileEditor = async (task: HeartbeatTask) => {
    setEditingFileTask(task)
    setIsFetchingFile(true)
    setFileContent('') // Reset content while loading
    try {
      const content = await fetchHeartbeatFile(task.agentId)
      setFileContent(content)
    } catch (err) {
      toast.error('Failed to load file content')
      setEditingFileTask(null)
    } finally {
      setIsFetchingFile(false)
    }
  }

  const handleSaveFile = async () => {
    if (!editingFileTask) return
    setIsSaving(true)
    try {
      await saveHeartbeatFile(editingFileTask.agentId, fileContent)
      toast.success(t('common.success'))
      setEditingFileTask(null)
    } catch (err) {
      toast.error('Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!editingConfigTask) return
    setIsSaving(true)
    try {
      await updateHeartbeatConfig({
        agentId: editingConfigTask.agentId,
        intervalMs: editingConfigTask.status.intervalMs,
        activeHours: editingConfigTask.status.activeHours
      })
      toast.success(t('common.success'))
      setEditingConfigTask(null)
    } catch (err) {
      toast.error('Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const openLogsModal = async () => {
    setIsLogsModalOpen(true)
    setIsFetchingLogs(true)
    try {
      await fetchHeartbeatLogs()
    } finally {
      setIsFetchingLogs(false)
    }
  }

  const formatTimeManual = (ms: number) => {
    if (!ms || ms < 0) return '--:--:--'
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="flex-1 h-screen overflow-hidden bg-background flex flex-col relative text-foreground select-none">
      {/* Header - Height Aligned with Sidebar (64px) */}
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

      {/* Content Area - Balanced Padding */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 bg-muted/5">
        <div className="max-w-[1100px] mx-auto p-8 lg:p-10">
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
            <div className="flex flex-col gap-4">
              <AnimatePresence mode="popLayout">
                {heartbeatTasks.map((task) => (
                  <motion.div
                    key={task.agentId}
                    layout
                    initial={{ opacity: 0, scale: 0.99, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border bg-card/50 hover:bg-card transition-all duration-300 p-5 flex items-center gap-8 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5',
                      !task.status.enabled && 'opacity-60 grayscale-[0.2]'
                    )}
                  >
                    {/* Agent Identity */}
                    <div className="flex items-center gap-5 min-w-[200px] flex-1">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 transition-all duration-300',
                          task.status.enabled
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {task.agentName[0]}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-[15px] font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors">
                            {task.agentName}
                          </h2>
                          {task.status.enabled && (
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border transition-all',
                            task.status.isWithinActiveHours
                              ? 'bg-green-500/10 text-green-500 border-green-500/10'
                              : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/10'
                          )}
                        >
                          {task.status.isWithinActiveHours
                            ? t('common.running')
                            : t('common.quiet_mode')}
                        </div>
                      </div>
                    </div>

                    {/* Stats Sections */}
                    <div className="hidden sm:flex flex-col min-w-[110px] px-6 border-l border-muted/30">
                      <span className="text-[9px] uppercase font-bold text-muted-foreground/40 tracking-widest mb-1.5">
                        {t('common.next_run')}
                      </span>
                      <span className="text-sm font-mono font-semibold tabular-nums text-foreground/80">
                        {task.status.enabled ? formatTimeManual(task.status.nextDueMs) : '--:--'}
                      </span>
                    </div>

                    <div className="hidden md:flex flex-col min-w-[100px] px-6 border-l border-muted/30">
                      <span className="text-[9px] uppercase font-bold text-muted-foreground/40 tracking-widest mb-1.5">
                        {t('common.interval')}
                      </span>
                      <span className="text-sm font-bold flex items-baseline gap-1 text-foreground/80">
                        {Math.round(task.status.intervalMs / 60000)}
                        <span className="text-[10px] font-medium text-muted-foreground/40 lowercase">
                          min
                        </span>
                      </span>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 pl-6 border-l border-muted/30 ml-auto">
                      <Switch
                        checked={task.status.enabled}
                        onCheckedChange={() => handleToggle(task)}
                        className="scale-90 mr-2"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg hover:text-primary hover:bg-primary/5 transition-all"
                        onClick={() => handleTrigger(task.agentId)}
                        disabled={!task.status.enabled}
                        title={t('common.trigger_now')}
                      >
                        <Zap className="w-4.5 h-4.5 fill-current text-yellow-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg hover:text-primary hover:bg-primary/5 transition-all"
                        onClick={() => openFileEditor(task)}
                        title={t('common.edit_heartbeat')}
                      >
                        <FileEdit className="w-4.5 h-4.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg hover:text-primary hover:bg-primary/5 transition-all"
                        onClick={() => setEditingConfigTask(task)}
                        title={t('common.settings')}
                      >
                        <Settings className="w-4.5 h-4.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg hover:text-destructive hover:bg-destructive/5 text-muted-foreground/30 transition-all"
                        onClick={() => handleDelete(task.agentId)}
                        title={t('common.delete_heartbeat')}
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal - Aligned with System Standards */}
      <AnimatePresence>
        {editingFileTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 lg:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingFileTask(null)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="relative w-full max-w-4xl bg-card border rounded-2xl shadow-2xl flex flex-col h-[80vh] overflow-hidden"
            >
              <div className="px-6 py-4 flex items-center justify-between border-b bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileEdit className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight">
                      {t('common.edit_heartbeat')}
                    </h2>
                    <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest">
                      {editingFileTask.agentName}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingFileTask(null)}
                  className="rounded-lg w-8 h-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 p-6 flex flex-col min-h-0">
                {isFetchingFile ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-xs font-bold tracking-widest uppercase">
                      {t('common.loading')}...
                    </p>
                  </div>
                ) : (
                  <textarea
                    autoFocus
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder={t('common.no_content')}
                    className="flex-1 w-full bg-muted/10 p-6 font-mono text-sm text-foreground/90 resize-none focus:outline-none rounded-xl border border-white/5 custom-scrollbar leading-relaxed selection:bg-primary/20"
                  />
                )}
              </div>

              <div className="px-6 py-4 flex justify-end gap-3 border-t bg-muted/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => setEditingFileTask(null)}
                  className="px-4 h-9 text-xs font-semibold rounded-lg"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveFile}
                  disabled={isSaving}
                  className="px-6 h-9 text-xs font-bold gap-2 rounded-lg"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {t('common.save')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal - Aligned with System Standards */}
      <AnimatePresence>
        {editingConfigTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingConfigTask(null)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              className="relative w-full max-w-sm bg-card border rounded-2xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold tracking-tight">
                    {t('common.heartbeat_config')}
                  </h2>
                  <p className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-widest">
                    {editingConfigTask.agentName}
                  </p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground/40 tracking-widest flex items-center gap-2">
                      <Timer className="w-3.5 h-3.5" />
                      {t('common.interval')}
                    </label>
                    <span className="font-mono font-bold text-primary text-sm">
                      {Math.round(editingConfigTask.status.intervalMs / 60000)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="1440"
                    step="1"
                    value={Math.round(editingConfigTask.status.intervalMs / 60000)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setEditingConfigTask({
                        ...editingConfigTask,
                        status: { ...editingConfigTask.status, intervalMs: val * 60000 }
                      })
                    }}
                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground/40 tracking-widest flex items-center gap-2 px-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {t('common.active_hours')}
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest ml-1">
                        {t('common.start_time')}
                      </span>
                      <input
                        type="time"
                        value={editingConfigTask.status.activeHours?.start || '09:00'}
                        onChange={(e) =>
                          setEditingConfigTask({
                            ...editingConfigTask,
                            status: {
                              ...editingConfigTask.status,
                              activeHours: {
                                start: e.target.value,
                                end: editingConfigTask.status.activeHours?.end || '18:00'
                              }
                            }
                          })
                        }
                        className="w-full bg-muted/40 border border-transparent rounded-lg h-10 px-3 font-mono font-bold text-xs focus:outline-none focus:border-primary/30 transition-all text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest ml-1">
                        {t('common.end_time')}
                      </span>
                      <input
                        type="time"
                        value={editingConfigTask.status.activeHours?.end || '18:00'}
                        onChange={(e) =>
                          setEditingConfigTask({
                            ...editingConfigTask,
                            status: {
                              ...editingConfigTask.status,
                              activeHours: {
                                start: editingConfigTask.status.activeHours?.start || '09:00',
                                end: e.target.value
                              }
                            }
                          })
                        }
                        className="w-full bg-muted/40 border border-transparent rounded-lg h-10 px-3 font-mono font-bold text-xs focus:outline-none focus:border-primary/30 transition-all text-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => setEditingConfigTask(null)}
                    className="flex-1 h-10 text-xs font-semibold rounded-lg"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={isSaving}
                    className="flex-1 h-10 text-xs font-bold rounded-lg"
                  >
                    {t('common.save_settings')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Execution Logs Modal */}
      <AnimatePresence>
        {isLogsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogsModalOpen(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              className="relative w-full max-w-4xl bg-card border rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden"
            >
              <div className="px-6 py-4 flex items-center justify-between border-b bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <History className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight">
                      {t('common.execution_logs')}
                    </h2>
                    <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest">
                      {t('common.recent_runs')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchHeartbeatLogs()}
                    disabled={isFetchingLogs}
                    className="h-8 rounded-lg text-xs"
                  >
                    <Loader2 className={cn('w-3 h-3 mr-2', isFetchingLogs && 'animate-spin')} />
                    {t('common.refresh')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsLogsModalOpen(false)}
                    className="rounded-lg w-8 h-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {isFetchingLogs && heartbeatLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                    <p className="text-xs font-bold tracking-widest uppercase">
                      {t('common.loading')}...
                    </p>
                  </div>
                ) : heartbeatLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                    <History className="w-12 h-12 mb-4" />
                    <p className="text-xs font-bold tracking-widest uppercase">
                      {t('common.no_logs')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {heartbeatTasks.length > 0 &&
                      heartbeatLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center gap-4 p-4 rounded-xl border bg-muted/5 hover:bg-muted/10 transition-all border-white/5"
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div
                              className={cn(
                                'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0',
                                'bg-primary/5 text-primary'
                              )}
                            >
                              {log.agentName[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[13px] font-bold truncate">
                                  {log.agentName}
                                </span>
                                <span className="text-[10px] text-muted-foreground/40 font-mono">
                                  {new Date(log.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground/60 truncate">
                                <span className="font-bold text-primary/60 mr-2 uppercase text-[9px]">
                                  {log.reason}
                                </span>
                                {log.message}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            {log.durationMs !== undefined && (
                              <div className="text-[10px] font-mono font-bold text-muted-foreground/30 tabular-nums">
                                {log.durationMs}ms
                              </div>
                            )}
                            <div
                              className={cn(
                                'px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5',
                                log.status === 'success' && 'bg-green-500/10 text-green-500',
                                log.status === 'skipped' && 'bg-yellow-500/10 text-yellow-500',
                                log.status === 'failed' && 'bg-red-500/10 text-red-500'
                              )}
                            >
                              {log.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                              {log.status === 'skipped' && <HelpCircle className="w-3 h-3" />}
                              {log.status === 'failed' && <AlertCircle className="w-4 h-4" />}
                              <span className="uppercase tracking-wider">{log.status}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ScheduledTasks
