import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Edit2, X, Server, Eye } from 'lucide-react'
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
  DialogFooter
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'

interface AIModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  supportsVision?: boolean
}

const ModelsTab: React.FC<{ autoAction?: string | null }> = ({ autoAction }) => {
  const { t } = useTranslation()
  const [models, setModels] = useState<AIModelConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<AIModelConfig>>({})
  const [showDefaultPrompt, setShowDefaultPrompt] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    const config = await window.api.config.get()
    setModels(config.models || [])
  }, [])

  const handleAdd = useCallback(() => {
    const newId = Date.now().toString()
    setEditingId(newId)
    setEditForm({
      id: newId,
      name: t('models.add_model'),
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      baseUrl: '',
      supportsVision: false
    })
  }, [t])

  const hasTriggeredAutoAction = React.useRef(false)

  useEffect(() => {
    let isMounted = true
    const init = async (): Promise<void> => {
      // Fetch models first
      await loadModels()

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
  }, [autoAction, handleAdd, loadModels])

  const handleSave = async () => {
    if (!editingId || !editForm.id) return

    const isNew = !models.find((m) => m.id === editingId)
    const savedModel = editForm as AIModelConfig

    if (isNew) {
      await window.api.config.addModel(savedModel)
    } else {
      await window.api.config.updateModel(editingId, editForm)
    }

    setEditingId(null)
    await loadModels()

    if (isNew) {
      const config = await window.api.config.get()
      if (!config.gateway.selectedModelId) {
        setShowDefaultPrompt(savedModel.id)
      }
    }
  }

  const handleSetDefault = async (confirm: boolean) => {
    if (confirm && showDefaultPrompt) {
      const config = await window.api.config.get()
      config.gateway.selectedModelId = showDefaultPrompt
      await window.api.config.save(config)
    }
    setShowDefaultPrompt(null)
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('models.delete_confirm'))) {
      await window.api.config.deleteModel(id)
      loadModels()
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
      {/* Set Default Prompt Dialog */}
      <Dialog open={!!showDefaultPrompt} onOpenChange={(open) => !open && handleSetDefault(false)}>
        <DialogContent className="max-w-sm text-center p-8">
          <DialogHeader>
            <DialogTitle className="text-xl mb-2">{t('onboarding.set_default_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-6">{t('onboarding.set_default_desc')}</p>
          <DialogFooter className="flex gap-3 sm:justify-center">
            <Button
              onClick={() => handleSetDefault(false)}
              variant="outline"
              className="flex-1 py-6 rounded-xl"
            >
              {t('common.no')}
            </Button>
            <Button
              onClick={() => handleSetDefault(true)}
              className="flex-1 py-6 rounded-xl shadow-lg shadow-primary/20"
            >
              {t('common.yes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Card className="p-5 flex items-center justify-between group hover:border-primary/50 transition-all font-bold border-muted overflow-hidden">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm">{model.name}</h4>
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
                      onClick={() => {
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
                      onClick={() => handleDelete(model.id)}
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
        <DialogContent className="max-w-lg p-8">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {models.find((m) => m.id === editingId)
                ? t('models.edit_model')
                : t('models.add_model')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 my-6">
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
          </div>

          <DialogFooter className="gap-3 sm:justify-start">
            <Button
              onClick={() => setEditingId(null)}
              variant="outline"
              className="flex-1 px-4 h-12 rounded-xl font-bold bg-muted/50 transition-all border-muted"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 px-4 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
            >
              {t('models.save_config')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ModelsTab
