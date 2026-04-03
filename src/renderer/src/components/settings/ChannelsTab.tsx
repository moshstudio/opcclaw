import React, { useState, useEffect, useMemo } from 'react'
import {
  Send,
  RefreshCw,
  Plus,
  Save,
  CheckCircle2,
  MessageSquare,
  Building2,
  ChevronDown
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { TelegramBotCard } from './channels/TelegramBotCard'
import { FeishuBotCard } from './channels/FeishuBotCard'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import type {
  ChannelsConfig,
  TelegramChannelConfig,
  FeishuChannelConfig
} from '@shared/types/config'

export const ChannelsTab: React.FC = () => {
  const { t } = useTranslation()
  const { config, loading, updateConfig, fetchConfig } = useConfigStore()
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])

  // --- 通用配置处理架构 (Strongly Typed Architecture) ---
  const [localChannels, setLocalChannels] = useState<ChannelsConfig>({}) // 统一本地渠道副本
  const [isInitialized, setIsInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lastSyncedJson, setLastSyncedJson] = useState('')

  // 1. 获取最新远程渠道配置 (Single Source of Truth)
  const remoteChannels = useMemo(() => config?.channels || {}, [config])

  // 2. 通用脏检查逻辑
  const isDirty = useMemo(() => {
    const localJson = JSON.stringify(localChannels)
    const remoteJson = JSON.stringify(remoteChannels)
    return localJson !== remoteJson && localJson !== lastSyncedJson
  }, [localChannels, remoteChannels, lastSyncedJson])

  // 3. 通用背景同步逻辑 (无缝响应 /bind 等指令)
  useEffect(() => {
    if (config) {
      const remoteJson = JSON.stringify(remoteChannels)
      // 如果未初始化，或者当前处于“非脏”状态且远程发生了变更，则自动跟随同步
      if (!isInitialized || (!isDirty && remoteJson !== lastSyncedJson)) {
        setLocalChannels(JSON.parse(remoteJson) as ChannelsConfig)
        setLastSyncedJson(remoteJson)
        if (!isInitialized) setIsInitialized(true)
      }
    }
  }, [config, isInitialized, isDirty, remoteChannels, lastSyncedJson])

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
        channels: localChannels
      })
      setSaved(true)
      setLastSyncedJson(JSON.stringify(localChannels)) // 同步成功，更新基准线
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
      const remoteJson = JSON.stringify(remoteChannels)
      setLocalChannels(JSON.parse(remoteJson))
      setLastSyncedJson(remoteJson)
      toast.info(t('common.reset_success'))
    }
  }

  // 6. 泛化操作行为 (Generic Actions - Strongly Typed)
  const updateChannel = <K extends keyof ChannelsConfig>(
    type: K,
    index: number,
    patch: Partial<NonNullable<ChannelsConfig[K]>[number]>
  ) => {
    const nextChannels = { ...localChannels }
    const list = nextChannels[type]
    if (!list) return
    const newList = [...list]
    // @ts-ignore: Next.js/React generic state typing limit
    newList[index] = { ...newList[index], ...patch }
    // @ts-ignore: Ensuring state assignment safety
    nextChannels[type] = newList
    setLocalChannels(nextChannels)
  }

  const addChannelItem = <K extends keyof ChannelsConfig>(
    type: K,
    defaultItem: TelegramChannelConfig | FeishuChannelConfig
  ) => {
    const nextChannels = { ...localChannels }
    const list = nextChannels[type] || []
    // @ts-ignore: Ensuring type consistency for dynamic addition
    nextChannels[type] = [...list, defaultItem]
    setLocalChannels(nextChannels)
  }

  const removeChannelItem = <K extends keyof ChannelsConfig>(type: K, index: number) => {
    const nextChannels = { ...localChannels }
    const list = nextChannels[type]
    if (!list) return
    const newList = [...list]
    newList.splice(index, 1)
    // @ts-ignore: Ensuring type consistency
    nextChannels[type] = newList
    setLocalChannels(nextChannels)
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 px-4 rounded-xl text-xs font-bold border-muted/50 transition-all hover:bg-muted/30 gap-2"
              >
                <Plus className="h-4 w-4" /> {t('settings.channels_add_channel_dropdown')}
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl p-1 shadow-xl">
              <DropdownMenuItem
                className="rounded-lg text-xs font-medium focus:bg-primary/10 flex items-center gap-2 cursor-pointer"
                onClick={() =>
                  addChannelItem('telegram', {
                    enabled: false,
                    botToken: '',
                    useProxy: false,
                    agentBindings: {}
                  })
                }
              >
                <Send className="w-3.5 h-3.5 text-blue-500" />
                {t('settings.channels_add_bot')}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="rounded-lg text-xs font-medium focus:bg-primary/10 flex items-center gap-2 cursor-pointer"
                onClick={() =>
                  addChannelItem('feishu', {
                    enabled: false,
                    appId: '',
                    appSecret: '',
                    agentBindings: {}
                  })
                }
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                {t('settings.channels_add_feishu')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
        {!localChannels.telegram || localChannels.telegram.length === 0 ? (
          <Card className="p-12 border-dashed bg-muted/5 flex flex-col items-center justify-center text-muted-foreground/40 space-y-4 rounded-2xl">
            <Send className="w-10 h-10 opacity-20" />
            <p className="text-xs font-black uppercase tracking-widest leading-none">
              {t('settings.channels_no_bots')}
            </p>
          </Card>
        ) : (
          localChannels.telegram.map((bot: TelegramChannelConfig, index: number) => (
            <TelegramBotCard
              key={index}
              index={index}
              bot={bot}
              agents={agents}
              onUpdate={(patch) => updateChannel('telegram', index, patch)}
              onRemove={() => removeChannelItem('telegram', index)}
            />
          ))
        )}

        {localChannels.feishu &&
          localChannels.feishu.map((app: FeishuChannelConfig, index: number) => (
            <FeishuBotCard
              key={index}
              index={index}
              app={app}
              agents={agents}
              onUpdate={(patch) => updateChannel('feishu', index, patch)}
              onRemove={() => removeChannelItem('feishu', index)}
            />
          ))}

        {/* 帮助中心入口或其他渠道占位 */}
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
                    {t('settings.more_channels_title')}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground/60 italic">
                    {t('settings.more_channels_desc')}
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
