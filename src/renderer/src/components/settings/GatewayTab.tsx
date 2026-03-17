import React, { useState, useEffect } from 'react'
import { Server, Save, CheckCircle2, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '@renderer/components/ui/number-input'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'


interface GatewaySettings {
  port: number
  token: string
}

const GatewayTab: React.FC = () => {
  const { t } = useTranslation()
  const [config, setConfig] = useState<{ gateway: GatewaySettings } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyToken = () => {
    if (config?.gateway.token) {
      navigator.clipboard.writeText(config.gateway.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRefreshToken = () => {
    if (config && confirm(t('models.delete_confirm'))) {
      const newToken =
        Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      setConfig({ ...config, gateway: { ...config.gateway, token: newToken } })
    }
  }

  useEffect(() => {
    const loadData = async () => {
      const appConfig = await window.api.config.get()
      setConfig({ gateway: appConfig.gateway })
    }
    loadData()
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    await window.api.config.save(config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!config) return null

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{t('gateway.title')}</h2>
          <p className="text-xs text-muted-foreground font-medium max-w-md">{t('gateway.desc')}</p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className={cn(
            'px-8 h-11 rounded-xl font-bold text-xs shadow-xl transition-all',
            saved ? 'bg-green-600 hover:bg-green-500' : ''
          )}
        >
          {saving ? (
            <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? t('gateway.saving') : saved ? t('common.save') : t('gateway.save_applied')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t('gateway.network')}
            </span>
          </div>

          <Card className="p-6 space-y-5 font-bold border-muted">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground ml-1">{t('gateway.port')}</label>
              <NumberInput
                value={config.gateway.port}
                onChange={(val) => setConfig({ ...config, gateway: { ...config.gateway, port: val } })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs text-muted-foreground">{t('gateway.token')}</label>
                <span className="text-[10px] text-muted-foreground/40 font-medium whitespace-nowrap">
                  仅用于外部接入
                </span>
              </div>
              <div className="relative group">
                <Input
                  type={showToken ? 'text' : 'password'}
                  readOnly
                  className="pr-24 bg-muted/50 border-input text-foreground font-medium cursor-default"
                  value={config.gateway.token}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyToken}
                    className={cn(
                      'h-8 w-8 transition-all',
                      copied ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefreshToken}
                    className="h-8 w-8 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default GatewayTab
