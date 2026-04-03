import React, { useMemo, useState } from 'react'
import { RefreshCw, Send, Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@renderer/components/ui/switch'
import { CollapsibleSection } from '@renderer/components/ui/collapsible-section'
import { SettingsSectionProps } from './types'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import { validateTelegramBot } from '@renderer/services/channel-api'
import type { TelegramChannelConfig } from '@shared/types/config'

export const ChannelSection: React.FC<SettingsSectionProps & { agentId: string }> = ({
  isOpen,
  onToggle,
  agentId
}) => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()
  const [validatingIndex, setValidatingIndex] = useState<number | null>(null)

  // 1. 过滤受当前智能体影响的 Bots
  const associatedBots = useMemo(() => {
    const list = config?.channels?.telegram || []
    return list
      .map((bot, index) => ({ ...bot, originalIndex: index }))
      .filter((bot) => Object.values(bot.agentBindings || {}).includes(agentId))
  }, [config?.channels?.telegram, agentId])

  // 2. 统一处理开关切换
  const handleToggleBot = async (relativeIndex: number, enabled: boolean) => {
    const { originalIndex, ...bot } = associatedBots[relativeIndex]

    if (enabled) {
      if (!bot.botToken) {
        toast.error(t('settings.channels_bot_token_required'))
        return
      }

      setValidatingIndex(relativeIndex)
      try {
        const info = await validateTelegramBot(bot.botToken, !!bot.useProxy)
        toast.success(`${t('settings.channels_bot_validate_success')}: @${info?.username || 'Bot'}`)
      } catch (err: any) {
        toast.error(`${t('settings.channels_bot_validate_failed')}: ${err.message}`)
        setValidatingIndex(null)
        return
      } finally {
        setValidatingIndex(null)
      }
    }

    const newTelegramList = [...(config?.channels?.telegram || [])]
    newTelegramList[originalIndex] = { ...newTelegramList[originalIndex], enabled }

    await updateConfig({
      channels: { ...config?.channels, telegram: newTelegramList }
    })
  }

  if (associatedBots.length === 0) return null

  return (
    <CollapsibleSection
      title={t('settings.channels_title')}
      icon={<Send />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-4 pt-1 px-1">
        <div className="space-y-0.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            {t('settings.channels_title')}
          </h3>
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-bold tracking-tight">
            {t('settings.channels_agent_desc')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {associatedBots.map((bot, idx) => (
            <BotItem
              key={idx}
              bot={bot}
              agentId={agentId}
              validating={validatingIndex === idx}
              onToggle={(val) => handleToggleBot(idx, val)}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  )
}

/**
 * 内部组件：Bot 简易信息项
 */
const BotItem: React.FC<{
  bot: TelegramChannelConfig
  agentId: string
  validating: boolean
  onToggle: (v: boolean) => void
}> = ({ bot, agentId, validating, onToggle }) => {
  const specificBindings = Object.entries(bot.agentBindings || {})
    .filter(([_, aid]) => aid === agentId)
    .map(([chatId]) => chatId)

  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/5 border border-border/10 hover:bg-muted/10 hover:border-primary/20 transition-all group shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'p-2 rounded-xl bg-background shadow-xs transition-colors',
              bot.enabled ? 'text-primary' : 'text-muted-foreground/60'
            )}
          >
            <Send className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-foreground tracking-tight truncate">
              Telegram Bot
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/60 truncate italic">
              {bot.botToken.split(':')[0] || 'Unknown'}...
            </span>
          </div>
        </div>
        {validating ? (
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
        ) : (
          <Switch checked={bot.enabled} onCheckedChange={onToggle} />
        )}
      </div>

      {specificBindings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {specificBindings.map((chatId) => (
            <div
              key={chatId}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/20 border border-border/20 text-[9px] font-bold text-muted-foreground tracking-tight"
            >
              <Hash className="w-2.5 h-2.5 opacity-50" /> {chatId}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
