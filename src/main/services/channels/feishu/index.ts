/**
 * Feishu 频道实现
 * 参考 OpenClaw Feishu 扩展实现
 */

import * as Lark from '@larksuiteoapi/node-sdk'
import type { ChatPayloadFlat } from '../../gateway/protocol'
import { CHANNEL_ID } from './constants'
import { FeishuChannelOptions, FeishuMessageEvent } from './types'
import { BaseChannel } from '../base'
import { getTranslate, parseSessionKey } from '../base/utils'

export class FeishuChannel extends BaseChannel<FeishuChannelOptions> {
  private client_sdk?: Lark.Client
  private ws_client?: Lark.WSClient

  constructor(opts: FeishuChannelOptions) {
    super(opts, CHANNEL_ID)
    this.maxMessageLength = 30000 // 飞书支持较长的文本消息，但建议分段或使用富文本
  }

  // ============== 生命周期实现 ==============

  protected async setupPlatform(): Promise<void> {
    const { appId, appSecret } = this.opts

    try {
      // 1. 初始化 HTTP 客户端
      this.client_sdk = new Lark.Client({
        appId,
        appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: Lark.Domain.Feishu
      })

      // 2. 初始化 WebSocket 客户端处理事件
      this.ws_client = new Lark.WSClient({
        appId,
        appSecret,
        domain: Lark.Domain.Feishu,
        loggerLevel: Lark.LoggerLevel.info
      })

      const eventDispatcher = new Lark.EventDispatcher({
        encryptKey: this.opts.encryptKey,
        verificationToken: this.opts.verificationToken
      })

      // 注册消息接收与卡片交互处理器
      eventDispatcher.register({
        'im.message.receive_v1': async (data) => {
          const event = data as FeishuMessageEvent
          await this.onMessageReceived(event)
        },
        'card.action.trigger': async (data) => {
          const action = (data as any).action
          if (action?.value?.action === 'interaction') {
            const { id: interactionId, result: resultRaw } = action.value
            const chatId = (data as any).context?.open_chat_id || (data as any).context?.open_id
            if (!chatId) return

            const sessionKey = this.getInternalSessionKey(chatId)
            const sessionInfo = parseSessionKey(sessionKey, this.channelId)

            // 从注册表还原选项文本
            const record = this.interactionMessages.get(interactionId)
            let result = [String(resultRaw)] // 降级

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
            } catch (err) {
              this.logger.error('Failed to respond to Feishu interaction:', err)
            }
          }
        }
      })

      this.ws_client.start({ eventDispatcher })
      this.logger.info(`飞书应用 ${appId} 事件订阅(长连接)已启动`)
    } catch (err) {
      this.logger.error('飞书初始化失败:', (err as Error).message)
    }
  }

  protected async teardownPlatform(): Promise<void> {
    // 飞书 SDK 暂时没有显式的 stop 方法用于 WSClient，通常是销毁实例
    this.ws_client = undefined
  }

  // ============== BaseChannel 抽象方法实现 ==============

  protected async sendPlatformMessage(
    chatId: string | number,
    text: string
  ): Promise<string | number> {
    if (!this.client_sdk) throw new Error('Feishu client not initialized')

    // 识别接收者类型
    const receiveIdType = String(chatId).startsWith('oc_') ? 'chat_id' : 'open_id'

    try {
      const res = await this.client_sdk.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: String(chatId),
          msg_type: 'text',
          content: JSON.stringify({ text })
        }
      })

      if (res.code !== 0) {
        throw new Error(`Feishu API Error [${res.code}]: ${res.msg}`)
      }

      return res.data!.message_id!
    } catch (err) {
      this.logger.error('发送飞书消息失败:', (err as Error).message)
      throw err
    }
  }

  protected async editPlatformMessage(
    _chatId: string | number,
    messageId: string | number,
    text: string
  ): Promise<void> {
    if (!this.client_sdk) return

    try {
      // 飞书的编辑消息 API (如果是文本消息，通常是更新 content)
      // 注意：飞书的“编辑”可能需要消息处于特定状态或使用特定 API
      // 这里使用更新消息内容 API
      const res = await this.client_sdk.im.message.patch({
        path: { message_id: String(messageId) },
        data: {
          content: JSON.stringify({ text })
        }
      })

      if (res.code !== 0 && res.code !== 230020) {
        // 230020 可能表示内容未变化
        this.logger.warn(`编辑飞书消息失败 [${res.code}]: ${res.msg}`)
      }
    } catch (err) {
      this.logger.warn('编辑飞书消息异常:', (err as Error).message)
    }
  }

  protected async startTyping(chatId: string | number): Promise<void> {
    // 飞书原生不支持“正在输入”状态的 API，除非使用 Reaction 模拟
    // 这里暂时不做处理
    this.logger.debug(`Start typing in Feishu chat: ${chatId}`)
  }

  protected async stopTyping(_chatId: string | number): Promise<void> {
    // skip
  }

  protected async replyToCommand(
    chatId: string | number,
    text: string,
    _options?: { parseMode?: 'Markdown' }
  ): Promise<void> {
    // 飞书默认支持部分 Markdown 语法在富文本或卡片中，普通文本则不支持
    await this.sendFullMessage(chatId, text)
  }

  protected async sendPlatformInteraction(
    chatId: string | number,
    p: ChatPayloadFlat,
    lang?: string
  ): Promise<string | number | undefined> {
    if (!this.client_sdk) return undefined
    const t = getTranslate(lang)

    const interactionId = p.interactionId
    const prompt = p.prompt || 'Confirm operation?'
    const options = p.options || ['Confirm', 'Cancel']
    const receiveIdType = String(chatId).startsWith('oc_') ? 'chat_id' : 'open_id'

    // 构建飞书交互卡片
    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: t('common:channel_base.interaction_title')
        }
      },
      elements: [
        { tag: 'div', text: { tag: 'plain_text', content: prompt } },
        {
          tag: 'action',
          actions: options.map((opt, idx) => ({
            tag: 'button',
            text: { tag: 'plain_text', content: opt },
            type: idx === 0 ? 'primary' : 'default',
            value: { action: 'interaction', id: interactionId, result: idx.toString() }
          }))
        }
      ]
    }

    try {
      const res = await this.client_sdk.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: String(chatId),
          msg_type: 'interactive',
          content: JSON.stringify(card)
        }
      })
      return res.data?.message_id
    } catch (err) {
      this.logger.error('发送飞书交互卡片失败:', err)
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
    this.logger.debug(`Updating Feishu interaction in chat ${chatId}`)
    const t = getTranslate(lang)
    const firstRes = p.result?.[0] || ''
    const isSuccess = firstRes === 'true' || firstRes === '0'

    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: t('common:channel_base.interaction_completed') },
        template: isSuccess ? 'green' : 'red'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'plain_text',
            content: `${isSuccess ? '✅' : '❌'} ${p.prompt || 'Operation completed'}`
          }
        }
      ]
    }

    try {
      await this.client_sdk.im.message.patch({
        path: { message_id: String(messageId) },
        data: {
          content: JSON.stringify(card)
        }
      })
    } catch (err) {
      // ignore
    }
  }

  private async onMessageReceived(event: FeishuMessageEvent): Promise<void> {
    const { message, sender } = event
    const chatId = message.chat_id
    const openId = sender.sender_id.open_id
    if (!openId) return

    // 获取纯文本内容
    let text = ''
    try {
      const content = JSON.parse(message.content)
      text = content.text || ''
    } catch {
      return
    }

    text = text.trim()
    if (!text) return

    // 1. 指令解析
    const handled = await this.tryProcessCommand(text, chatId)
    if (handled) return

    // 2. 构造会话并发送到网关
    const sessionKey = this.getInternalSessionKey(chatId)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)
    if (!sessionInfo) return

    this.sessionRegistry.set(sessionKey, { chatId })

    this.logger.debug(`[Feishu] Input from ${chatId}: "${text.slice(0, 30)}..."`)

    try {
      await this.sendToGateway(sessionInfo.agentId, sessionKey, text)
    } catch (err) {
      this.logger.error(`[Feishu] 网关发送失败:`, (err as Error).message)
      await this.sendPlatformMessage(chatId, `Error: ${(err as Error).message}`)
    }
  }

  protected decorateMessage(text: string, isFinal: boolean): string {
    if (!text) return text
    return isFinal ? text : `${text} |`
  }
}
