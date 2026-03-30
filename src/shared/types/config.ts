import { AIModelConfig } from './models'
import { LogLevel } from './logger'

/**
 * 网关配置项
 */
export interface GatewaySettings {
  port: number
  token?: string
  logLevel?: LogLevel
}

/**
 * 全局应用配置
 */
export interface AppConfig {
  models: AIModelConfig[]
  gateway: GatewaySettings
  defaultModelId?: string
  rememberedChoices?: Record<string, boolean>
}
