import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Zap, FileEdit, Settings, Trash2, Timer } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { formatDuration } from '@renderer/lib/time'
import { HeartbeatTask } from '@renderer/store/useHeartbeatStore'

interface TaskListItemProps {
  task: HeartbeatTask
  onToggle: (task: HeartbeatTask) => void
  onTrigger: (task: HeartbeatTask) => void
  onDelete: (agentId: string) => void
  onEditFile: (task: HeartbeatTask) => void
  onEditConfig: (task: HeartbeatTask) => void
}

const TaskListItem: React.FC<TaskListItemProps> = ({
  task,
  onToggle,
  onTrigger,
  onDelete,
  onEditFile,
  onEditConfig
}) => {
  const { t } = useTranslation()

  const formatTimeManual = (ms: number) => {
    if (!ms || ms < 0) return '--:--'
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.99, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-card/50 hover:bg-card transition-all duration-300 px-4 py-3 flex items-center gap-4 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5',
        !task.status.enabled && 'opacity-60 grayscale-[0.2]',
        task.status.isRunning &&
          'border-yellow-500/50 bg-yellow-500/[0.02] shadow-[0_0_20px_rgba(234,179,8,0.15)]'
      )}
    >
      {/* Agent Identity */}
      <div className="flex items-center gap-3 min-w-[180px] flex-1">
        <div
          className={cn(
            'w-[42px] h-[42px] rounded-xl flex items-center justify-center font-bold text-base shrink-0 transition-all duration-300',
            task.status.enabled
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {task.agentName[0]}
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors truncate">
              {task.agentName}
            </h2>
            {task.status.enabled && (
              <motion.div
                animate={
                  task.status.isRunning
                    ? {
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5]
                      }
                    : {}
                }
                transition={{ duration: 2, repeat: Infinity }}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-500 shrink-0',
                  task.status.isRunning
                    ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]'
                    : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                )}
              />
            )}
          </div>
          {task.status.isRunning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: -5 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500"></span>
              </span>
              <span className="text-[9px] font-bold text-yellow-500 uppercase tracking-widest leading-none">
                {t('common.executing')}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Stats Sections */}
      <div className="hidden lg:flex flex-col min-w-[100px] px-4 border-l border-muted/30">
        <span className="text-[9px] uppercase font-bold text-muted-foreground/40 tracking-widest mb-1">
          {t('common.last_run')}
        </span>
        <span className="text-[13px] font-mono font-semibold text-foreground/70 tabular-nums">
          {task.status.lastRunMs > 0 ? formatTimeManual(task.status.lastRunMs) : '--:--'}
        </span>
      </div>

      <div className="hidden sm:flex flex-col min-w-[120px] px-4 border-l border-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={cn(
              'text-[9px] uppercase font-bold tracking-widest',
              task.status.forcedNextDueMs ? 'text-primary/70' : 'text-muted-foreground/40'
            )}
          >
            {task.status.forcedNextDueMs ? t('common.scheduled_start') : t('common.next_run')}
          </span>
          {!task.status.isWithinActiveHours && task.status.enabled && (
            <span className="text-[8px] bg-muted px-1 rounded text-muted-foreground/60 font-medium">
              {t('common.outside_active_hours')}
            </span>
          )}
        </div>
        <span
          className={cn(
            'text-[13px] font-mono font-semibold tabular-nums transition-all',
            task.status.forcedNextDueMs
              ? 'text-primary italic animate-pulse-subtle'
              : !task.status.isWithinActiveHours && task.status.enabled
                ? 'text-muted-foreground/40 line-through decoration-muted-foreground/20'
                : 'text-foreground/80'
          )}
        >
          {task.status.enabled ? formatTimeManual(task.status.nextDueMs) : '--:--'}
        </span>
      </div>

      <div className="hidden md:flex flex-col min-w-[100px] px-4 border-l border-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <Timer className="w-[10px] h-[10px] text-muted-foreground/40" />
          <span className="text-[9px] uppercase font-bold text-muted-foreground/40 tracking-widest">
            {t('common.interval')}
          </span>
        </div>
        <span className="text-[13px] font-mono font-bold flex items-baseline gap-1 text-foreground/80 tabular-nums">
          {formatDuration(task.status.intervalMs, t)}
        </span>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1 pl-4 border-l border-muted/30 ml-auto">
        <Switch
          checked={task.status.enabled}
          onCheckedChange={() => onToggle(task)}
          className="scale-[0.88] mr-1"
        />
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-[34px] w-[34px] rounded-lg transition-all relative overflow-hidden',
              task.status.isRunning
                ? 'text-yellow-500 cursor-default bg-yellow-400/10 border-yellow-400/40 shadow-[0_0_15px_rgba(234,179,8,0.3)] ring-1 ring-yellow-400/50'
                : 'hover:text-primary hover:bg-primary/5'
            )}
            onClick={() => !task.status.isRunning && onTrigger(task)}
            disabled={task.status.isRunning}
            title={t('common.trigger_now')}
          >
            {task.status.isRunning ? (
              <Zap className="w-[17px] h-[17px] fill-current text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
            ) : (
              <Zap
                className={cn(
                  'w-[17px] h-[17px] fill-current',
                  task.status.enabled ? 'text-yellow-500' : 'text-muted-foreground/40'
                )}
              />
            )}

            {/* Golden shimmer and pulse effect when running */}
            {task.status.isRunning && (
              <>
                <motion.div
                  className="absolute inset-0 bg-yellow-400/10"
                  animate={{
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/40 to-transparent -translate-x-full"
                  animate={{
                    translateX: ['100%', '-100%']
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
              </>
            )}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-[34px] w-[34px] rounded-lg hover:text-primary hover:bg-primary/5 transition-all"
          onClick={() => onEditFile(task)}
          title={t('common.edit_heartbeat')}
        >
          <FileEdit className="w-[17px] h-[17px]" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-[34px] w-[34px] rounded-lg hover:text-primary hover:bg-primary/5 transition-all"
          onClick={() => onEditConfig(task)}
          title={t('common.settings')}
        >
          <Settings className="w-[17px] h-[17px]" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-[34px] w-[34px] rounded-lg hover:text-destructive hover:bg-destructive/5 text-muted-foreground/30 transition-all"
          onClick={() => onDelete(task.agentId)}
          title={t('common.delete_heartbeat')}
        >
          <Trash2 className="w-[17px] h-[17px]" />
        </Button>
      </div>
    </motion.div>
  )
}

export default TaskListItem
