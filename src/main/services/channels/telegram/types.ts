import { BaseChannelOptions } from '../base/types'

/** Telegram 频道私有配置 */
export interface TelegramChannelOptions extends BaseChannelOptions {
  /** 机器人的 API 令牌 */
  botToken: string
  /** 代理配置 (可选) */
  proxy?: string
}
