import { BaseGatewayClient } from '@shared/services/gateway-client-core'
import {
  type HelloOk,
  type GatewayClientOptions,
  type ChatPayload,
  type AgentEventPayload,
  type ModelsPayload,
  type TickPayload,
  type ShutdownPayload,
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
      url: opts.url ?? 'ws://localhost:18789',
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
   * 重写请求逻辑，增加自动连接
   */
  async request<T = unknown>(method: GatewayMethod, params?: unknown): Promise<T> {
    await this.ensureConnected()
    return super.request(method, params)
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
    return this.addEventListener((evt) => {
      if (evt.event === 'chat') callback(evt.payload as ChatPayload)
    })
  }

  /**
   * 领域特定事件订阅 - 智能体状态 (对齐 agent 频道)
   */
  onAgent(callback: (payload: AgentEventPayload) => void) {
    return this.addEventListener((evt) => {
      if (evt.event === 'agent') callback(evt.payload as AgentEventPayload)
    })
  }

  /**
   * 领域特定事件订阅 - 模型列表 (对齐 models 频道)
   */
  onModels(callback: (payload: ModelsPayload) => void) {
    return this.addEventListener((evt) => {
      if (evt.event === 'models') callback(evt.payload as ModelsPayload)
    })
  }

  /**
   * 领域特定事件订阅 - 系统心跳 (对齐 tick 频道)
   */
  onTick(callback: (payload: TickPayload) => void) {
    return this.addEventListener((evt) => {
      if (evt.event === 'tick') callback(evt.payload as TickPayload)
    })
  }

  /**
   * 领域特定事件订阅 - 停机预警 (对齐 shutdown 频道)
   */
  onShutdown(callback: (payload: ShutdownPayload) => void) {
    return this.addEventListener((evt) => {
      if (evt.event === 'shutdown') callback(evt.payload as ShutdownPayload)
    })
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
