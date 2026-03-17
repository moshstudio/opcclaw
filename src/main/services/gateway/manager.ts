import { Agent } from '@main/services/agent/agent'
import { startGatewayServer, type GatewayServer } from './server.js'
import { GatewayClient } from './client.js'
import { ConfigService } from '@main/services/config/config-service.js'
import { initIpcServices } from '@main/ipc'

export class GatewayManager {
  private static instance: GatewayManager
  private server?: GatewayServer
  private client?: GatewayClient

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): GatewayManager {
    if (!GatewayManager.instance) {
      GatewayManager.instance = new GatewayManager()
    }
    return GatewayManager.instance
  }

  /**
   * 启动 Gateway 服务和主进程客户端
   */
  public async start(): Promise<void> {
    const configService = ConfigService.getInstance()
    const appConfig = configService.getConfig()
    const gwSettings = appConfig.gateway
    const modelConfig = configService.getModel(gwSettings.selectedModelId ?? '')

    if (!modelConfig || !modelConfig.apiKey) {
      console.warn(
        '[GatewayManager] No valid AI model configured. Gateway may not function properly.'
      )
    }

    // 1. 初始化 Agent
    const agent = new Agent({
      apiKey: modelConfig?.apiKey ?? '',
      provider: modelConfig?.provider ?? 'anthropic',
      model: modelConfig?.model,
      baseUrl: modelConfig?.baseUrl,
      supportsVision: modelConfig?.supportsVision,
      agentId: 'main'
    })

    // 2. 启动 Server
    this.server = await startGatewayServer({
      agent,
      port: gwSettings.port,
      token: gwSettings.token
    })

    console.log(`[GatewayManager] Server started on port ${this.server.port}`)

    // 3. 创建主进程内部客户端用于 IPC 桥接
    this.client = new GatewayClient({
      url: `ws://localhost:${this.server.port}`,
      token: gwSettings.token,
      autoReconnect: true
    })

    try {
      await this.client.connect()
      console.log('[GatewayManager] Local client connected')

      // 4. 初始化 IPC 服务
      initIpcServices()
    } catch (err) {
      console.error('[GatewayManager] Failed to connect local client:', err)
    }
  }

  /**
   * 重启服务（用于由于配置更改触发的刷新）
   */
  public async restart(): Promise<void> {
    console.log('[GatewayManager] Restarting services...')
    this.stop()
    await this.start()
  }

  /**
   * 停止所有服务
   */
  public stop(): void {
    this.client?.close()
    this.server?.close()
    this.client = undefined
    this.server = undefined
    console.log('[GatewayManager] Services stopped')
  }

  public getClient(): GatewayClient | undefined {
    return this.client
  }
}
