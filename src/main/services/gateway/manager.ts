import { startGatewayServer, type GatewayServer } from './server'
import { GatewayClient } from './client'
import { ConfigService } from '@main/services/config/config-service'
import { AgentRegistry } from '@main/services/agent/registry'
import { Logger, LogLevel, setGlobalLogLevel } from '@main/services/common/logger'
import type { TaggedEvent } from '@shared/types/gateway'

export class GatewayManager {
  private static instance: GatewayManager
  private server?: GatewayServer
  private client?: GatewayClient
  private logger = new Logger('[GatewayMgr]')

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
  public async start(logLevel: LogLevel): Promise<void> {
    const configService = ConfigService.getInstance()
    const appConfig = configService.getConfig()
    const gwSettings = appConfig.gateway

    // 0. 设置全局日志级别
    setGlobalLogLevel(logLevel)

    // 1. 初始化并加载所有智能体
    const registry = AgentRegistry.getInstance()
    await registry.loadAllAgents()

    // 2. 启动 Server
    this.server = await startGatewayServer({
      registry,
      port: gwSettings.port,
      token: gwSettings.token,
      logLevel
    })

    this.logger.info(`Server started on port ${this.server.port}`)

    // 3. 创建主进程内部客户端用于 IPC 桥接
    this.client = new GatewayClient({
      url: `ws://localhost:${this.server.port}`,
      token: gwSettings.token,
      autoReconnect: true
    })

    try {
      await this.client.connect()
      this.logger.info('Local client connected')
    } catch (err) {
      this.logger.error('Failed to connect local client:', err)
    }
  }

  /**
   * 重启服务（用于由于配置更改触发的刷新）
   */
  public async restart(): Promise<void> {
    this.logger.info('Restarting services...')
    this.stop()
    const config = ConfigService.getInstance().getConfig()
    await this.start(config.gateway.logLevel || 'info')
  }

  /**
   * 停止所有服务
   */
  public stop(): void {
    this.client?.close()
    this.server?.close()
    this.client = undefined
    this.server = undefined
    this.logger.info('Services stopped')
  }

  public getClient(): GatewayClient | undefined {
    return this.client
  }

  /**
   * 向所有连接的网关客户端广播事件
   */
  public dispatch(evt: TaggedEvent): void {
    if (this.server) {
      this.server.dispatch(evt)
    } else {
      this.logger.warn('Cannot dispatch: Gateway server not running')
    }
  }
}
