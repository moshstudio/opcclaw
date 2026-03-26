import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Settings2, Timer, Calendar } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { HeartbeatTask } from '@renderer/store/useHeartbeatStore'

interface ConfigEditorModalProps {
  task: HeartbeatTask | null
  onClose: () => void
  onSave: (config: {
    agentId: string
    intervalMs: number
    activeHours?: { start: string; end: string }
  }) => Promise<void>
}

const ConfigEditorModal: React.FC<ConfigEditorModalProps> = ({ task, onClose, onSave }) => {
  const { t } = useTranslation()
  const [config, setConfig] = useState<HeartbeatTask['status'] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (task) {
      setConfig(task.status)
    }
  }, [task])

  const handleSave = async () => {
    if (!task || !config) return
    setIsSaving(true)
    try {
      await onSave({
        agentId: task.agentId,
        intervalMs: config.intervalMs,
        activeHours: config.activeHours
      })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  if (!task || !config) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
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
                {task.agentName}
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
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border border-transparent focus-within:border-primary/20 transition-all">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={Math.round(config.intervalMs / 60000)}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(1440, parseInt(e.target.value) || 1))
                        setConfig({ ...config, intervalMs: val * 60000 })
                      }}
                      className="w-12 bg-transparent border-none text-right font-mono font-bold text-primary text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-muted-foreground/40">
                      {t('common.minute_short')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative group px-1">
                <input
                  type="range"
                  min="1"
                  max="1440"
                  step="1"
                  value={Math.round(config.intervalMs / 60000)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setConfig({ ...config, intervalMs: val * 60000 })
                  }}
                  className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary group-hover:h-2 transition-all"
                />
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 px-1">
                {[1, 5, 15, 30, 60, 240, 720, 1440].map((mins) => {
                  const isActive = Math.round(config.intervalMs / 60000) === mins
                  const label =
                    mins >= 60
                      ? mins % 60 === 0
                        ? `${mins / 60}${t('common.hour_short')}`
                        : `${Math.floor(mins / 60)}${t('common.hour_short')}${mins % 60}${t('common.minute_short')}`
                      : `${mins}${t('common.minute_short')}`

                  return (
                    <button
                      key={mins}
                      onClick={() => setConfig({ ...config, intervalMs: mins * 60000 })}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                          : 'bg-muted/30 text-muted-foreground border-transparent hover:border-primary/20 hover:bg-muted/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
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
                    value={config.activeHours?.start || '09:00'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        activeHours: {
                          start: e.target.value,
                          end: config.activeHours?.end || '18:00'
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
                    value={config.activeHours?.end || '18:00'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        activeHours: {
                          start: config.activeHours?.start || '09:00',
                          end: e.target.value
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
                onClick={onClose}
                className="flex-1 h-10 text-xs font-semibold rounded-lg"
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 h-10 text-xs font-bold rounded-lg"
              >
                {t('common.save_settings')}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default ConfigEditorModal
