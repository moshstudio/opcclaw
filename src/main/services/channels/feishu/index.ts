/**
 * Feishu 频道实现
 * 参考 OpenClaw Feishu 扩展实现
 */

import * as Lark from '@larksuiteoapi/node-sdk'
import type { ChatPayloadFlat } from '../../gateway/protocol'
import { CHANNEL_ID } from './constants'
import {
  FeishuChannelOptions,
  FeishuMessageEvent,
  FeishuCardActionTriggerEvent,
  FeishuCardActionResponse
} from './types'
import { BaseChannel } from '../base'
import { CommonRun, QueueTask } from '../base/types'
import { getTranslate, parseSessionKey } from '../base/utils'

export class FeishuChannel extends BaseChannel<FeishuChannelOptions> {
  private client_sdk?: Lark.Client
  private ws_client?: Lark.WSClient
  private botOpenId?: string
  private botName?: string

  constructor(opts: FeishuChannelOptions) {
    super(opts, CHANNEL_ID)
    this.maxMessageLength = 30000
  }

  // ============== 生命周期实现 ==============

  protected async setupPlatform(): Promise<void> {
    const { appId, appSecret, encryptKey, verificationToken } = this.opts

    try {
      // 1. 初始化 SDK 客户端
      this.client_sdk = new Lark.Client({
        appId,
        appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: Lark.Domain.Feishu
      })

      // 2. 初始化长连接客户端
      this.ws_client = new Lark.WSClient({
        appId,
        appSecret,
        domain: Lark.Domain.Feishu,
        loggerLevel: Lark.LoggerLevel.info
      })

      // 3. 注册事件处理器
      const eventDispatcher = new Lark.EventDispatcher({ encryptKey, verificationToken })
      this.registerEventHandlers(eventDispatcher)

      this.ws_client.start({ eventDispatcher })

      // 4. 异步获取机器人信息
      await this.initBotInfo()

      this.logger.info(`[Feishu] 频道已启动 (AppID: ${appId})`)
    } catch (err) {
      this.logger.error(`[Feishu] 初始化失败: ${(err as Error).message}`)
    }
  }

  protected async teardownPlatform(): Promise<void> {
    this.ws_client = undefined
    this.client_sdk = undefined
  }

  /**
   * 注册飞书事件回调
   */
  private registerEventHandlers(dispatcher: Lark.EventDispatcher): void {
    dispatcher.register({
      'im.message.receive_v1': async (data) => {
        await this.onMessageReceived(data as FeishuMessageEvent)
      },
      'card.action.trigger': async (
        data: FeishuCardActionTriggerEvent
      ): Promise<FeishuCardActionResponse> => {
        return this.handleCardAction(data)
      }
    })
  }

  /**
   * 初始化机器人基本信息
   */
  private async initBotInfo(): Promise<void> {
    try {
      const res: any = await this.client_sdk?.request({
        method: 'GET',
        url: '/open-apis/bot/v3/info'
      })
      if (res?.code === 0) {
        const bot = res.bot || res.data?.bot
        this.botOpenId = bot?.open_id
        this.botName = bot?.bot_name
        this.logger.info(`[Feishu] 机器人加载成功: ${this.botName} (${this.botOpenId})`)
      }
    } catch (err) {
      this.logger.warn(`[Feishu] 无法获取机器人信息: ${(err as Error).message}`)
    }
  }

  // ============== 核心交互实现 ==============

  protected async handleQueueTask(run: CommonRun, task: QueueTask): Promise<void> {
    const { type, text, payload } = task

    switch (type) {
      case 'text':
      case 'text-fix': {
        if (run.channelMessageId) {
          await this.editPlatformMessage(run.chatId, run.channelMessageId, run.accumulatedText)
        } else {
          const msgId = await this.sendPlatformMessage(run.chatId, run.accumulatedText)
          run.channelMessageId = String(msgId)
        }
        break
      }
      case 'think':
        return
      case 'tool-call': {
        const toolName = payload?.toolName || 'unknown'
        const label = `**工具调用: ${toolName}**`
        const prefix = run.accumulatedText ? '\n' : ''
        const fullContent = (run.accumulatedText || '') + prefix + label
        if (run.channelMessageId) {
          await this.editPlatformMessage(run.chatId, run.channelMessageId, fullContent)
        } else {
          const msgId = await this.sendPlatformMessage(run.chatId, fullContent)
          run.channelMessageId = String(msgId)
        }
        this.resetMessageContext(run)
        return
      }
      case 'tool-result':
        this.resetMessageContext(run)
        return
      case 'interaction': {
        if (!payload) return

        // 仅交互任务允许尝试恢复之前的卡片 ID (用于原地更新)
        if (!run.channelMessageId) {
          if (payload.interactionId) {
            const record = this.interactionMessages.get(payload.interactionId)
            if (record) run.channelMessageId = String(record.messageId)
          }
          if (!run.channelMessageId) {
            const sessionKey = this.getInternalSessionKey(run.chatId, run.threadId)
            const session = this.sessionRegistry.get(sessionKey)
            if (session?.lastInteractionMessageId)
              run.channelMessageId = String(session.lastInteractionMessageId)
          }
        }

        // 交互始终开启新气泡
        this.resetMessageContext(run)
        const iid = await this.sendPlatformInteraction(
          run.chatId,
          payload,
          run.lang,
          run.threadId ? String(run.threadId) : undefined,
          run.channelMessageId
        )
        if (iid) run.channelMessageId = String(iid)
        run.lastIsTool = false
        break
      }
      case 'interaction-responded': {
        if (!payload) return

        // 恢复结果响应所需的卡片 ID
        if (!run.channelMessageId) {
          if (payload.interactionId) {
            const record = this.interactionMessages.get(payload.interactionId)
            if (record) run.channelMessageId = String(record.messageId)
          }
          if (!run.channelMessageId) {
            const sessionKey = this.getInternalSessionKey(run.chatId, run.threadId)
            const session = this.sessionRegistry.get(sessionKey)
            if (session?.lastInteractionMessageId)
              run.channelMessageId = String(session.lastInteractionMessageId)
          }
        }

        if (run.channelMessageId) {
          await this.updatePlatformInteraction(run.chatId, run.channelMessageId, payload, run.lang)
          // 完成后重置上下文，确保后续是新气泡
          this.resetMessageContext(run)
        }
        break
      }
    }
  }

  protected async sendPlatformMessage(chatId: string | number, text: string): Promise<string> {
    if (!this.client_sdk) throw new Error('Client not ready')

    const receiveIdType = String(chatId).startsWith('oc_') ? 'chat_id' : 'open_id'
    const formattedText = this.mdToFormat(text, 'markdown')

    const res = await this.client_sdk.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: String(chatId),
        msg_type: 'interactive',
        content: FeishuCardBuilder.buildTextContent(formattedText)
      }
    })

    if (res.code !== 0) {
      throw new Error(`Feishu API Error [${res.code}]: ${res.msg}`)
    }

    return res.data!.message_id!
  }

  protected async editPlatformMessage(
    _chatId: string | number,
    messageId: string | number,
    text: string
  ): Promise<void> {
    if (!this.client_sdk) return

    const formattedText = this.mdToFormat(text, 'markdown')
    try {
      const res = await this.client_sdk.im.message.patch({
        path: { message_id: String(messageId) },
        data: {
          content: FeishuCardBuilder.buildTextContent(formattedText)
        }
      })

      if (res.code !== 0 && res.code !== 230020) {
        this.logger.warn(`[Feishu] 编辑消息失败: ${res.msg}`)
      }
    } catch (err) {
      this.logger.warn(`[Feishu] 编辑消息异常: ${(err as Error).message}`)
    }
  }

  protected async startTyping(chatId: string | number): Promise<void> {
    this.logger.debug(`[Feishu] Typing... in ${chatId}`)
  }

  protected stopTyping(): void {
    this.logger.debug('[Feishu] Stop typing')
  }

  protected async replyToCommand(chatId: string | number, text: string): Promise<void> {
    await this.sendFullMessage(chatId, text)
  }

  protected async sendPlatformInteraction(
    chatId: string | number,
    p: ChatPayloadFlat,
    lang?: string,
    threadId?: string | number,
    messageId?: string | number
  ): Promise<string | undefined> {
    if (!this.client_sdk) return undefined
    const t = getTranslate(lang)

    const cardContent = FeishuCardBuilder.buildInteractionCard({
      title: t('channel_base:interaction_title'),
      prompt: this.mdToFormat(p.prompt || 'Confirm operation?', 'markdown'),
      options: p.options || ['Confirm', 'Cancel'],
      interactionId: p.interactionId,
      preText: messageId
        ? this.mdToFormat(this.activeRuns.get(p.runId!)?.accumulatedText || '', 'markdown')
        : undefined
    })

    try {
      let res: any
      if (messageId) {
        res = await this.client_sdk.im.message.patch({
          path: { message_id: String(messageId) },
          data: { content: cardContent }
        })
      } else {
        const receiveIdType = String(chatId).startsWith('oc_') ? 'chat_id' : 'open_id'
        res = await this.client_sdk.im.message.create({
          params: { receive_id_type: receiveIdType },
          data: {
            receive_id: String(chatId),
            msg_type: 'interactive',
            content: cardContent
          }
        })
      }

      const finalMessageId = messageId ? String(messageId) : res.data?.message_id
      if (res.code === 0 && finalMessageId) {
        if (p.interactionId) {
          this.interactionMessages.set(p.interactionId, {
            chatId,
            messageId: finalMessageId,
            options: p.options || []
          })
          setTimeout(() => this.interactionMessages.delete(p.interactionId!), 3600000)
        }
        // 同步到会话上下文，供后续 Run 继承
        const sessionKey = p.sessionKey || this.getInternalSessionKey(chatId, threadId)
        const session = this.sessionRegistry.get(sessionKey)
        if (session) {
          session.lastInteractionMessageId = finalMessageId
        }
      }

      return finalMessageId
    } catch (err) {
      this.logger.error(`[Feishu] 发送/转换卡片失败: ${(err as Error).message}`)
      return undefined
    }
  }

  protected async updatePlatformInteraction(
    chatId: string | number,
    messageId: string | number,
    p: ChatPayloadFlat,
    lang?: string
  ): Promise<void> {
    if (!this.client_sdk) return
    this.logger.debug(`[Feishu] Updating interaction in chat ${chatId}`)

    const t = getTranslate(lang)
    const result = p.result?.[0] || ''
    const isSuccess =
      result === 'true' || result === '0' || result === 'Confirm' || result === '确认'

    const cardContent = FeishuCardBuilder.buildInteractionResultCard({
      title: t('channel_base:interaction_completed'),
      prompt: p.prompt ? this.mdToFormat(p.prompt, 'markdown') : undefined,
      result: result,
      resultLabel: t('channel_base:tool_result_label'),
      isSuccess
    })

    try {
      await this.client_sdk.im.message.patch({
        path: { message_id: String(messageId) },
        data: { content: cardContent }
      })
    } catch (err) {
      this.logger.warn(`[Feishu] 更新交互卡片失败: ${(err as Error).message}`)
    }
  }

  /**
   * 处理卡片交互回调
   */
  private async handleCardAction(
    data: FeishuCardActionTriggerEvent
  ): Promise<FeishuCardActionResponse> {
    const { action, context } = data
    const chatId = context?.open_chat_id
    const interactionValue = action.value || {}

    this.logger.debug(
      `[Feishu] Card action: tag=${action.tag}, value=${JSON.stringify(interactionValue)}`
    )

    // 1. 处理交互型按钮
    if (interactionValue.action === 'interaction' && chatId) {
      const { id: interactionId, result: resultRaw } = interactionValue
      const sessionKey = this.getInternalSessionKey(chatId)
      const sessionInfo = parseSessionKey(sessionKey, this.channelId)
      const t = getTranslate(this.sessionRegistry.get(sessionKey)?.lang)

      // 还原选项文本
      const record = this.interactionMessages.get(interactionId)
      let result = [String(resultRaw)]
      if (record?.options && !isNaN(Number(resultRaw))) {
        const idx = Number(resultRaw)
        if (record.options[idx]) result = [record.options[idx]]
      }

      // 同步卡片 ID 到会话，备接下来的响应 Run 使用 (双重保障)
      const contextMessageId = context?.open_message_id
      if (contextMessageId) {
        const session = this.sessionRegistry.get(sessionKey)
        if (session) {
          session.lastInteractionMessageId = contextMessageId
        }
      }

      // 异步通知网关
      this.client
        .request('chat:respondInteraction', {
          agentId: sessionInfo?.agentId || 'main',
          interactionId,
          result,
          remember: false
        })
        .catch((err) => this.logger.error('[Feishu] Respond interaction error:', err))

      return {
        toast: {
          type: 'info',
          content: t('channel_base:executing') || 'Processing...'
        }
      }
    }

    // 2. 处理表单提交 (预留)
    if (action.form_value) {
      this.logger.info(`[Feishu] Form submitted: ${JSON.stringify(action.form_value)}`)
      return { toast: { type: 'success', content: 'Form submitted' } }
    }

    return {}
  }

  /**
   * 处理接收到的消息
   */
  private async onMessageReceived(event: FeishuMessageEvent): Promise<void> {
    const { message, sender } = event
    const chatId = message.chat_id
    const openId = sender.sender_id.open_id
    if (!openId) return

    // 1. 权限与 Mention 检查 (针对群聊)
    const isGroup = message.chat_type === 'group' || message.chat_type === 'private'
    const botMentioned = this.checkBotMentioned(event)

    if (isGroup && !botMentioned) return

    // 2. 解析与清洗文本内容
    let text = this.parseMessageContent(message)
    if (botMentioned) {
      text = this.stripBotMention(text, message.mentions)
    }

    text = text.trim()
    if (!text) return

    // 3. 优先处理指令 (必须在拼接引用上下文之前)
    const threadId = message.root_id || undefined
    const handled = await this.tryProcessCommand(text, chatId, {
      threadId,
      lang: undefined // 飞书事件目前不直接提供语言信息，由 getTranslate 自动处理
    })
    if (handled) return

    // 4. 处理引用回复 (获取被回复的消息内容) - 指令不应包含引用内容
    if (message.parent_id) {
      this.logger.debug(`[Feishu] Detected parent_id: ${message.parent_id}, fetching content...`)
      const parentContent = await this.getPlatformMessage(message.parent_id)
      if (parentContent) {
        // 模仿引用样式：> 内容\n\n当前回复
        text = `> ${parentContent.replace(/\n/g, '\n> ')}\n\n${text}`
      }
    }

    // 5. 发送到系统网关
    const sessionKey = this.getInternalSessionKey(chatId, threadId)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)
    if (!sessionInfo) return

    // 获取当前语言环境 (飞书暂无明确 language_code, 默认为 zh)
    const lang = 'zh'
    this.sessionRegistry.set(sessionKey, { chatId, lang })

    this.logger.debug(
      `[Feishu] Message from ${chatId} (agent: ${sessionInfo.agentId}): "${text.slice(0, 30)}..."`
    )

    try {
      await this.sendToGateway(sessionInfo.agentId, sessionKey, text, chatId, lang)
    } catch (err) {
      this.logger.error(`[Feishu] 发送网关失败:`, (err as Error).message)
      await this.sendPlatformMessage(chatId, `Error: ${(err as Error).message}`)
    }
  }

  /**
   * 获取飞书单条消息的内容并解析为文本
   */
  private async getPlatformMessage(messageId: string): Promise<string | undefined> {
    if (!this.client_sdk) return undefined
    try {
      // 飞书 API: 获取单条消息内容
      const res = await this.client_sdk.im.message.get({
        path: { message_id: messageId }
      })

      if (res.code === 0 && res.data?.items?.[0]) {
        const msg = res.data.items[0]
        return this.parseMessageContent(msg as any)
      }
    } catch (err) {
      this.logger.warn(`[Feishu] 获取消息内容失败 (ID: ${messageId}): ${(err as Error).message}`)
    }
    return undefined
  }

  private parseMessageContent(message: any): string {
    try {
      // 兼容事件结构 (message_type/content) 和 API 结构 (msg_type/body.content)
      const type = message.message_type || message.msg_type
      const rawContent = message.content || message.body?.content

      if (!rawContent) return ''

      const content = JSON.parse(rawContent)
      if (type === 'post') {
        return content.title || content.content?.[0]?.[0]?.text || ''
      }
      return content.text || ''
    } catch (err) {
      const type = message.message_type || message.msg_type
      const rawContent = message.content || message.body?.content
      return type === 'text' ? rawContent : ''
    }
  }

  private checkBotMentioned(event: FeishuMessageEvent): boolean {
    if (!this.botOpenId) return false
    return (event.message.mentions || []).some((m) => m.id.open_id === this.botOpenId)
  }

  private stripBotMention(text: string, mentions?: any[]): string {
    if (!mentions || !this.botOpenId) return text
    let result = text
    for (const m of mentions) {
      if (m.id.open_id === this.botOpenId) {
        result = result.replace(new RegExp(this.escapeRegExp(m.key), 'g'), '').trim()
        if (this.botName) {
          result = result.replace(new RegExp(`@${this.escapeRegExp(this.botName)}`, 'g'), '').trim()
        }
      }
    }
    return result
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  protected decorateMessage(text: string, _isFinal: boolean): string {
    return text
  }

  /**
   * 针对飞书平台的特殊格式转换
   * 飞书卡片的 markdown 标签不支持标题 (# ## 等)，将其转换为加粗
   */
  protected mdToFormat(text: string, format: 'markdown' | 'html' = 'html'): string {
    if (format === 'markdown') {
      // 飞书不支持 Markdown 标题，替换为加粗
      let processed = text.replace(/\r\n/g, '\n')
      processed = processed.replace(/^(#{1,6})\s+(.+)$/gm, '**$2**')
      return processed
    }
    return super.mdToFormat(text, format)
  }
}

/**
 * 飞书卡片 JSON 构建器
 */
class FeishuCardBuilder {
  /**
   * 构建基础文本内容卡片 (支持 Markdown)
   */
  static buildTextContent(text: string): string {
    return JSON.stringify({
      config: { wide_screen_mode: true, update_multi: true },
      elements: [{ tag: 'markdown', content: text || ' ' }]
    })
  }

  /**
   * 构建交互选择卡片
   */
  static buildInteractionCard(opts: {
    title: string
    prompt: string
    options: string[]
    interactionId?: string
    preText?: string
  }): string {
    const elements: any[] = []

    // 如果有之前的文本内容，先作为背景展示
    if (opts.preText && opts.preText.trim()) {
      elements.push({ tag: 'markdown', content: opts.preText })
      // 增加一个分割线，区分正文和交互区
      elements.push({ tag: 'hr' })
    }

    elements.push({ tag: 'markdown', content: opts.prompt })
    elements.push({
      tag: 'action',
      actions: opts.options.map((opt, idx) => ({
        tag: 'button',
        text: { tag: 'plain_text', content: opt },
        type: idx === 0 ? 'primary' : 'default',
        value: { action: 'interaction', id: opts.interactionId, result: idx.toString() }
      }))
    })

    return JSON.stringify({
      config: { wide_screen_mode: true, update_multi: true },
      header: {
        title: { tag: 'plain_text', content: opts.title },
        template: 'blue'
      },
      elements
    })
  }

  /**
   * 构建交互结果展示卡片
   */
  static buildInteractionResultCard(opts: {
    title: string
    prompt?: string
    result?: string
    resultLabel?: string
    isSuccess: boolean
  }): string {
    const elements: any[] = []

    if (opts.prompt) {
      elements.push({
        tag: 'markdown',
        content: opts.prompt
      })
    }

    if (opts.result) {
      if (elements.length > 0) elements.push({ tag: 'hr' })
      elements.push({
        tag: 'markdown',
        content: `**${opts.resultLabel || 'Result'}**: ${opts.result}`
      })
    } else if (elements.length === 0) {
      elements.push({
        tag: 'markdown',
        content: 'Operation completed'
      })
    }

    return JSON.stringify({
      config: { wide_screen_mode: true, update_multi: true },
      header: {
        title: { tag: 'plain_text', content: opts.title },
        template: opts.isSuccess ? 'green' : 'grey'
      },
      elements
    })
  }
}
