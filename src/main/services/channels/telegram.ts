/**
 * Telegram 频道类
 *
 * 功能：
 * - 封装 Telegram Bot 与 Gateway 的交互
 * - 支持流式响应与打字状态同步
 * - 支持论坛话题模式 (Topics/Threads)
 * - 支持绑定特定智能体
 * - 国际化支持 (i18n)
 */

import { Bot, Context, InlineKeyboard } from 'grammy'
import { GatewayClient } from '../gateway/client'
import type { EventFrame, ChatPayload, Message, Agent } from '../gateway/protocol'
import { Logger } from '@main/services/common/logger'
import { ProxyUtils } from '@main/services/common/proxy'
import i18next from 'i18next'

// --- 常量定义 ---
const MAX_MESSAGE_LENGTH = 4096
const TYPING_REFRESH_MS = 5000
const EDIT_THROTTLE_MS = 1500
const CHANNEL_ID = 'telegram'

// --- 类型扩展 ---

export interface TelegramChannelOptions {
  botToken: string
  proxy?: string
  gatewayUrl?: string
  gatewayToken?: string
  defaultAgentId?: string
  agentBindings?: Record<string, string>
  onBindingChange?: (bindings: Record<string, string>) => void
}

/** 运行时的响应状态 */
interface ActiveRun {
  chatId: number
  messageId?: number
  accumulatedText: string
  lastUpdateAt: number
  lang?: string
  isSending?: boolean
  latestText?: string
  lastSentText?: string
  isUpdating?: boolean
}

/** 会话上下文记录 */
interface SessionContext {
  chatId: number
  lang?: string
}

export class TelegramChannel {
  private readonly bot: Bot
  private readonly client: GatewayClient
  private readonly logger: Logger
  private readonly opts: TelegramChannelOptions

  /** 状态追踪 */
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly typingTimers = new Map<number, NodeJS.Timeout>()
  private readonly sessionRegistry = new Map<string, SessionContext>()
  private readonly agentBindings = new Map<string, string>()
  private readonly interactionMessages = new Map<string, { chatId: number; messageId: number }>()

  constructor(opts: TelegramChannelOptions) {
    this.opts = opts
    this.logger = new Logger(`Telegram:${opts.botToken.slice(0, 8)}...`)

    // 初始化动态绑定
    if (opts.agentBindings) {
      Object.entries(opts.agentBindings).forEach(([k, v]) => this.agentBindings.set(k, v))
    }

    // 初始化核心组件
    this.bot = new Bot(opts.botToken, {
      client: { baseFetchConfig: ProxyUtils.getBaseFetchConfig(opts.proxy) }
    })

    this.client = new GatewayClient({
      url: opts.gatewayUrl ?? 'ws://localhost:18781',
      token: opts.gatewayToken,
      onEvent: (evt) => this.handleGatewayEvent(evt),
      onConnect: (hello) => this.logger.info(`[Gateway] 已连接 (v${hello.protocol})`)
    })
  }

  // ============== 生命周期 ==============

  async start(): Promise<void> {
    // 异步启动网关和 Bot
    this.client.connect().catch((err) => this.logger.error('网关连接失败:', err))
    this.setupHandlers()
    this.bot.start()

    // 预加热 Bot 信息
    this.bot
      .init()
      .then(() => this.logger.info(`Bot @${this.bot.botInfo.username} 启动成功`))
      .catch((err) => this.logger.error('Bot 令牌可能无效:', err.message))
  }

  async stop(): Promise<void> {
    this.typingTimers.forEach(clearInterval)
    this.typingTimers.clear()
    this.activeRuns.clear()
    this.sessionRegistry.clear()
    await this.bot.stop()
    this.client.close()
    this.logger.info('Telegram 频道已停止')
  }

  // ============== 逻辑分发 ==============

  private setupHandlers(): void {
    this.bot.catch((err) => this.logger.error('Bot 运行时错误:', err))

    // 基础指令
    this.bot.command('start', (ctx) => this.cmdStart(ctx))
    this.bot.command('reset', (ctx) => this.cmdReset(ctx))
    this.bot.command('health', (ctx) => this.cmdHealth(ctx))
    this.bot.command('bind', (ctx) => this.cmdBind(ctx))
    this.bot.command('agents', (ctx) => this.cmdAgents(ctx))
    this.bot.command('id', (ctx) => this.cmdId(ctx))

    // 文本消息处理
    this.bot.on('message:text', (ctx) => this.onMessageReceived(ctx))

    // 交互回调处理
    this.bot.on('callback_query:data', (ctx) => this.onCallbackQuery(ctx))
  }

  /**
   * 处理网关送达的事件 (唯一的网关业务出口消费)
   */
  private async handleGatewayEvent(evt: EventFrame): Promise<void> {
    if (evt.type !== 'event') return

    // Telegram 关注核心聊天与智能体运行态事件
    const isChat = evt.event.startsWith('chat:')
    const isAgentRun =
      evt.event.startsWith('agent:run-') ||
      evt.event.startsWith('agent:skill-') ||
      evt.event === 'agent:context-overflow'

    if (!isChat && !isAgentRun) return
    const payload = evt.payload as ChatPayload

    const keyInfo = this.parseSessionKey(payload.sessionKey)
    if (!keyInfo) return

    // 如果指定了默认智能体且不匹配，则过滤（多实例环境）
    if (this.opts.defaultAgentId && keyInfo.agentId !== this.opts.defaultAgentId) return

    const run = this.activeRuns.get(payload.runId)
    const context = this.sessionRegistry.get(payload.sessionKey)
    const chatId = run?.chatId || context?.chatId || 0
    if (!chatId) return

    const lang = run?.lang || context?.lang

    switch (evt.event) {
      case 'chat:start':
      case 'chat:thinking':
      case 'agent:run-start':
      case 'agent:skill-triggered':
        await this.onGatewayChatStart(payload, chatId, lang)
        break
      case 'chat:delta':
        if (run) await this.onGatewayChatDelta(payload, run)
        break
      case 'chat:final':
        await this.onGatewayChatFinal(payload, chatId, run)
        break
      case 'chat:error':
      case 'agent:context-overflow':
        await this.onGatewayChatError(payload, chatId, run)
        break
      case 'chat:interaction':
        await this.onGatewayInteraction(payload, chatId, lang)
        break
      case 'chat:interaction-responded':
        await this.onGatewayInteractionResponded(payload, chatId, lang)
        break
    }
  }

  // ============== 消息入站 (Input) ==============

  private async onMessageReceived(ctx: Context): Promise<void> {
    if (!ctx.message?.text || !ctx.chat?.id) return
    const { id: chatId, type } = ctx.chat
    const text = ctx.message.text

    // 群组内提到检查
    if (type !== 'private') {
      const botInfo = this.bot.botInfo
      if (!botInfo) return
      const isMentioned = text.includes(`@${botInfo.username}`)
      const isReplyToMe = ctx.message.reply_to_message?.from?.id === botInfo.id
      if (!isMentioned && !isReplyToMe) return
    }

    const threadId = ctx.message.message_thread_id
    const sessionKey = this.getSessionKey(chatId, threadId)
    const agentId = sessionKey.split(':')[0]

    // 更新联系记录与打字状态
    const lang = ctx.from?.language_code
    this.sessionRegistry.set(sessionKey, { chatId, lang })
    this.startTypingIndicator(chatId)

    this.logger.debug(`[Input] From ${chatId}: "${text.slice(0, 30)}..." -> agent: ${agentId}`)

    try {
      await this.client.request('chat:send', { agentId, sessionKey, message: text })
    } catch (err) {
      this.logger.error(`[Input] 网关发送失败:`, err)
      this.stopTypingIndicator(chatId)
      const t = this.getTranslate(ctx)
      await ctx.reply(t('telegram:error', { error: (err as Error).message }))
    }
  }

  // ============== 消息出站 (Output) ==============

  private async onGatewayChatStart(p: ChatPayload, chatId: number, lang?: string): Promise<void> {
    // 同步刷新打字状态并初始化 Run
    this.bot.api.sendChatAction(chatId, 'typing').catch(() => {})
    if (this.activeRuns.has(p.runId)) return

    this.activeRuns.set(p.runId, {
      chatId,
      accumulatedText: '',
      lastUpdateAt: Date.now(),
      lang
    })
  }

  /**
   * 处理网关送达的消息分段 (Delta)
   */
  private async onGatewayChatDelta(p: ChatPayload, run: ActiveRun): Promise<void> {
    if (!p.delta) return
    run.accumulatedText += p.delta
    run.latestText = run.accumulatedText

    const now = Date.now()
    const shouldUpdate = now - run.lastUpdateAt > EDIT_THROTTLE_MS && run.accumulatedText.trim()

    if (shouldUpdate) {
      run.lastUpdateAt = now
      this.scheduleUpdate(run)
    }
  }

  /**
   * 采用串行锁与双缓冲区（latestText）更新 Telegram 消息
   * 功能：合并频繁更新，消除异步竞态导致的乱序
   */
  private async scheduleUpdate(run: ActiveRun): Promise<void> {
    if (run.isUpdating) return
    run.isUpdating = true

    try {
      while (run.latestText !== run.lastSentText) {
        const textToSent = run.latestText || ''
        const truncated = this.truncate(textToSent)

        if (!run.messageId) {
          // 首条消息发送保护
          if (run.isSending) {
            await new Promise((r) => setTimeout(r, 100))
            continue
          }
          run.isSending = true
          try {
            const msg = await this.bot.api.sendMessage(run.chatId, truncated)
            run.messageId = msg.message_id
            run.lastSentText = textToSent
          } catch (err) {
            this.logger.error('[Output] 首次消息发送失败:', err)
            break
          } finally {
            run.isSending = false
          }
        } else {
          // 编辑现有消息
          try {
            await this.bot.api.editMessageText(run.chatId, run.messageId, truncated)
            run.lastSentText = textToSent
          } catch (err: any) {
            const desc = err.description || ''
            if (desc.includes('message is not modified')) {
              run.lastSentText = textToSent
              continue
            }
            if (desc.includes('message to edit not found')) break
            this.logger.warn('[Output] 编辑消息失败:', desc)
            await new Promise((r) => setTimeout(r, 500))
          }
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    } finally {
      run.isUpdating = false
    }
  }

  /**
   * 处理网关送达的最终消息 (Final)
   */
  private async onGatewayChatFinal(p: ChatPayload, chatId: number, run?: ActiveRun): Promise<void> {
    this.stopTypingIndicator(chatId)
    const finalText = this.extractText(p.message) || run?.accumulatedText || ''
    if (!finalText.trim()) {
      if (p.runId) this.activeRuns.delete(p.runId)
      return
    }

    if (run) {
      run.latestText = finalText
      // 最后一次更新确保送达
      await this.scheduleUpdate(run)
    } else {
      // 对应快速响应场景
      await this.sendFullMessage(chatId, finalText)
    }

    if (p.runId) {
      // 延迟清理对象引用，允许正在进行的 scheduleUpdate 循环完成
      setTimeout(() => this.activeRuns.delete(p.runId), 2000)
    }
  }

  private async onGatewayChatError(p: ChatPayload, chatId: number, run?: ActiveRun): Promise<void> {
    this.stopTypingIndicator(chatId)
    const t = this.getTranslate(run?.lang)
    const errorMsg = t('telegram:error', { error: p.error ?? 'unknown' })

    if (run?.messageId) {
      await this.bot.api.editMessageText(chatId, run.messageId, errorMsg).catch(() => {})
    } else {
      await this.bot.api.sendMessage(chatId, errorMsg).catch(() => {})
    }

    if (p.runId) this.activeRuns.delete(p.runId)
  }

  // ============== 交互处理 (Interaction) ==============

  private async onGatewayInteraction(
    p: ChatPayload,
    chatId: number,
    _lang?: string
  ): Promise<void> {
    const interactionId = p.interactionId
    if (!interactionId) return

    const prompt = p.prompt || 'Confirm operation?'
    const options = p.options || ['Confirm', 'Cancel']
    // const t = this.getTranslate(lang)

    const keyboard = new InlineKeyboard()
    options.forEach((opt, idx) => {
      // 约定：第一个选项为 true，其余为 false
      const result = idx === 0
      keyboard.text(opt, `int_res:${interactionId}:${result}`)
      if (idx % 2 === 1) keyboard.row()
    })

    try {
      const msg = await this.bot.api.sendMessage(chatId, `❓ *${prompt}*`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
      this.interactionMessages.set(interactionId, { chatId, messageId: msg.message_id })
    } catch (err) {
      this.logger.error('下发交互请求失败:', err)
    }
  }

  private async onGatewayInteractionResponded(
    p: ChatPayload,
    _chatId: number,
    lang?: string
  ): Promise<void> {
    const interactionId = p.interactionId
    if (!interactionId) return

    const it = this.interactionMessages.get(interactionId)
    if (!it) return

    this.interactionMessages.delete(interactionId)
    const t = this.getTranslate(lang)
    const isSuccess = p.result === true
    const resultText = isSuccess ? '✅' : '❌'

    try {
      // 通过编辑消息移除按钮，表示交互已关闭
      await this.bot.api.editMessageText(
        it.chatId,
        it.messageId,
        `${resultText} *${t('telegram:interaction_completed')}* (Result: ${isSuccess})`
      )
    } catch (err) {
      // ignore
    }
  }

  private async onCallbackQuery(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data
    if (!data?.startsWith('int_res:')) return

    const [, interactionId, resultStr] = data.split(':')
    const result = resultStr === 'true'
    const agentId = this.parseSessionKey(this.getSessionKey(ctx.chat!.id))?.agentId || 'main'

    try {
      await this.client.request('chat:respondInteraction', {
        agentId,
        interactionId,
        result,
        remember: false
      })
      await ctx.answerCallbackQuery()
    } catch (err) {
      await ctx.answerCallbackQuery({ text: 'Error responding to interaction' })
    }
  }

  // ============== 指令逻辑 ==============

  private cmdStart(ctx: Context): void {
    const t = this.getTranslate(ctx)
    ctx.reply(t('telegram:welcome', { agentId: this.opts.defaultAgentId || 'main' }))
  }

  private cmdId(ctx: Context): void {
    const t = this.getTranslate(ctx)
    const chatId = ctx.chat?.id
    const threadId = ctx.message?.message_thread_id

    let info = `*${t('telegram:chat_info_title')}*\n\n`
    info += `${t('telegram:chat_id', { chatId })}\n`
    if (threadId) info += `${t('telegram:topic_id', { threadId })}\n`
    info += `\n${t('telegram:chat_type', { type: ctx.chat?.type })}`

    ctx.reply(info, { parse_mode: 'Markdown' })
  }

  private async cmdBind(ctx: Context): Promise<void> {
    const t = this.getTranslate(ctx)
    const agentId = ctx.message?.text?.split(' ')[1]?.trim()
    if (!agentId) return void ctx.reply(t('telegram:bind_usage'))

    const chatId = ctx.chat!.id
    const threadId = ctx.message?.message_thread_id
    const key = threadId ? `${chatId}_${threadId}` : `${chatId}`

    try {
      const res = await this.client.request<{ agents: Agent[] }>('agent:list')
      if (!res.agents.some((a) => a.id === agentId)) {
        return void ctx.reply(t('telegram:agent_not_found', { agentId }))
      }

      this.agentBindings.set(key, agentId)
      this.opts.onBindingChange?.(Object.fromEntries(this.agentBindings))

      const target = threadId
        ? t('telegram:target_topic', { threadId })
        : t('telegram:target_current')
      await ctx.reply(t('telegram:bind_success', { agentId, target }))
    } catch (err) {
      this.logger.error('绑定失败:', err)
      await ctx.reply(t('telegram:error', { error: 'Gateway unreachable' }))
    }
  }

  private async cmdAgents(ctx: Context): Promise<void> {
    const t = this.getTranslate(ctx)
    try {
      const res = await this.client.request<{ agents: Agent[] }>('agent:list')
      const list = res.agents.map((a) => `- \`${a.id}\` (${a.config.name || 'Unnamed'})`).join('\n')
      await ctx.reply(t('telegram:available_agents', { list: list || t('telegram:no_agents') }), {
        parse_mode: 'Markdown'
      })
    } catch (err) {
      this.logger.error('获取列表失败:', err)
      await ctx.reply(t('telegram:fetch_agents_failed'))
    }
  }

  private async cmdReset(ctx: Context): Promise<void> {
    const t = this.getTranslate(ctx)
    const chatId = ctx.chat!.id
    const threadId = ctx.message?.message_thread_id
    const sessionKey = this.getSessionKey(chatId, threadId)
    const agentId = sessionKey.split(':')[0]

    try {
      await this.client.request('sessions:reset', { agentId, sessionKey })
      await ctx.reply(t('telegram:session_reset'))
    } catch (err) {
      await ctx.reply(t('telegram:reset_failed', { error: (err as Error).message }))
    }
  }

  private async cmdHealth(ctx: Context): Promise<void> {
    const t = this.getTranslate(ctx)
    try {
      const h = await this.client.request<{ uptimeMs: number; clients: number }>('health')
      await ctx.reply(
        t('telegram:gateway_status', {
          uptime: Math.round(h.uptimeMs / 1000),
          clients: h.clients
        })
      )
    } catch (err) {
      await ctx.reply(t('telegram:health_failed', { error: (err as Error).message }))
    }
  }

  // ============== 私有辅助 ==============

  private getSessionKey(chatId: number, threadId?: number): string {
    const bindKey = threadId ? `${chatId}_${threadId}` : `${chatId}`
    const agentId = this.agentBindings.get(bindKey) || this.opts.defaultAgentId || 'main'
    return `${agentId}:${CHANNEL_ID}${threadId ? `:${threadId}` : ''}`
  }

  private parseSessionKey(key: string) {
    const parts = key.split(':')
    if (parts[1] !== CHANNEL_ID) return null
    return {
      agentId: parts[0],
      threadId: parts[2] ? parseInt(parts[2], 10) : undefined
    }
  }

  private getTranslate(source?: Context | string) {
    let lang = 'en'
    if (typeof source === 'string') {
      lang = source.startsWith('zh') ? 'zh' : 'en'
    } else if (source?.from?.language_code) {
      lang = source.from.language_code.startsWith('zh') ? 'zh' : 'en'
    }
    return i18next.getFixedT(lang)
  }

  private extractText(message?: Message): string {
    if (!message?.content) return ''
    if (typeof message.content === 'string') return message.content
    return message.content
      .map((b) => {
        if (b.type === 'text') return b.text
        if (b.type === 'thinking') return b.thinking
        return ''
      })
      .join('')
  }

  private truncate(text: string): string {
    return text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH) : text
  }

  private async sendFullMessage(chatId: number, text: string): Promise<void> {
    if (!text) return
    let remaining = text
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, MAX_MESSAGE_LENGTH)
      remaining = remaining.slice(MAX_MESSAGE_LENGTH)
      await this.bot.api
        .sendMessage(chatId, chunk)
        .catch((e) => this.logger.error('发送分段失败:', e))
    }
  }

  private startTypingIndicator(chatId: number): void {
    this.stopTypingIndicator(chatId)
    const send = () => this.bot.api.sendChatAction(chatId, 'typing').catch(() => {})
    send()
    this.typingTimers.set(chatId, setInterval(send, TYPING_REFRESH_MS))
  }

  private stopTypingIndicator(chatId: number): void {
    const timer = this.typingTimers.get(chatId)
    if (timer) {
      clearInterval(timer)
      this.typingTimers.delete(chatId)
    }
  }
}
