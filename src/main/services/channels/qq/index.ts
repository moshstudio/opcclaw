import WebSocket from 'ws'
import { CHANNEL_ID, MAX_MESSAGE_LENGTH, TYPING_REFRESH_MS } from './constants'
import { QQApi } from './api'
import { QQChannelOptions, QQMessageMeta, QQRun } from './types'
import { BaseChannel } from '../base'
import { CommonRun, QueueTask } from '../base/types'
import { parseSessionKey, SessionKeyInfo } from '../base/utils'
import type { ChatPayloadFlat } from '../../gateway/protocol'

export class QQChannel extends BaseChannel<QQChannelOptions> {
  private readonly api: QQApi
  private ws: WebSocket | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private sessionId: string | null = null
  private lastSeq: number | null = null
  private isStopped = false

  constructor(opts: QQChannelOptions) {
    super(opts, CHANNEL_ID)
    this.maxMessageLength = MAX_MESSAGE_LENGTH
    this.api = new QQApi(opts.appId, opts.clientSecret)
  }

  /** 关键：暂存来自用户的原始消息元数据，用于在异步 run-start 阶段进行关联 */
  private pendingMetadata = new Map<string, QQMessageMeta>()

  // ============== 生命周期实现 ==============

  protected async setupPlatform(): Promise<void> {
    this.isStopped = false
    this.logger.info(`Starting QQ Bot for AppID: ${this.opts.appId}`)
    await this.connectWebSocket()
  }

  protected async teardownPlatform(): Promise<void> {
    this.isStopped = true
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // ============== WebSocket 处理 ==============

  private async connectWebSocket(): Promise<void> {
    if (this.isStopped) return
    try {
      const url = await this.api.getGatewayUrl()
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        this.logger.info('WebSocket connected to QQ Gateway')
      })

      this.ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString())
          this.handleWsPayload(payload)
        } catch (err: any) {
          this.logger.error('Failed to parse WebSocket message:', err.message)
        }
      })

      this.ws.on('error', (err) => {
        this.logger.error('WebSocket Error:', err.message)
      })

      this.ws.on('close', (code, reason) => {
        this.logger.warn(`WebSocket closed: ${code} ${reason}`)
        this.stopHeartbeat()
        if (!this.isStopped) {
          setTimeout(() => this.connectWebSocket(), 5000)
        }
      })
    } catch (err: any) {
      this.logger.error('Failed to connect to QQ Gateway:', err.message)
      if (!this.isStopped) {
        setTimeout(() => this.connectWebSocket(), 10000)
      }
    }
  }

  private handleWsPayload(payload: any): void {
    const { op, s, t, d } = payload
    if (s !== undefined && s !== null) this.lastSeq = s

    switch (op) {
      case 10: // Hello
        this.startHeartbeat(d.heartbeat_interval)
        this.identify()
        break
      case 11: // Heartbeat ACK
        break
      case 0: // Dispatch
        this.handleEvent(t, d)
        break
      case 9: // Invalid Session
        this.logger.error('Invalid Session, re-identifying...')
        this.identify()
        break
      case 1: // Heartbeat Request
        this.sendHeartbeat()
        break
    }
  }

  private startHeartbeat(interval: number): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), interval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private sendHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.lastSeq }))
    }
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // intents: 基础 + 频道 + 私信 + 群聊/C2C + 交互
    const INTENTS = (1 << 0) | (1 << 30) | (1 << 12) | (1 << 25) | (1 << 26)

    this.api.getAccessToken().then((token) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: `QQBot ${token}`,
              intents: INTENTS,
              shard: [0, 1],
              properties: {
                $os: process.platform,
                $browser: 'opcclaw',
                $device: 'server'
              }
            }
          })
        )
      }
    })
  }

  private handleEvent(type: string, data: any): void {
    switch (type) {
      case 'READY':
        this.sessionId = data.session_id
        this.logger.info(`QQ Bot is READY. Session: ${this.sessionId}`)
        break
      case 'C2C_MESSAGE_CREATE':
      case 'FRIEND_MESSAGE_CREATE':
        this.onC2CMessage(data)
        break
      case 'GROUP_AT_MESSAGE_CREATE':
      case 'GROUP_MESSAGE_CREATE':
        this.onGroupMessage(data)
        break
      case 'AT_MESSAGE_CREATE':
      case 'PUBLIC_GUILD_MESSAGES':
        this.onChannelMessage(data)
        break
      case 'DIRECT_MESSAGE_CREATE':
        this.onDirectMessage(data)
        break
    }
  }

  // ============== 消息事件处理 ==============

  private async onC2CMessage(data: any): Promise<void> {
    const { content, author, id: msgId } = data
    if (!content || !author?.user_openid) return
    await this.processIncoming(content.trim(), author.user_openid, { msgId, type: 'c2c' })
  }

  private async onGroupMessage(data: any): Promise<void> {
    const { content, group_openid, id: msgId } = data
    if (!content || !group_openid) return
    await this.processIncoming(content.trim(), group_openid, { msgId, type: 'group' })
  }

  private async onChannelMessage(data: any): Promise<void> {
    const { content, channel_id, id: msgId } = data
    if (!content || !channel_id) return
    await this.processIncoming(content.trim(), channel_id, { msgId, type: 'channel' })
  }

  private async onDirectMessage(data: any): Promise<void> {
    const { content, guild_id, id: msgId } = data
    if (!content || !guild_id) return
    await this.processIncoming(content.trim(), guild_id, { msgId, type: 'dm' })
  }

  private async processIncoming(text: string, chatId: string, meta: QQMessageMeta): Promise<void> {
    const handled = await this.tryProcessCommand(text, chatId)
    if (handled) return

    const sessionKey = this.getInternalSessionKey(chatId)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)
    if (!sessionInfo) return

    try {
      this.pendingMetadata.set(chatId, meta)
      await this.sendToGateway(sessionInfo.agentId, sessionKey, text, chatId)
    } catch (err) {
      this.logger.error(`[Input] Gateway reachable failed:`, err)
    }
  }

  // ============== BaseChannel 抽象实现 ==============

  protected async handleQueueTask(run: CommonRun, task: QueueTask): Promise<void> {
    const { type, text } = task

    if (type === 'text') {
      // QQ 不支持消息编辑，因此不进行流式推送，仅在生成完成 (isFinal) 后发送完整消息
      if (!run.isFinal) return

      const data = text || ''
      if (data.trim()) {
        await this.sendPlatformMessage(run.chatId.toString(), data)
      }
    } else if (type === 'interaction') {
      await this.sendPlatformInteraction(run.chatId.toString(), task.payload)
    }
  }

  /**
   * 重写 handleChatStart 以确保 meta 正确关联
   */
  protected async handleChatStart(
    p: ChatPayloadFlat,
    chatId: string | number,
    sessionInfo: SessionKeyInfo | null,
    lang?: string
  ): Promise<void> {
    // 1. 调用父类逻辑创建 Run
    await super.handleChatStart(p, chatId, sessionInfo, lang)

    // 2. 从暂存区提取并关联 meta (msgId)
    const run = this.activeRuns.get(p.runId!) as QQRun | undefined
    const meta = this.pendingMetadata.get(chatId.toString())
    if (run && meta) {
      run.meta = meta
      this.pendingMetadata.delete(chatId.toString())
      this.logger.debug(`[Queue] Attached meta to run ${p.runId}`)
    }
  }

  protected async sendPlatformMessage(chatId: string, text: string): Promise<string> {
    const run = Array.from(this.activeRuns.values()).find((r) => r.chatId === chatId) as
      | QQRun
      | undefined
    const meta = run?.meta
    const msgType = meta?.type || 'c2c'
    const replyMsgId = meta?.msgId

    try {
      let res: any
      if (msgType === 'group') {
        res = await this.api.sendGroupMessage(chatId, text, replyMsgId, this.opts.markdownSupport)
      } else if (msgType === 'channel' || msgType === 'dm') {
        res = await this.api.sendChannelMessage(chatId, text, replyMsgId)
      } else {
        res = await this.api.sendC2CMessage(chatId, text, replyMsgId, this.opts.markdownSupport)
      }
      return res.id || ''
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error('Failed to get access token:', msg)
      throw err
    }
  }

  protected async editPlatformMessage(
    _chatId: string | number,
    _messageId: string | number,
    _text: string
  ): Promise<void> {
    // QQ 不支持简单的消息编辑，此处不做操作或发送新消息 (若有需求可扩展)
    this.logger.debug('QQ Bot does not support message editing.')
  }

  protected async sendPlatformInteraction(
    chatId: string | number,
    p: ChatPayloadFlat,
    _lang?: string
  ): Promise<string | number | undefined> {
    // QQ 频道按钮权限极严，暂时仅以文本形式提示
    const prompt = p.prompt || 'Please confirm the action.'
    await this.sendPlatformMessage(chatId.toString(), `[Interaction] ${prompt}`)
    return undefined
  }

  protected async updatePlatformInteraction(
    _chatId: string | number,
    _messageId: string | number,
    _p: ChatPayloadFlat
  ): Promise<void> {
    // Pass
  }

  protected async startTyping(chatId: string | number): Promise<void> {
    const run = Array.from(this.activeRuns.values()).find((r) => r.chatId === chatId) as
      | QQRun
      | undefined
    const msgType = run?.meta?.type || 'c2c'
    const replyMsgId = run?.meta?.msgId

    // 重要：若没有有效的回复 ID (msgId)，则不发送输入提醒，否则会被识别为主动消息而限频 (22009)
    if (!replyMsgId) return

    if (msgType === 'c2c') {
      const send = () => this.api.sendC2CInputNotify(chatId.toString(), replyMsgId).catch(() => {})
      send()
      this.typingTimers.set(chatId, setInterval(send, TYPING_REFRESH_MS))
    }
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
    _options?: { parseMode?: 'Markdown' }
  ): Promise<void> {
    await this.sendPlatformMessage(chatId.toString(), text)
  }

  protected getPlatformHelp(): string {
    return 'QQ Bot 支持 C2C、群聊及频道消息。请确保机器人已获得相应 API 权限。'
  }
}
