import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FileEdit, X, Loader2, Save } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { HeartbeatTask } from '@renderer/store/useHeartbeatStore'

interface FileEditorModalProps {
  task: HeartbeatTask | null
  onClose: () => void
  onSave: (agentId: string, content: string) => Promise<void>
  fetchFile: (agentId: string) => Promise<string>
}

const FileEditorModal: React.FC<FileEditorModalProps> = ({ task, onClose, onSave, fetchFile }) => {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (task) {
      const loadFile = async () => {
        setIsLoading(true)
        try {
          const fileContent = await fetchFile(task.agentId)
          setContent(fileContent)
        } finally {
          setIsLoading(false)
        }
      }
      loadFile()
    }
  }, [task, fetchFile])

  const handleSave = async () => {
    if (!task) return
    setIsSaving(true)
    try {
      await onSave(task.agentId, content)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {task && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 lg:p-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
                  <h2 className="text-sm font-bold tracking-tight">{t('common.edit_heartbeat')}</h2>
                  <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest">
                    {task.agentName}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg w-8 h-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 p-6 flex flex-col min-h-0">
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs font-bold tracking-widest uppercase">
                    {t('common.loading')}...
                  </p>
                </div>
              ) : (
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
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
                onClick={onClose}
                className="px-4 h-9 text-xs font-semibold rounded-lg"
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isLoading}
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
  )
}

export default FileEditorModal
