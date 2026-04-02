import React, { useState, useEffect, useMemo } from 'react'
import {
  Server,
  Save,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  FileText
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '@renderer/components/ui/number-input'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

import { useConfirm } from '@renderer/hooks/use-confirm'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { toast } from 'sonner'
import { newId } from '@shared/utils/id'

/**
 * GatewayTab: 网关配置主页面
 * 职责：管理内部智能体网关的端口、Token 以及配套接口文档
 */
const GatewayTab: React.FC = () => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { config, loading, updateConfig, fetchConfig } = useConfigStore()

  // --- 1. 本地 UI 状态 ---
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  // --- 2. 配置本地副本 (Draft State) ---
  const [localPort, setLocalPort] = useState<number>(0)
  const [localToken, setLocalToken] = useState<string>('')
  const [isInitialized, setIsInitialized] = useState(false)

  // 初始加载
  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // 配置同步逻辑：仅在首次进入或显式重置时同步后端配置
  useEffect(() => {
    if (config && !isInitialized) {
      setLocalPort(config.gateway.port)
      setLocalToken(config.gateway.token || '')
      setIsInitialized(true)
    }
  }, [config, isInitialized])

  // --- 3. 核心派生状态 ---
  const isPortInvalid = localPort < 1 || localPort > 65535
  const isDirty = useMemo(() => {
    if (!config) return false
    return localPort !== config.gateway.port || localToken !== (config.gateway.token || '')
  }, [localPort, localToken, config])

  const activeDocUrl = `http://127.0.0.1:${config?.gateway?.port}/events-doc`

  // --- 4. 业务动作句柄 ---
  const handleCopy = (text: string, setStatus: (s: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setStatus(true)
    setTimeout(() => setStatus(false), 2000)
  }

  const handleRefreshToken = async () => {
    if (!config) return
    const isConfirmed = await confirm({
      title: t('gateway.refresh_token_title'),
      description: t('gateway.refresh_token_confirm'),
      variant: 'destructive',
      confirmText: t('common.confirm')
    })

    if (isConfirmed.confirmed) {
      const newToken = newId().replace(/-/g, '')
      setLocalToken(newToken)
    }
  }

  const handleSave = async () => {
    if (!config || isPortInvalid) return
    setSaving(true)
    try {
      await updateConfig({
        gateway: { ...config.gateway, port: localPort, token: localToken }
      })
      toast.success(t('common.success'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setIsInitialized(false) // 保存成功后解除初始化锁，允许重新同步
    } catch (err) {
      console.error('Failed to save gateway config:', err)
      toast.error(t('common.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (config) {
      setLocalPort(config.gateway.port)
      setLocalToken(config.gateway.token || '')
      toast.info(t('common.reset_success'))
    }
  }

  // --- 5. 渲染逻辑 ---
  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 头部：标题与工具栏 */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{t('gateway.title')}</h2>
          <p className="text-xs text-muted-foreground font-medium max-w-md">{t('gateway.desc')}</p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={saving}
              className="h-9 px-4 rounded-xl text-xs font-bold text-muted-foreground transition-all hover:bg-muted/50"
            >
              {t('common.undo')}
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty || isPortInvalid}
            className={cn(
              'h-9 px-6 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95',
              isDirty && !isPortInvalid
                ? 'bg-primary text-primary-foreground shadow-primary/10'
                : 'bg-muted/50 text-muted-foreground opacity-50 grayscale',
              saved && 'bg-green-600 text-white'
            )}
          >
            {saving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? t('gateway.saving') : saved ? t('common.success') : t('gateway.save_applied')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* 网络配置主体 */}
        <Card className="p-6 space-y-6 font-bold border-muted">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t('gateway.network')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 端口设置 */}
            <div className="space-y-2">
              <div className="flex items-center h-5">
                <label className="text-xs text-muted-foreground font-bold tracking-tight">
                  {t('gateway.port')}
                </label>
              </div>
              <NumberInput
                value={localPort}
                onChange={setLocalPort}
                min={1}
                max={65535}
                isInvalid={isPortInvalid}
                errorText={t('gateway.port_range_error')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isPortInvalid && isDirty) {
                    handleSave()
                  }
                }}
              />
            </div>

            {/* Token 设置 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between h-5">
                <label className="text-xs text-muted-foreground font-bold tracking-tight">
                  {t('gateway.token')}
                </label>
                {localToken !== (config.gateway.token || '') && (
                  <span className="text-[9px] text-primary/60 font-bold uppercase animate-pulse italic">
                    (Pending)
                  </span>
                )}
              </div>
              <div className="relative group w-full">
                <Input
                  type={showToken ? 'text' : 'password'}
                  readOnly
                  className={cn(
                    'pr-24 bg-muted/50 border-input text-foreground font-bold cursor-default transition-all',
                    localToken !== (config.gateway.token || '') &&
                      'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                  )}
                  value={localToken}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <TokenActionButtons
                    showToken={showToken}
                    setShowToken={setShowToken}
                    copied={copied}
                    onCopy={() => handleCopy(localToken, setCopied)}
                    onRefresh={handleRefreshToken}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 辅助文档部分 */}
        <DocumentationCard
          url={activeDocUrl}
          copiedUrl={copiedUrl}
          onCopy={() => handleCopy(activeDocUrl, setCopiedUrl)}
        />
      </div>
    </div>
  )
}

/**
 * 子组件：Token 操作按钮组
 */
const TokenActionButtons: React.FC<{
  showToken: boolean
  setShowToken: (s: boolean) => void
  copied: boolean
  onCopy: () => void
  onRefresh: () => void
}> = ({ showToken, setShowToken, copied, onCopy, onRefresh }) => (
  <>
    <IconButton onClick={() => setShowToken(!showToken)}>
      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
    </IconButton>
    <IconButton onClick={onCopy} active={copied} activeClassName="text-green-500">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </IconButton>
    <IconButton onClick={onRefresh} className="text-muted-foreground/30 hover:text-destructive">
      <RefreshCw className="w-3.5 h-3.5" />
    </IconButton>
  </>
)

/**
 * 子组件：文档路径卡片
 */
const DocumentationCard: React.FC<{
  url: string
  copiedUrl: boolean
  onCopy: () => void
}> = ({ url, copiedUrl, onCopy }) => {
  const { t } = useTranslation()
  return (
    <Card className="p-6 border-dashed border-muted bg-muted/30 flex flex-col gap-6 group hover:bg-muted/50 transition-all">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {t('gateway.documentation')}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-sm font-bold tracking-tight">{t('gateway.doc_title')}</h4>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            {t('gateway.doc_subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:block px-3 py-1.5 rounded-lg bg-background/50 border border-muted text-[10px] font-mono text-muted-foreground">
            {url}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className={cn(
              'h-9 px-4 rounded-xl gap-2 text-xs font-extrabold',
              copiedUrl && 'text-green-500'
            )}
            onClick={onCopy}
          >
            {copiedUrl ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedUrl ? t('common.copied') : t('gateway.copy_link')}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-9 px-4 rounded-xl gap-2 text-xs font-extrabold shadow-lg shadow-primary/20"
            onClick={() => window.open(url, '_blank')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('gateway.view_now')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * 基础 UI 组件：小尺寸图标按钮
 */
const IconButton: React.FC<{
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  className?: string
  activeClassName?: string
}> = ({ onClick, children, active, className, activeClassName }) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onClick}
    className={cn(
      'h-8 w-8 text-muted-foreground hover:text-foreground',
      className,
      active && activeClassName
    )}
  >
    {children}
  </Button>
)

export default GatewayTab
