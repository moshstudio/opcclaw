import { toast } from 'sonner'
import i18n from '@renderer/i18n'
import { BaseGatewayClient } from '@shared/services/gateway-client-core'
import {
  type HelloOk,
  type GatewayClientOptions,
  type ChatPayload,
  type EventPayload,
  type GatewayMethod,
  type AgentEventPayload,
  type NoticePayload,
  type HeartbeatEventPayload
} from '@shared/types/gateway'

/**
 * 渲染进程 Gateway 客户端 (直接连接)
 *
 * 继承自 BaseGatewayClient，底层使用浏览器原生 WebSocket
 */
export class RendererGatewayClient extends BaseGatewayClient {
  constructor(opts: Partial<GatewayClientOptions> = {}) {
    // 初始 URL 和 Token 先设为空，connect 时会从主进程拉取最新配置
    super({
      url: opts.url ?? 'ws://localhost:18781',
      token: opts.token,
      ...opts
    })
  }

  private connectPromise: Promise<HelloOk> | null = null

  protected createSocket(url: string): WebSocket {
    return new window.WebSocket(url)
  }

  /**
   * 确保已连接
   */
  async ensureConnected(): Promise<HelloOk> {
    // 检查 socket 状态 (1 为 OPEN)
    if (this.ws && (this.ws as WebSocket).readyState === 1) {
      return {
        protocol: 1,
        methods: [],
        events: [],
        policy: { tickIntervalMs: 30000, maxPayloadBytes: 524288 }
      }
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.connect()
    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  /**
   * 重写请求逻辑，增加自动连接和错误提示
   */
  async request<T = unknown>(method: GatewayMethod, params?: unknown): Promise<T> {
    try {
      await this.ensureConnected()
      return await super.request(method, params)
    } catch (err: unknown) {
      const e = err as Error
      console.error(`[RendererGatewayClient] Request failed: ${method}`, e)
      this.handleError(e, `${i18n.t('operation_failed')}: ${method}`)
      throw err
    }
  }

  /**
   * 统一错误处理
   */
  private handleError(err: Error, context: string) {
    const message = err?.message || String(err)
    const errorId = `gateway-error-${message}`
    toast.error(context, { description: message, id: errorId })
  }

  /**
   * 重写连接逻辑：连接前先从主进程获取最新配置
   */
  async connect(): Promise<HelloOk> {
    try {
      // 1. 从主进程拉取网关连接凭据 (代替拉取整个配置文件)
      const info = await window.api.gateway.info()
      if (info) {
        this.opts.url = `ws://localhost:${info.port}`
        this.opts.token = info.token
      }
    } catch (err) {
      console.warn(
        '[RendererGatewayClient] Failed to fetch latest config from main, using defaults.'
      )
    }

    // 2. 执行真正的连接逻辑
    return await super.connect()
  }
  /** 聊天流事件（接收所有 chat:* 事件）*/
  onChat(callback: (payload: ChatPayload) => void) {
    return this.onAction('chat', callback)
  }

  /** 智能体生命周期事件（接收所有 agent:* 事件）*/
  onAgent(callback: (payload: AgentEventPayload) => void) {
    return this.onAction('agent', callback)
  }

  /** 业务通知事件（接收所有 notice:* 事件）*/
  onNotice(callback: (payload: NoticePayload) => void) {
    return this.onAction('notice', callback)
  }

  /** 会话事件（接收所有 session:* 事件）*/
  onSession(callback: (payload: AgentEventPayload) => void) {
    return this.onAction('session', callback)
  }

  /** 心跳 tick 事件 */
  onTick(callback: (payload: EventPayload<'system:tick'>) => void) {
    return this.onAction('system:tick', callback)
  }

  /** 停机事件 */
  onShutdown(callback: (payload: EventPayload<'system:shutdown'>) => void) {
    return this.onAction('system:shutdown', callback)
  }

  /** 心跳任务事件（接收所有 heartbeat:* 事件） */
  onHeartbeat(callback: (payload: HeartbeatEventPayload) => void) {
    return this.onAction('heartbeat', callback)
  }
}

/**
 * 获取渲染进程单例客户端
 */
let client: RendererGatewayClient | null = null

export function getGatewayClient(): RendererGatewayClient {
  if (!client) {
    client = new RendererGatewayClient()
  }
  return client
}
