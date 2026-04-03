/**
 * Telegram 频道实现 (优化版)
 * 提供流式输出、任务队列、多语言指令同步及交互式 UI 支持
 */

import { Bot, Context, InlineKeyboard } from 'grammy'
import type { ChatPayloadFlat } from '../../gateway/protocol'
import { ProxyUtils } from '@main/services/common/proxy'

import { CHANNEL_ID, TYPING_REFRESH_MS } from './constants'
import { TelegramChannelOptions } from './types'
import { BaseChannel } from '../base'
import { CommonRun, QueueTask } from '../base/types'
import { getTranslate, parseSessionKey } from '../base/utils'

export class TelegramChannel extends BaseChannel<TelegramChannelOptions> {
  private readonly bot: Bot

  constructor(opts: TelegramChannelOptions) {
    super(opts, CHANNEL_ID)
    this.maxMessageLength = 4096

    // 初始化 Bot (支持代理)
    this.bot = new Bot(opts.botToken, {
      client: { baseFetchConfig: ProxyUtils.getBaseFetchConfig(opts.proxy) }
    })

    // 设置队列获取间隔 (例如 1000ms)，用于频率限制
    this.queueInterval = 2000
  }

  // ============== 生命周期实现 ==============

  protected async setupPlatform(): Promise<void> {
    this.setupHandlers()
    this.bot.start()

    this.bot
      .init()
      .then(async () => {
        this.logger.info(`Bot @${this.bot.botInfo.username} 启动成功`)
        await this.syncNativeCommands()
      })
      .catch((err) => this.logger.error('Bot 令牌无效或网络超时:', err.message))
  }

  /**
   * 同步原生菜单指令 (支持多语言)
   */
  private async syncNativeCommands(): Promise<void> {
    const langs = ['zh', 'en'] as const

    try {
      // 1. 设置默认指令 (不带 language_code)，遵循当前应用语言
      const defaultCmds = this.getAvailableCommands().map((c) => ({
        command: c.command,
        description: c.description.slice(0, 256)
      }))
      await this.bot.api.setMyCommands(defaultCmds)

      // 2. 依次为常用语言设置特定指令菜单
      for (const lang of langs) {
        const commands = this.getAvailableCommands(lang).map((c) => ({
          command: c.command,
          description: c.description.slice(0, 256)
        }))
        await this.bot.api.setMyCommands(commands, { language_code: lang })
      }

      this.logger.debug(`[Bot] Native commands synced for: Default, ${langs.join(', ')}`)
    } catch (err) {
      this.logger.warn('[Bot] Failed to sync native commands:', (err as Error).message)
    }
  }

  async onLanguageChanged(_lang: string): Promise<void> {
    // 应用语言变更时同步菜单
    await this.syncNativeCommands()
  }

  protected async teardownPlatform(): Promise<void> {
    try {
      await this.bot.stop()
    } catch (err) {
      this.logger.debug('[Bot] Stop warning:', (err as Error).message)
    }
  }

  private setupHandlers(): void {
    this.bot.catch((err) => this.logger.error('[Bot] Runtime Error:', err))

    // 平台指令处理
    this.bot.command('start', (ctx) => this.cmdStart(ctx))

    // 交互行为处理
    // 尝试直接监听所有文本 (包括消息和频道帖子)
    this.bot.on([':text', 'channel_post:text'], (ctx) => this.onMessageReceived(ctx))
    this.bot.on('callback_query:data', (ctx) => this.onCallbackQuery(ctx))
  }

  // ============== BaseChannel 抽象方法实现 ==============

  /**
   * 覆写消费者中的处理函数：实现具体的消息物理发送/更新
   */
  protected async handleQueueTask(run: CommonRun, task: QueueTask): Promise<void> {
    const { type, text, payload } = task

    if (type === 'text') {
      const data = text || ''
      if (!run.channelMessageId) {
        if (run.isSending) return
        run.isSending = true
        try {
          run.channelMessageId = await this.sendPlatformMessage(run.chatId, data)
        } finally {
          run.isSending = false
        }
      } else {
        await this.editPlatformMessage(run.chatId, run.channelMessageId, data)
      }
    } else if (type === 'interaction' && payload) {
      const interactionId = payload.interactionId
      if (!interactionId) return
      const messageId = await this.sendPlatformInteraction(run.chatId, payload, run.lang)
      if (messageId) {
        this.interactionMessages.set(interactionId, {
          chatId: run.chatId,
          messageId,
          options: payload.options
        })
      }
    } else if (type === 'interaction-responded' && payload) {
      const interactionId = payload.interactionId
      if (!interactionId) return
      const record = this.interactionMessages.get(interactionId)
      if (!record) return
      this.interactionMessages.delete(interactionId)
      await this.updatePlatformInteraction(record.chatId, record.messageId, payload, run.lang)
    }
  }

  /**
   * 发送新消息：使用增强的 HTML 转换逻辑
   */
  protected async sendPlatformMessage(
    chatId: string | number,
    text: string
  ): Promise<string | number> {
    const threadId = this.findThreadIdByChatId(chatId)

    try {
      // 预转换 Markdown 为 HTML 提高兼容性
      const content = this.mdToFormat(text, 'html')
      const msg = await this.bot.api.sendMessage(chatId, content, {
        parse_mode: 'HTML',
        message_thread_id: threadId,
        link_preview_options: { is_disabled: false, prefer_small_media: true }
      })
      return msg.message_id
    } catch (err) {
      const errMsg = (err as Error).message || ''

      // 如果话题不存在，降级
      if (errMsg.includes('thread not found') && threadId !== undefined) {
        this.logger.warn(`[Bot] Thread ${threadId} not found, falling back to main chat.`)
        return await this.sendPlatformMessage(chatId, text)
      }

      // 如果 HTML 发送失败，作为纯文本发送
      this.logger.debug(`[Bot] HTML send failed, fallback to Text: ${errMsg}`)
      const msg = await this.bot.api.sendMessage(chatId, text, {
        message_thread_id: threadId
      })
      return msg.message_id
    }
  }

  protected async editPlatformMessage(
    chatId: string | number,
    messageId: string | number,
    text: string
  ): Promise<void> {
    try {
      const content = this.mdToFormat(text, 'html')
      await this.bot.api.editMessageText(chatId, Number(messageId), content, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      })
    } catch (err) {
      const errMsg = (err as Error).message || ''
      if (errMsg.includes('not modified')) return

      try {
        await this.bot.api.editMessageText(chatId, Number(messageId), text)
      } catch (fallbackErr) {
        // ignore
      }
    }
  }

  /**
   * 按聊天 ID 寻找匹配的线程 ID (从当前运行状态中预测)
   */
  private findThreadIdByChatId(chatId: string | number): number | undefined {
    for (const run of this.activeRuns.values()) {
      if (run.chatId === chatId && typeof run.threadId === 'number') return run.threadId
    }
    return undefined
  }

  // ============== 输入状态管理 ==============

  protected async startTyping(chatId: string | number): Promise<void> {
    // Telegram 输入状态有效时间通常为 5s，我们需要轮询维持
    const send = () => this.bot.api.sendChatAction(chatId, 'typing').catch(() => {})
    send()
    this.typingTimers.set(chatId, setInterval(send, TYPING_REFRESH_MS))
  }

  protected async stopTyping(chatId: string | number): Promise<void> {
    const timer = this.typingTimers.get(chatId)
    if (timer) {
      clearInterval(timer)
      this.typingTimers.delete(chatId)
    }
  }

  protected async replyToCommand(
    chatId: string | number,
    text: string,
    options?: { parseMode?: 'Markdown' | 'HTML' }
  ): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: options?.parseMode || undefined
      })
    } catch (err) {
      this.logger.debug(`[Bot] Command reply (Formatted) failed: ${(err as Error).message}`)
      await this.bot.api.sendMessage(chatId, text)
    }
  }

  protected getPlatformHelp(lang?: string): string {
    const t = getTranslate(lang)
    const extra = t(`${this.channelId}:help_extra`)
    if (!extra || extra === `${this.channelId}:help_extra`) return ''
    return extra
  }

  // ============== 交互式 UI 处理 (Buttons) ==============

  protected async sendPlatformInteraction(
    chatId: string | number,
    p: ChatPayloadFlat,
    lang?: string
  ): Promise<string | number | undefined> {
    const interactionId = p.interactionId
    if (!interactionId) return undefined

    const t = getTranslate(lang)
    const prompt = p.prompt || t('telegram:confirm_interaction')
    const options = p.options || ['Confirm', 'Cancel']

    // 构造内联键盘
    const keyboard = new InlineKeyboard()
    options.forEach((opt, idx) => {
      // 传递索引作为结果，不再仅限 true/false
      keyboard.text(opt, `int_res:${interactionId}:${idx}`)
      if (idx % 2 === 1) keyboard.row()
    })

    try {
      // 交互提示使用 HTML 加粗以区分正文
      const safePrompt = this.escapeHTML(prompt)
      const msg = await this.bot.api.sendMessage(chatId, `<b>❓ ${safePrompt}</b>`, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
      return msg.message_id
    } catch (err) {
      this.logger.error('[Bot] Failed to send interaction request:', err)
      return undefined
    }
  }

  protected async updatePlatformInteraction(
    chatId: string | number,
    messageId: string | number,
    _p: ChatPayloadFlat,
    _lang?: string
  ): Promise<void> {
    try {
      // 交互完成后直接删除交互卡片，不再显示“交互已完成”的结果
      await this.bot.api.deleteMessage(chatId, Number(messageId))
    } catch (err) {
      // ignore (可能已经被用户手动删除或权限不足)
    }
  }

  // ============== 处理来自 Telegram 的物理输入 ==============

  private async onMessageReceived(ctx: Context): Promise<void> {
    const msg = ctx.msg
    if (!msg?.text || !ctx.chat?.id) return
    const { id: chatId, type } = ctx.chat
    const text = msg.text.trim()

    // 1. 指令解析 (如果是指令则拦截处理)
    const handled = await this.tryProcessCommand(text, chatId, {
      lang: ctx.from?.language_code,
      threadId: msg.message_thread_id
    })
    if (handled) return

    // 2. 群组/频道消息过滤
    if (type !== 'private') {
      const botInfo = this.bot.botInfo
      if (!botInfo) return
      const isMentioned = text.includes(`@${botInfo.username}`)
      const isReplyToMe = msg.reply_to_message?.from?.id === botInfo.id
      // 频道(channel)中如果没有提到机器人也通常不回复，除非它是唯一发帖者
      if (!isMentioned && !isReplyToMe) return
    }

    // 3. 生成会话 ID 并转发网关
    const sessionKey = this.getInternalSessionKey(chatId, msg.message_thread_id)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)
    if (!sessionInfo) return

    this.logger.debug(
      `[Input] From ${chatId}: "${text.slice(0, 30)}..." -> agent: ${sessionInfo.agentId}`
    )

    try {
      let finalPrompt = text
      // 增强：如果这条消息是回复某人的，自动带上被回复的内容作为参考上下文
      const quotedMsg = msg.reply_to_message
      if (quotedMsg && quotedMsg.text) {
        const t = getTranslate(ctx)
        const refLabel = t('telegram:reference_message') || 'Reference Content'
        finalPrompt = `[${refLabel}]:\n"""\n${quotedMsg.text}\n"""\n\n${text}`
      }

      await this.sendToGateway(
        sessionInfo.agentId,
        sessionKey,
        finalPrompt,
        chatId,
        ctx.from?.language_code
      )
    } catch (err) {
      this.logger.error(`[Input] Gateway reachable failed:`, err)
      this.stopTyping(chatId)
      const t = getTranslate(ctx)
      await ctx.reply(
        `❌ <b>${this.escapeHTML(t('telegram:error', { error: 'Gateway Offline' }))}</b>`,
        {
          parse_mode: 'HTML'
        }
      )
    }
  }

  /**
   * 点击内联按钮后的处理
   */
  private async onCallbackQuery(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data
    if (!data?.startsWith('int_res:')) return

    const [, interactionId, resultRaw] = data.split(':')
    const sessionKey = this.getInternalSessionKey(ctx.chat!.id)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)

    // 从注册表中获取对应的选项文字
    const record = this.interactionMessages.get(interactionId)
    let result = [resultRaw]

    if (record && record.options && !isNaN(Number(resultRaw))) {
      const idx = Number(resultRaw)
      if (record.options[idx]) {
        result = [record.options[idx]]
      }
    }

    try {
      await this.client.request('chat:respondInteraction', {
        agentId: sessionInfo?.agentId || 'main',
        interactionId,
        result,
        remember: false
      })
      await ctx.answerCallbackQuery()
    } catch (err) {
      await ctx.answerCallbackQuery({ text: 'Error responding to interaction' })
    }
  }

  // ============== 指令响应逻辑 ==============

  private cmdStart(ctx: Context): void {
    const t = getTranslate(ctx)
    ctx.reply(t('telegram:welcome', { agentId: this.opts.defaultAgentId || 'main' }))
  }

  // ============== 工具与装饰器 ==============

  /**
   * 文本修饰：开发者要求：不要光标
   */
  protected decorateMessage(text: string, _isFinal: boolean): string {
    return text
  }
}
