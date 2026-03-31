import React, { useState, useEffect, useMemo } from 'react'
import { Send, RefreshCw, Plus, Save, CheckCircle2, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { TelegramBotCard } from './channels/TelegramBotCard'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import type { TelegramChannelConfig } from '@shared/types/config'

export const ChannelsTab: React.FC = () => {
  const { t } = useTranslation()
  const { config, loading, updateConfig, fetchConfig } = useConfigStore()

  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [localTgBots, setLocalTgBots] = useState<TelegramChannelConfig[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 1. 同步初始配置
  useEffect(() => {
    if (config && !isInitialized) {
      setLocalTgBots(config.channels?.telegram || [])
      setIsInitialized(true)
    }
  }, [config, isInitialized])

  // 2. 检测数据脏状态 (未保存提醒)
  const isDirty = useMemo(() => {
    return JSON.stringify(localTgBots) !== JSON.stringify(config?.channels?.telegram || [])
  }, [localTgBots, config])

  // 3. 获取智能体列表 (用于路由绑定)
  const fetchAgents = React.useCallback(async () => {
    try {
      const res = await getGatewayClient().request<{
        agents: Array<{ id: string; config: { name?: string } }>
      }>('agent:list', {})
      if (res?.agents) {
        setAgents(res.agents.map((a) => ({ id: a.id, name: a.config.name || a.id })))
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchAgents()
  }, [fetchConfig, fetchAgents])

  // 4. 通用保存逻辑 - 现在仅由保存按钮触发
  const handleApply = async () => {
    if (!config) return
    setSaving(true)
    try {
      await updateConfig({
        channels: { ...config.channels, telegram: localTgBots }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast.success(t('settings.channels_save_success'))
    } catch (err) {
      toast.error(t('common.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  // 5. 重置本地修改
  const handleReset = () => {
    if (config) {
      setLocalTgBots(config.channels?.telegram || [])
      toast.info(t('common.reset_success'))
    }
  }

  // 6. 操作行为 - 仅修改本地状态
  const addBot = () => {
    setLocalTgBots([
      ...localTgBots,
      { enabled: false, botToken: '', useProxy: false, agentBindings: {} }
    ])
  }

  const removeBot = (index: number) => {
    const newList = [...localTgBots]
    newList.splice(index, 1)
    setLocalTgBots(newList)
  }

  const updateBot = (index: number, patch: Partial<TelegramChannelConfig>) => {
    const newList = [...localTgBots]
    newList[index] = { ...newList[index], ...patch }
    setLocalTgBots(newList)
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    )
  }

  return (
    <div className="mr-2 animate-in fade-in slide-in-from-bottom-2 space-y-6 pb-20 duration-300">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight">{t('settings.channels_title')}</h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground opacity-50">
            {t('settings.channels_desc')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={saving}
              className="h-9 px-4 rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted/50"
            >
              {t('common.undo')}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={addBot}
            className="h-9 px-4 rounded-xl text-xs font-bold border-muted/50 transition-all hover:bg-muted/30"
          >
            <Plus className="mr-2 h-4 w-4" /> {t('settings.channels_add_bot')}
          </Button>

          <Button
            onClick={handleApply}
            disabled={saving || !isDirty}
            className={cn(
              'h-9 px-6 rounded-xl text-xs font-bold transition-all shadow-sm',
              isDirty
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
            {saving
              ? t('settings.channels_syncing')
              : saved
                ? t('settings.channels_save_success')
                : t('settings.channels_save_apply')}
          </Button>
        </div>
      </div>

      {/* 智能体配置入口 */}
      <div className="grid grid-cols-1 gap-6">
        {localTgBots.length === 0 ? (
          <Card className="p-12 border-dashed bg-muted/5 flex flex-col items-center justify-center text-muted-foreground/40 space-y-4 rounded-2xl">
            <Send className="w-10 h-10 opacity-20" />
            <p className="text-xs font-black uppercase tracking-widest leading-none">
              {t('settings.channels_no_bots')}
            </p>
          </Card>
        ) : (
          localTgBots.map((bot, index) => (
            <TelegramBotCard
              key={index}
              index={index}
              bot={bot}
              agents={agents}
              onUpdate={(patch) => updateBot(index, patch)}
              onRemove={() => removeBot(index)}
            />
          ))
        )}

        {/* Placeholder for future channels */}
        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <Card className="p-6 border-dashed border-muted/50 bg-muted/5 opacity-40 hover:opacity-100 transition-all rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1">
                    {t('settings.lark_title')}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground/60 italic">
                    {t('settings.lark_desc')}
                  </span>
                </div>
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 bg-muted/50 px-2 py-1 rounded-md">
                Coming Soon
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
