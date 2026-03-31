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
 * Telegram 频道配置
 */
export interface TelegramChannelConfig {
  enabled: boolean
  botToken: string
  useProxy?: boolean // 是否使用全局代理
  defaultAgentId?: string // 默认响应的智能体
  agentBindings?: Record<string, string> // 动态绑定关系: chatId_threadId -> agentId
}

/**
 * 频道全量配置
 */
export interface ChannelsConfig {
  telegram?: TelegramChannelConfig[] // 支持多个 Telegram Bot
}

/**
 * 全局应用配置
 */
export interface AppConfig {
  models: AIModelConfig[]
  gateway: GatewaySettings
  defaultModelId?: string
  proxy?: string // 全局默认代理 (e.g. http://127.0.0.1:7890)
  channels?: ChannelsConfig // 新增频道配置
  rememberedChoices?: Record<string, boolean>
}

/**
 * Telegram 机器人信息 (验证结果)
 */
export interface TelegramBotInfo {
  id: number
  username: string
  firstName: string
}

/**
 * Telegram 验证响应
 */
export interface TelegramValidationResult {
  ok: boolean
  info?: TelegramBotInfo
  error?: string
}
