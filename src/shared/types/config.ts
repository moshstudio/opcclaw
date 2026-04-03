import { AIModelConfig } from './models'
import { LogLevel } from './logger'
import { InteractionResult } from './agent'

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
  id?: string // 唯一标识
  createdAt?: number // 创建时间戳
  enabled: boolean
  botToken: string
  useProxy?: boolean // 是否使用全局代理
  defaultAgentId?: string // 默认响应的智能体
  agentBindings?: Record<string, string> // 动态绑定关系: chatId_threadId -> agentId
}

/**
 * 飞书 频道配置
 */
export interface FeishuChannelConfig {
  id?: string
  createdAt?: number
  enabled: boolean
  appId: string
  appSecret: string
  verificationToken?: string
  encryptKey?: string
  defaultAgentId?: string
  agentBindings?: Record<string, string>
}

/**
 * QQ 频道配置
 */
export interface QQChannelConfig {
  id?: string
  createdAt?: number
  enabled: boolean
  appId: string
  clientSecret: string
  token?: string
  isPublic?: boolean // 是否为公域机器人 (影响消息展示策略)
  markdownSupport?: boolean
  defaultAgentId?: string
  agentBindings?: Record<string, string>
}

/**
 * 频道全量配置
 */
export interface ChannelsConfig {
  telegram?: TelegramChannelConfig[] // 支持多个 Telegram Bot
  feishu?: FeishuChannelConfig[] // 支持多个 飞书 应用
  qq?: QQChannelConfig[] // 支持多个 QQ 机器人
}

export interface AgentDefaults {
  temperature: number
  maxTokens: number
  topP: number
  capabilities: {
    webSearch: boolean
    codeExecution: boolean
    vision: boolean
  }
}

/**
 * 已记住的交互选择
 */
export interface RememberedChoice {
  result: InteractionResult
  description: string
  timestamp: number
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
  rememberedChoices?: Record<string, RememberedChoice>
  language?: string // 应用语言设置 (zh/en)
  theme?: 'dark' | 'light' | 'system'
  fontSize?: number
  interactionTimeout?: number // 交互超时时长 (秒)
  agentDefaults?: AgentDefaults
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

/**
 * 飞书 机器人信息 (验证结果)
 */
export interface FeishuBotInfo {
  openId: string
  botName: string
}

/**
 * 飞书 验证响应
 */
export interface FeishuValidationResult {
  ok: boolean
  info?: FeishuBotInfo
  error?: string
}

/**
 * QQ 机器人信息 (验证结果)
 */
export interface QQBotInfo {
  id: string
  username: string
}

/**
 * QQ 验证响应
 */
export interface QQValidationResult {
  ok: boolean
  info?: QQBotInfo
  error?: string
}
