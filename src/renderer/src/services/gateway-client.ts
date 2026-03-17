import { BaseGatewayClient } from '@shared/services/gateway-client-core'
import { type HelloOk, type EventFrame, type GatewayClientOptions } from '@shared/types/gateway'

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

  protected createSocket(url: string): any {
    return new window.WebSocket(url)
  }

  /**
   * 确保已连接
   */
  async ensureConnected(): Promise<HelloOk> {
    // 检查 socket 状态 (1 为 OPEN)
    if (this.ws && (this.ws as WebSocket).readyState === 1) {
      return { protocol: '1.0', methods: [], events: [], policy: {} } as any
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
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureConnected()
    return super.request(method, params)
  }

  /**
   * 重写连接逻辑：连接前先从主进程获取最新配置
   */
  async connect(): Promise<HelloOk> {
    try {
      // 1. 从主进程拉取最新配置 (确保端口和 Token 是最新的)
      const config = await window.api.config.get()
      if (config?.gateway) {
        this.opts.url = `ws://localhost:${config.gateway.port || 18789}`
        this.opts.token = config.gateway.token
      }
    } catch (err) {
      console.warn(
        '[RendererGatewayClient] Failed to fetch latest config from main, using defaults.'
      )
    }

    // 2. 执行真正的连接逻辑
    return await super.connect()
  }
}

/**
 * 获取渲染进程单例客户端
 */
let client: RendererGatewayClient | null = null

export function getGatewayClient(onEvent?: (evt: EventFrame) => void): RendererGatewayClient {
  if (!client) {
    client = new RendererGatewayClient({ onEvent })
  } else if (onEvent) {
    client.setEventCallback(onEvent)
  }
  return client
}
