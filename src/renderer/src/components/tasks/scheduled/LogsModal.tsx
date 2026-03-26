import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { History, X, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { HeartbeatLog } from '@renderer/store/useHeartbeatStore'

interface LogsModalProps {
  isOpen: boolean
  onClose: () => void
  logs: HeartbeatLog[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => Promise<void>
  onLogClick: (log: HeartbeatLog) => void
  onRefresh: () => Promise<void>
}

const LogsModal: React.FC<LogsModalProps> = ({
  isOpen,
  onClose,
  logs,
  loading,
  hasMore,
  onLoadMore,
  onLogClick,
  onRefresh
}) => {
  const { t } = useTranslation()
  const translateReason = (reason: string) => {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
                  <h2 className="text-sm font-bold tracking-tight">{t('common.execution_logs')}</h2>
                  <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest">
                    {t('common.recent_runs')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  disabled={loading}
                  className="h-8 rounded-lg text-xs"
                >
                  <Loader2 className={cn('w-3 h-3 mr-2', loading && 'animate-spin')} />
                  {t('common.refresh')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-lg w-8 h-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {loading && logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-xs font-bold tracking-widest uppercase">
                    {t('common.loading')}...
                  </p>
                </div>
              ) : logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <History className="w-12 h-12 mb-4" />
                  <p className="text-xs font-bold tracking-widest uppercase">
                    {t('common.no_logs')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => onLogClick(log)}
                      className="flex items-center gap-4 p-4 rounded-xl border bg-muted/5 hover:bg-muted/10 transition-all border-white/5 cursor-pointer hover:border-primary/20 group/log"
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
                            <span className="text-[13px] font-bold truncate">{log.agentName}</span>
                            <span className="text-[10px] text-muted-foreground/40 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 truncate">
                            <span className="font-bold text-primary/60 mr-2 uppercase text-[9px]">
                              {translateReason(log.reason)}
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
                          {log.status === 'success'
                            ? t('common.success_status')
                            : log.status === 'skipped'
                              ? t('common.skipped_status')
                              : log.status === 'failed'
                                ? t('common.failed_status')
                                : log.status}
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMore && (
                    <div className="pt-4 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLoadMore}
                        disabled={loading}
                        className="text-muted-foreground hover:text-primary"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          t('common.load_more')
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default LogsModal
