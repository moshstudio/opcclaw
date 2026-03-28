import { toast } from 'sonner'
import i18n from '@renderer/i18n'
import { BaseGatewayClient } from '@shared/services/gateway-client-core'
import {
  type HelloOk,
  type GatewayClientOptions,
  type ChatPayload,
  type AgentEventPayload,
  type ModelsPayload,
  type TickPayload,
  type ShutdownPayload,
  type HeartbeatEventPayload,
  type NoticePayload,
  type GatewayMethod
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
    } catch (err: any) {
      console.error(`[RendererGatewayClient] Request failed: ${method}`, err)
      this.handleError(err, `${i18n.t('operation_failed')}: ${method}`)
      throw err
    }
  }

  /**
   * 统一错误处理
   */
  private handleError(err: any, context: string) {
    const message = err?.message || String(err)
    // 使用 sonner 的 id 特性，同样的错误消息在短时间内只显示一个
    const errorId = `gateway-error-${message}`

    toast.error(context, {
      description: message,
      id: errorId
    })
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
  /**
   * 领域特定事件订阅 - 聊天 (对齐 chat 频道)
   */
  onChat(callback: (payload: ChatPayload) => void) {
    return this.onChannel('chat', callback)
  }

  /**
   * 领域特定事件订阅 - 智能体状态 (对齐 agent 频道)
   */
  onAgent(callback: (payload: AgentEventPayload) => void) {
    return this.onChannel('agent', callback)
  }

  /**
   * 领域特定事件订阅 - 业务通知 (对齐 notice 频道)
   */
  onNotice(callback: (payload: NoticePayload) => void) {
    return this.onChannel('notice', callback)
  }

  /**
   * 领域特定事件订阅 - 会话状态 (对齐 session 频道)
   */
  onSession(callback: (payload: AgentEventPayload) => void) {
    return this.onChannel('session', callback)
  }

  /**
   * 领域特定事件订阅 - 模型列表 (对齐 models 频道)
   */
  onModels(callback: (payload: ModelsPayload) => void) {
    return this.onChannel('models', callback)
  }

  /**
   * 领域特定事件订阅 - 系统心跳 (对齐 tick 频道)
   */
  onTick(callback: (payload: TickPayload) => void) {
    return this.onChannel('system:tick', callback)
  }

  /**
   * 领域特定事件订阅 - 停机预警 (对齐 shutdown 频道)
   */
  onShutdown(callback: (payload: ShutdownPayload) => void) {
    return this.onChannel('system:shutdown', callback)
  }

  /**
   * 领域特定事件订阅 - 心跳任务 (对齐 heartbeat 频道)
   */
  onHeartbeat(callback: (payload: HeartbeatEventPayload) => void) {
    return this.onChannel('heartbeat', callback)
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
