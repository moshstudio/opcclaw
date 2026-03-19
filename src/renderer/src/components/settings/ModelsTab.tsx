import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Edit2, Server, Eye, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Switch } from '@renderer/components/ui/switch'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { toast } from 'sonner'

import { useModelStore, AIModelConfig } from '@renderer/store/useModelStore'

const ModelsTab: React.FC<{ autoAction?: string | null }> = ({ autoAction }) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const {
    models,
    defaultModelId,
    fetchModels,
    addModel,
    updateModel,
    deleteModel,
    testModel,
    setDefaultModel
  } = useModelStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<AIModelConfig>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (testResult && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }, 100)
    }
  }, [testResult])

  const handleAdd = useCallback(() => {
    setEditingId('new')
    setEditForm({
      name: t('models.add_model'),
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      baseUrl: '',
      supportsVision: false
    })
    setTestResult(null)
    setTesting(false)
  }, [t])

  const handleSave = async () => {
    if (!editingId || !editForm.id) return

    setTesting(true)
    setTestResult(null)

    try {
      // 1. 尝试测试连接
      const result = await testModel(editForm as AIModelConfig)

      setTestResult({
        ok: result.ok,
        message: result.ok
          ? t('common.connection_success')
          : result.error || t('common.connection_failed')
      })

      // 2. 无论测试结果如何，都执行保存逻辑（支持带错保存）
      const isNew = editingId === 'new'

      if (isNew) {
        await addModel(editForm as Omit<AIModelConfig, 'id'>)
      } else {
        await updateModel(editingId, editForm)
      }

      // 3. 只有测试成功才关闭对话框
      if (result.ok) {
        // 成功则给用户一个极短的视觉反馈，然后关闭
        setTimeout(() => setEditingId(null), 500)
      }
    } catch (err: any) {
      console.error('Save failed:', err)
      setTestResult({ ok: false, message: err.message || 'Save error' })
    } finally {
      setTesting(false)
    }
  }

  const hasTriggeredAutoAction = React.useRef(false)

  useEffect(() => {
    let isMounted = true
    const init = async (): Promise<void> => {
      // Fetch models first
      await fetchModels()

      if (isMounted && autoAction === 'add' && !hasTriggeredAutoAction.current) {
        hasTriggeredAutoAction.current = true
        // Delay action to ensure it's outside the current render/commit path
        setTimeout(() => {
          if (isMounted) handleAdd()
        }, 0)
      }
    }

    init()
    return (): void => {
      isMounted = false
    }
  }, [autoAction, handleAdd, fetchModels])

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title:
        t('models.delete_confirm_title') || t('common.confirm_delete') || t('common.delete_model'),
      description: t('models.delete_confirm'),
      variant: 'destructive'
    })
    if (isConfirmed) {
      await deleteModel(id)
    }
  }

  const providerOptions = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google Gemini' },
    { value: 'groq', label: 'Groq' },
    { value: 'custom', label: 'Custom (OpenAI Compatible)' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">{t('models.title')}</h2>
          <p className="text-xs text-muted-foreground font-medium">{t('models.desc')}</p>
        </div>
        <Button
          onClick={handleAdd}
          className="flex items-center gap-2 px-6 h-11 rounded-xl shadow-lg shadow-primary/20 text-sm font-bold"
        >
          <Plus className="w-4 h-4" />
          {t('models.add_model')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {models.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/20 border-muted">
            <p className="text-sm font-bold text-muted-foreground">{t('models.empty')}</p>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {models.map((model) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={model.id}
            >
              <Card
                onClick={async () => {
                  const success = await setDefaultModel(model.id)
                  if (success) {
                    toast.success(t('common.default_model_updated') || 'Default model updated')
                  }
                }}
                className={cn(
                  'p-5 flex items-center justify-between group transition-all font-bold border-muted overflow-hidden cursor-pointer',
                  defaultModelId === model.id
                    ? 'border-primary/50 bg-primary/5 shadow-inner'
                    : 'hover:border-primary/30 hover:bg-muted/30'
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'p-3 rounded-xl transition-colors',
                      defaultModelId === model.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/10 text-primary'
                    )}
                  >
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm">{model.name}</h4>
                      {defaultModelId === model.id && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary text-primary-foreground">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('common.default')}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      {model.provider} · {model.model}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {model.supportsVision && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/5 text-primary border border-primary/10 text-[9px] font-bold">
                      <Eye className="w-3 h-3" />
                      VISION
                    </div>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(model.id)
                        setEditForm(model)
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(model.id)
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Edit/Add Model Dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {models.find((m) => m.id === editingId)
                ? t('models.edit_model')
                : t('models.add_model')}
            </DialogTitle>
          </DialogHeader>

          <DialogBody ref={scrollRef} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground ml-1">
                {t('models.name')}
              </label>
              <Input
                placeholder="e.g. My ChatGPT"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground ml-1">
                  {t('models.provider')}
                </label>
                <Select
                  value={editForm.provider || 'openai'}
                  onValueChange={(val) => setEditForm({ ...editForm, provider: val })}
                >
                  <SelectTrigger className="font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground ml-1">
                  {t('models.model_name')}
                </label>
                <Input
                  placeholder="e.g. gpt-4o"
                  value={editForm.model || ''}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground ml-1">
                {t('models.api_key')}
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={editForm.apiKey || ''}
                onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground ml-1">
                {t('models.base_url')}
              </label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={editForm.baseUrl || ''}
                onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-muted/50 group hover:border-primary/30 transition-all">
              <div className="space-y-0.5">
                <div className="text-sm font-bold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  {t('models.supports_vision')}
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pr-4 leading-relaxed">
                  {t('models.supports_vision_desc')}
                </p>
              </div>
              <Switch
                checked={editForm.supportsVision || false}
                onCheckedChange={(checked) => setEditForm({ ...editForm, supportsVision: checked })}
              />
            </div>

            {testResult && (
              <div
                className={cn(
                  'p-3 rounded-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-1 mb-2',
                  testResult.ok
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                )}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="break-all">{testResult.message}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="gap-3">
            <Button
              onClick={() => setEditingId(null)}
              variant="outline"
              disabled={testing}
              className="px-4 h-12 rounded-xl font-bold bg-muted/50 transition-all border-muted"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={testing}
              className="px-6 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all min-w-[120px]"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.testing')}
                </>
              ) : (
                t('models.save_config')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ModelsTab
