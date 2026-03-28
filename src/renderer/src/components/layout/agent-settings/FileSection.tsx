import React, { useState, useEffect } from 'react'
import { FileText, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { SettingsSectionProps } from './types'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { cn } from '@renderer/lib/utils'

interface BootstrapFile {
  name: string
  path: string
  content?: string
  missing: boolean
  size?: number
  mtime?: string
}

export const FileSection: React.FC<SettingsSectionProps & { agentId: string }> = ({
  formData,
  setFormData,
  isOpen,
  onToggle,
  agentId
}) => {
  const { t } = useTranslation()
  const [files, setFiles] = useState<BootstrapFile[]>([])
  const [selectedFileName, setSelectedFileName] = useState<string>('AGENTS.md')
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchFiles = React.useCallback(async () => {
    if (!formData.workspaceDir) return
    setLoading(true)
    try {
      const client = getGatewayClient()
      const res = await client.request<{ files: BootstrapFile[] }>('bootstrap:list', {
        workspaceDir: formData.workspaceDir
      })
      setFiles(res.files)

      const current = res.files.find((f) => f.name === selectedFileName)
      if (current) {
        setContent(current.content || '')
      } else if (res.files.length > 0 && !selectedFileName) {
        setSelectedFileName(res.files[0].name)
        setContent(res.files[0].content || '')
      }
    } catch (err) {
      console.error('Failed to fetch bootstrap files:', err)
    } finally {
      setLoading(false)
    }
  }, [formData.workspaceDir, selectedFileName])

  useEffect(() => {
    if (isOpen) {
      fetchFiles()
    }
  }, [isOpen, fetchFiles, agentId])

  const handleFileSelect = (file: BootstrapFile) => {
    setSelectedFileName(file.name)
    setContent(file.content || '')
  }

  const handleSave = async () => {
    const file = files.find((f) => f.name === selectedFileName)
    if (!file) return

    setSaving(true)
    try {
      const client = getGatewayClient()
      await client.request('bootstrap:save', {
        path: file.path,
        content
      })
      await fetchFiles()
    } catch (err) {
      console.error('Failed to save bootstrap file:', err)
    } finally {
      setSaving(false)
    }
  }

  const selectedFile = files.find((f) => f.name === selectedFileName)

  return (
    <CollapsibleSection
      title={t('common.bootstrap_files')}
      icon={<FileText />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-1">
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground/80">
              {t('common.bootstrap_files')}
            </h3>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed max-w-[400px]">
              {t('common.bootstrap_desc')}
            </p>
            <p className="text-[10px] text-muted-foreground/30 font-mono mt-1 truncate group-hover:text-muted-foreground/60 transition-colors">
              {t('common.workspace')}: {formData.workspaceDir}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl bg-muted/10 border border-border/20 hover:bg-muted/15 hover:text-primary transition-all"
              onClick={() => fetchFiles()}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/10 border border-border/20 shadow-sm hover:bg-muted/15 transition-all">
            <span className="text-xs font-bold text-foreground/70 tracking-tight">
              {t('common.enable_context')}
            </span>
            <Switch
              checked={formData.enableContext}
              onCheckedChange={(v) => setFormData((prev) => ({ ...prev, enableContext: v }))}
            />
          </div>
        </div>

        <div className="flex flex-col min-h-[450px] border border-border/40 rounded-2xl bg-muted/5 overflow-hidden shadow-inner group/editor">
          {/* 顶部集成工具栏 */}
          <div className="flex w-[260px] overflow-x-auto items-center justify-between gap-3 px-3 py-2 border-b border-border/40 bg-background">
            <div className="flex items-center flex-1 min-w-0 gap-2">
              <Select
                value={selectedFileName}
                onValueChange={(val) => {
                  const file = files.find((f) => f.name === val)
                  if (file) handleFileSelect(file)
                }}
              >
                <SelectTrigger className="h-8 px-3 text-sm bg-background border border-border/30 shadow-sm hover:bg-muted/50 hover:border-border/50 transition-all focus:ring-1 focus:ring-primary/20 w-full rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 overflow-hidden w-full">
                    <FileText className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                    <div className="flex-1 truncate text-left">
                      <SelectValue placeholder={t('common.select_file')} />
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent className="min-w-[220px] rounded-xl border border-border/40 shadow-xl">
                  {files.map((file) => (
                    <SelectItem key={file.name} value={file.name} className="text-sm py-2.5">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="truncate">{file.name}</span>
                         {file.missing && (
                          <span className="text-[9px] font-bold uppercase text-destructive/80 bg-destructive/10 px-1 py-0.5 rounded border border-destructive/20 ml-2">
                             {t('common.missing')}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-black/5 dark:hover:bg-white/5 opacity-40 group-hover/editor:opacity-100 transition-all"
                onClick={() => setContent(selectedFile?.content || '')}
                title={t('common.reset')}
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 rounded-lg bg-primary shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="text-xs font-black uppercase tracking-widest">
                    {t('common.save_file')}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* 内容编辑区 */}
          <div className="relative flex-1 flex flex-col">
            <div className="absolute top-2 left-4 z-10 pointer-events-none opacity-20">
              <span className="text-[10px] font-bold  text-muted-foreground uppercase tracking-[0.2em]">
                {t('common.edit_content')}
              </span>
            </div>

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                selectedFile?.missing
                  ? t('common.create_on_save')
                  : t('common.file_content_placeholder')
              }
              className="flex-1 w-full min-h-[380px] text-xs bg-transparent border-none rounded-none resize-none focus-visible:ring-0 p-5 pt-9 pb-10 leading-relaxed custom-scrollbar"
            />
          </div>
        </div>

        {loading && !files.length && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
            <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest animate-pulse">
              {t('common.loading')}
            </span>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
