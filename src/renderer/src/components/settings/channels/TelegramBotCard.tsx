import React, { useState } from 'react'
import { Send, Trash2, RefreshCw, ChevronDown, HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { RoutingTable } from './RoutingTable'
import { validateTelegramBot } from '@renderer/services/channel-api'
import { toast } from 'sonner'
import type { TelegramChannelConfig } from '@shared/types/config'

interface BotCardProps {
  index: number
  bot: TelegramChannelConfig
  agents: Array<{ id: string; name: string }>
  onUpdate: (patch: Partial<TelegramChannelConfig>) => void
  onRemove: () => void
}

export const TelegramBotCard: React.FC<BotCardProps> = ({
  index,
  bot,
  agents,
  onUpdate,
  onRemove
}) => {
  const { t } = useTranslation()
  const [isValidating, setIsValidating] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleValidate = async () => {
    if (!bot.botToken) {
      toast.error(t('settings.channels_bot_token_required'))
      return
    }
    setIsValidating(true)
    try {
      const info = await validateTelegramBot(bot.botToken, !!bot.useProxy)
      toast.success(
        `${t('settings.channels_bot_validate_success')}: @${info?.username || t('settings.channels_bot_name_default')}`
      )
    } catch (err: any) {
      toast.error(`${t('settings.channels_bot_validate_failed')}: ${err.message}`)
    } finally {
      setIsValidating(false)
    }
  }

  const handleEnabledChange = async (enabled: boolean) => {
    if (enabled) {
      if (!bot.botToken) {
        toast.error(t('settings.channels_bot_token_required'))
        return
      }
      setIsValidating(true)
      try {
        const info = await validateTelegramBot(bot.botToken, !!bot.useProxy)
        toast.success(
          `${t('settings.channels_bot_validate_success')}: @${info?.username || t('settings.channels_bot_name_default')}`
        )
      } catch (err: any) {
        toast.error(`${t('settings.channels_bot_validate_failed')}: ${err.message}`)
        setIsValidating(false)
        return
      } finally {
        setIsValidating(false)
      }
    }
    onUpdate({ enabled })
  }

  const ruleCount = Object.keys(bot.agentBindings || {}).length

  return (
    <Card
      className={cn(
        'overflow-hidden border bg-background rounded-xl antialiased',
        'hover:shadow-lg hover:border-primary/20 transition-all duration-300 ease-out',
        bot.enabled ? 'border-border/60' : 'border-border/40'
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          {/* 图标：启用时放大并换色 */}
          <div
            className={cn(
              'transition-colors duration-150',
              bot.enabled ? 'text-primary' : 'text-muted-foreground/40'
            )}
          >
            <Send className="w-4 h-4" />
          </div>

          <span className="text-sm font-bold tracking-tight text-foreground/90">
            {t('settings.telegram_bot_title')} #{index + 1}
          </span>

          {/* 状态点：在线时呼吸脉冲 */}
          <div
            className={cn(
              'w-2 h-2 rounded-full transition-colors duration-200',
              bot.enabled ? 'bg-green-500' : 'bg-muted-foreground/20'
            )}
          />

          {!bot.enabled && (
            <span className="ml-1 text-[10px] font-bold bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded-md border border-border/50 uppercase tracking-wider">
              {t('settings.channels_status_not_enabled')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* 使用指南按钮 */}
          <Dialog open={showHelp} onOpenChange={setShowHelp}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                title={t('settings.telegram_bot_usage_guide')}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <Send className="w-5 h-5" />
                  {t('telegram.guide_title')}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t('telegram.guide_subtitle')}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-3 py-2 text-sm overflow-y-auto max-h-[60vh] px-8 scrollbar-thin">
                {/* 步骤 0: 获取 Token */}
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-primary text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary text-white rounded-full text-[10px] shadow-sm">
                      1
                    </span>
                    {t('telegram.guide_step_0_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_0_p1') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_0_p2') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_0_p3') }} />
                    <p className="text-[10px] text-muted-foreground/60 italic pt-1">
                      {t('telegram.guide_step_0_proxy')}
                    </p>
                  </div>
                </div>

                {/* 场景 1: 私聊 */}
                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      2
                    </span>
                    {t('telegram.guide_step_1_title')}
                  </h4>
                  <p
                    className="text-muted-foreground leading-relaxed pl-7 text-[13px]"
                    dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_1_desc') }}
                  />
                </div>

                {/* 场景 2: 频道 */}
                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      3
                    </span>
                    {t('telegram.guide_step_2_title')}
                  </h4>
                  <p className="text-muted-foreground leading-relaxed pl-7 text-[13px]">
                    <span dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_2_desc') }} />
                    <span
                      className="block mt-1 text-xs text-primary/80 italic font-medium"
                      dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_2_tip') }}
                    />
                  </p>
                </div>

                {/* 场景 3: 群组 */}
                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      4
                    </span>
                    {t('telegram.guide_step_3_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p>{t('telegram.guide_step_3_p1')}</p>
                    <p
                      className="font-mono text-[11px] bg-background/50 px-2 py-1 rounded inline-block"
                      dangerouslySetInnerHTML={{ __html: t('telegram.guide_step_3_p2') }}
                    />
                    <p className="text-[11px] text-muted-foreground/60">
                      {t('telegram.guide_step_3_p3')}
                    </p>
                  </div>
                </div>
              </DialogBody>

              <DialogFooter className="pt-4 pb-4">
                <Button className="w-full rounded-xl" onClick={() => setShowHelp(false)}>
                  {t('telegram.guide_done_btn')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 验证按钮：验证中旋转，hover 缩放 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleValidate}
            disabled={isValidating || !bot.botToken}
            className={cn(
              'h-7 w-7 rounded-lg transition-colors duration-150',
              'text-muted-foreground hover:text-primary',
              isValidating && 'text-primary'
            )}
            title={t('settings.channels_bot_validate_success')}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isValidating && 'animate-spin')} />
          </Button>

          {/* 删除按钮：hover 变红 + 缩放 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 rounded-lg text-muted-foreground/40 hover:text-red-500 transition-colors duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Form rows ── */}
      <div className="divide-y divide-border/30">
        {/* Token + 启用开关 */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.telegram_bot_token_label')}
          </label>
          <Input
            type="password"
            placeholder={t('settings.channels_telegram_bot_token_placeholder')}
            value={bot.botToken}
            onChange={(e) => onUpdate({ botToken: e.target.value })}
            className={cn(
              'flex-1 h-8 bg-muted/20 border-border/40 rounded-lg font-mono text-[11px]',
              'focus-visible:bg-background transition-all'
            )}
          />
          <Switch
            checked={bot.enabled}
            onCheckedChange={handleEnabledChange}
            disabled={isValidating}
          />
        </div>

        {/* 默认智能体 */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.channels_bot_default_agent')}
          </label>
          <Select
            value={bot.defaultAgentId || ''}
            onValueChange={(id) => onUpdate({ defaultAgentId: id })}
            disabled={!agents || agents.length === 0}
          >
            <SelectTrigger
              className={cn(
                'flex-1 h-8 text-xs font-bold border-border/40 rounded-lg transition-all',
                'hover:border-border'
              )}
            >
              <SelectValue placeholder={t('settings.channels_bot_select_agent')} />
            </SelectTrigger>
            {agents && agents.length > 0 && (
              <SelectContent className="rounded-xl">
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="rounded-lg text-xs">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            )}
          </Select>
        </div>

        {/* 代理开关 */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.use_global_proxy')}
          </label>
          <Switch checked={bot.useProxy} onCheckedChange={(useProxy) => onUpdate({ useProxy })} />
        </div>

        {/* 专属规则 — 可折叠 */}
        <div>
          <button
            onClick={() => setShowRules(!showRules)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-2.5',
              'text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 transition-all duration-200',
              'hover:text-primary hover:bg-primary/5',
              showRules && 'text-primary bg-primary/5 border-t border-border/30'
            )}
          >
            <span>{t('settings.channels_routing_table')}</span>
            <div className="flex items-center gap-1.5">
              {/* 徽标：有规则时弹出 */}
              <span
                className={cn(
                  'text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full',
                  'transition-all duration-300 origin-center',
                  ruleCount > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0 w-0 px-0'
                )}
              >
                {ruleCount}
              </span>

              {/* 箭头：展开时旋转 180° */}
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-300',
                  showRules && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* 展开内容：grid-rows smooth 高度过渡 */}
          <div
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
              showRules ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t border-border/30">
                <RoutingTable
                  bindings={bot.agentBindings || {}}
                  agents={agents}
                  onUpdate={(agentBindings) => onUpdate({ agentBindings })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
