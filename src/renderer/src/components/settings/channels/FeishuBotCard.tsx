import React, { useState } from 'react'
import { Trash2, RefreshCw, ChevronDown, HelpCircle, Building2, Copy, Check } from 'lucide-react'
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
import { validateFeishuApp } from '@renderer/services/channel-api'
import { toast } from 'sonner'
import type { FeishuChannelConfig } from '@shared/types/config'

interface FeishuCardProps {
  index: number
  app: FeishuChannelConfig
  agents: Array<{ id: string; name: string }>
  onUpdate: (patch: Partial<FeishuChannelConfig>) => void
  onRemove: () => void
}

export const FeishuBotCard: React.FC<FeishuCardProps> = ({
  index,
  app,
  agents,
  onUpdate,
  onRemove
}) => {
  const { t } = useTranslation()
  const [isValidating, setIsValidating] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyJson = () => {
    const config = {
      scopes: {
        tenant: [
          'aily:file:read',
          'aily:file:write',
          'application:application.app_message_stats.overview:readonly',
          'application:application:self_manage',
          'application:bot.menu:write',
          'cardkit:card:write',
          'contact:user.base:readonly',
          'contact:user.employee_id:readonly',
          'corehr:file:download',
          'docs:document.content:read',
          'event:ip_list',
          'im:chat',
          'im:chat.access_event.bot_p2p_chat:read',
          'im:chat.members:bot_access',
          'im:message',
          'im:message.group_at_msg:readonly',
          'im:message.group_msg',
          'im:message.p2p_msg:readonly',
          'im:message:readonly',
          'im:message:send_as_bot',
          'im:resource',
          'sheets:spreadsheet',
          'wiki:wiki:readonly'
        ],
        user: ['aily:file:read', 'aily:file:write', 'im:chat.access_event.bot_p2p_chat:read']
      }
    }
    navigator.clipboard.writeText(JSON.stringify(config, null, 2))
    setCopied(true)
    toast.success(t('feishu.guide_step_2_json_copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleValidate = async () => {
    if (!app.appId || !app.appSecret) {
      toast.error(t('settings.channels_feishu_credentials_required'))
      return
    }
    setIsValidating(true)
    try {
      const info = await validateFeishuApp(app.appId, app.appSecret)
      toast.success(
        `${t('settings.channels_feishu_validate_success')}: ${info?.botName || t('settings.channels_app_name_default')}`
      )
    } catch (err: any) {
      toast.error(`${t('settings.channels_feishu_validate_failed')}: ${err.message}`)
    } finally {
      setIsValidating(false)
    }
  }

  const handleEnabledChange = async (enabled: boolean) => {
    if (enabled) {
      if (!app.appId || !app.appSecret) {
        toast.error(t('settings.channels_feishu_credentials_required'))
        return
      }
      setIsValidating(true)
      try {
        const info = await validateFeishuApp(app.appId, app.appSecret)
        toast.success(
          `${t('settings.channels_feishu_validate_success')}: ${info?.botName || t('settings.channels_app_name_default')}`
        )
      } catch (err: any) {
        toast.error(`${t('settings.channels_feishu_validate_failed')}: ${err.message}`)
        setIsValidating(false)
        return
      } finally {
        setIsValidating(false)
      }
    }
    onUpdate({ enabled })
  }

  const ruleCount = Object.keys(app.agentBindings || {}).length

  return (
    <Card
      className={cn(
        'overflow-hidden border bg-background rounded-xl antialiased',
        'hover:shadow-lg hover:border-primary/20 transition-all duration-300 ease-out',
        app.enabled ? 'border-border/60' : 'border-border/40'
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'transition-colors duration-150',
              app.enabled ? 'text-primary' : 'text-muted-foreground/40'
            )}
          >
            <Building2 className="w-4 h-4" />
          </div>

          <span className="text-sm font-bold tracking-tight text-foreground/90">
            {t('settings.lark_title')} #{index + 1}
          </span>

          <div
            className={cn(
              'w-2 h-2 rounded-full transition-colors duration-200',
              app.enabled ? 'bg-green-500' : 'bg-muted-foreground/20'
            )}
          />

          {!app.enabled && (
            <span className="ml-1 text-[10px] font-bold bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded-md border border-border/50 uppercase tracking-wider">
              {t('settings.channels_status_not_enabled')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Dialog open={showHelp} onOpenChange={setShowHelp}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                title={t('settings.feishu_bot_usage_guide')}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <Building2 className="w-5 h-5" />
                  {t('feishu.guide_title')}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t('feishu.guide_subtitle')}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-3 py-2 text-sm overflow-y-auto max-h-[60vh] px-8 scrollbar-thin">
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-primary text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary text-white rounded-full text-[10px] shadow-sm">
                      1
                    </span>
                    {t('feishu.guide_step_1_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p>
                      {t('feishu.guide_step_1_login')}{' '}
                      <a
                        href="https://open.feishu.cn/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        {t('feishu.guide_step_1_platform')}
                      </a>
                    </p>
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_1_create') }} />
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      2
                    </span>
                    {t('feishu.guide_step_2_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_2_enable') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_2_perms') }} />
                    <ul className="list-disc list-inside pl-2 text-[12px] text-primary/80">
                      <li>{t('feishu.guide_step_2_perm_im_p2p')}</li>
                      <li>{t('feishu.guide_step_2_perm_im_send')}</li>
                      <li>{t('feishu.guide_step_2_perm_im_group')}</li>
                      <li>{t('feishu.guide_step_2_perm_more')}</li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <p className="text-[11px] text-muted-foreground/70 mb-2 leading-tight">
                        {t('feishu.guide_step_2_json_hint')}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-7 px-3 rounded-lg text-[11px] font-bold transition-all gap-1.5',
                          copied
                            ? 'bg-green-500/10 border-green-500/20 text-green-600 hover:bg-green-500/20'
                            : 'bg-primary/5 border-primary/20 text-primary hover:bg-primary/10'
                        )}
                        onClick={handleCopyJson}
                      >
                        {copied ? (
                          <Check className="w-3 h-3 animate-in zoom-in duration-300" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {t('feishu.guide_step_2_json_btn')}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      3
                    </span>
                    {t('feishu.guide_step_3_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_3_event') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_3_ws_notice') }} />
                    <div className="flex flex-col gap-2 py-1">
                      {[
                        {
                          id: 'im.message.receive_v1',
                          label: t('feishu.guide_step_3_event_receive')
                        },
                        {
                          id: 'im.chat.access_event.bot_p2p_chat_entered_v1',
                          label: t('feishu.guide_step_3_event_chat_access')
                        },
                        {
                          id: 'application.bot.menu_v6',
                          label: t('feishu.guide_step_3_event_menu')
                        }
                      ].map((evt) => (
                        <button
                          key={evt.id}
                          onClick={() => {
                            navigator.clipboard.writeText(evt.id)
                            toast.success(`${t('feishu.guide_step_2_json_copied')}: ${evt.id}`)
                          }}
                          className="group flex items-center justify-between w-full px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all active:scale-95 text-left"
                        >
                          <div className="flex flex-col">
                            <span className="text-[11px] font-mono font-bold text-primary">
                              {evt.id}
                            </span>
                            <span className="text-[10px] text-muted-foreground opacity-70">
                              {evt.label.split('(')[1]?.replace(')', '') || ''}
                            </span>
                          </div>
                          <Copy className="w-3 h-3 text-primary/40 group-hover:text-primary transition-colors" />
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/40">
                      <p
                        className="text-muted-foreground leading-relaxed text-[13px] mb-2"
                        dangerouslySetInnerHTML={{
                          __html: t('feishu.guide_step_3_callback_title')
                        }}
                      />
                      <button
                        onClick={() => {
                          const callback = 'card.action.trigger'
                          navigator.clipboard.writeText(callback)
                          toast.success(`${t('feishu.guide_step_2_json_copied')}: ${callback}`)
                        }}
                        className="group flex items-center justify-between w-full px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all active:scale-95 text-left"
                      >
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono font-bold text-primary">
                            card.action.trigger
                          </span>
                          <span className="text-[10px] text-muted-foreground opacity-70">
                            {t('feishu.guide_step_3_callback_trigger')
                              .split('(')[1]
                              ?.replace(')', '') || ''}
                          </span>
                        </div>
                        <Copy className="w-3 h-3 text-primary/40 group-hover:text-primary transition-colors" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      4
                    </span>
                    {t('feishu.guide_step_4_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_4_desc') }} />
                    <p className="text-[12px] opacity-70 italic">
                      {t('feishu.guide_step_4_audit')}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-foreground text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px]">
                      5
                    </span>
                    {t('feishu.guide_step_5_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-1 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_5_desc') }} />
                  </div>
                </div>

                <div className="p-3 bg-primary/10 rounded-xl border border-primary/30">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-primary text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 flex items-center justify-center bg-primary text-white rounded-full text-[10px] shadow-sm">
                      6
                    </span>
                    {t('feishu.guide_step_6_title')}
                  </h4>
                  <div className="text-muted-foreground leading-relaxed pl-7 space-y-2 text-[13px]">
                    <p dangerouslySetInnerHTML={{ __html: t('feishu.guide_step_6_desc') }} />
                  </div>
                </div>
              </DialogBody>

              <DialogFooter className="pt-4 pb-4">
                <Button className="w-full rounded-xl" onClick={() => setShowHelp(false)}>
                  {t('feishu.guide_done_btn')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleValidate}
            disabled={isValidating || !app.appId || !app.appSecret}
            className={cn(
              'h-7 w-7 rounded-lg transition-colors duration-150',
              'text-muted-foreground hover:text-primary',
              isValidating && 'text-primary'
            )}
            title={t('settings.channels_feishu_validate')}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isValidating && 'animate-spin')} />
          </Button>

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
        {/* App ID + 启用开关 */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.feishu_app_id_label')}
          </label>
          <Input
            placeholder={t('settings.feishu_app_id_placeholder')}
            value={app.appId}
            onChange={(e) => onUpdate({ appId: e.target.value })}
            className={cn(
              'flex-1 h-8 bg-muted/20 border-border/40 rounded-lg font-mono text-[11px]',
              'focus-visible:bg-background transition-all'
            )}
          />
          <Switch
            checked={app.enabled}
            onCheckedChange={handleEnabledChange}
            disabled={isValidating}
          />
        </div>

        {/* App Secret */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.feishu_app_secret_label')}
          </label>
          <Input
            type="password"
            placeholder={t('settings.feishu_app_secret_placeholder')}
            value={app.appSecret}
            onChange={(e) => onUpdate({ appSecret: e.target.value })}
            className={cn(
              'flex-1 h-8 bg-muted/20 border-border/40 rounded-lg font-mono text-[11px]',
              'focus-visible:bg-background transition-all'
            )}
          />
        </div>

        {/* Verification Token (Optional) */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.feishu_verify_token_label')}
          </label>
          <Input
            type="password"
            placeholder={t('settings.channels_placeholder_optional')}
            value={app.verificationToken || ''}
            onChange={(e) => onUpdate({ verificationToken: e.target.value })}
            className={cn(
              'flex-1 h-8 bg-muted/20 border-border/40 rounded-lg font-mono text-[11px]',
              'focus-visible:bg-background transition-all opacity-60 focus-visible:opacity-100'
            )}
          />
        </div>

        {/* Encrypt Key (Optional) */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.feishu_encrypt_key_label')}
          </label>
          <Input
            type="password"
            placeholder={t('settings.channels_placeholder_optional')}
            value={app.encryptKey || ''}
            onChange={(e) => onUpdate({ encryptKey: e.target.value })}
            className={cn(
              'flex-1 h-8 bg-muted/20 border-border/40 rounded-lg font-mono text-[11px]',
              'focus-visible:bg-background transition-all opacity-80 focus-visible:opacity-100'
            )}
          />
        </div>

        {/* 默认智能体 */}
        <div className="flex items-center gap-3 px-4 py-2.5 group/row transition-colors duration-150 hover:bg-muted/10">
          <label className="w-24 shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 group-hover/row:text-primary/70 transition-colors duration-150">
            {t('settings.channels_bot_default_agent')}
          </label>
          <Select
            value={app.defaultAgentId || ''}
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
              <span
                className={cn(
                  'text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full',
                  'transition-all duration-300 origin-center',
                  ruleCount > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0 w-0 px-0'
                )}
              >
                {ruleCount}
              </span>

              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-300',
                  showRules && 'rotate-180'
                )}
              />
            </div>
          </button>

          <div
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
              showRules ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t border-border/30">
                <RoutingTable
                  bindings={app.agentBindings || {}}
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
