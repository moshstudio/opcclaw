import { Bot } from 'grammy'
import { Logger } from '@main/services/common/logger'
import { ConfigService } from '../config/config-service'
import { TelegramChannel } from './telegram/index'
import { FeishuChannel } from './feishu'
import { ProxyUtils } from '@main/services/common/proxy'
import { GatewayManager } from '../gateway/manager'
import type {
  TelegramValidationResult,
  TelegramBotInfo,
  TelegramChannelConfig,
  FeishuChannelConfig,
  AppConfig
} from '@shared/types/config'

export { TelegramValidationResult, TelegramBotInfo }

export class ChannelManager {
  private static instance: ChannelManager
  private logger = new Logger('[ChannelMgr]')

  // 记录运行中的频道实例
  private runningTgBots = new Map<string, { instance: TelegramChannel; fingerPrint: string }>()
  private runningFeishuApps = new Map<string, { instance: FeishuChannel; fingerPrint: string }>()

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): ChannelManager {
    if (!ChannelManager.instance) {
      ChannelManager.instance = new ChannelManager()
    }
    return ChannelManager.instance
  }

  /**
   * 启动所有启用的外部频道 (支持智能增量启动)
   */
  async startAll() {
    const config = ConfigService.getInstance().getConfig()
    const { channels, gateway } = config
    const gatewayUrl = `ws://localhost:${gateway.port}`
    const gatewayToken = gateway.token

    const startTasks: Promise<void>[] = []

    // 1. 处理 Telegram 频道
    if (channels?.telegram && Array.isArray(channels.telegram)) {
      this.syncTelegramChannels(channels.telegram, config, gatewayUrl, gatewayToken, startTasks)
    } else {
      await this.stopAllTelegram()
    }

    // 2. 处理 Feishu 频道
    if (channels?.feishu && Array.isArray(channels.feishu)) {
      this.syncFeishuChannels(channels.feishu, config, gatewayUrl, gatewayToken, startTasks)
    } else {
      await this.stopAllFeishu()
    }

    // 等待所有启动任务完成
    if (startTasks.length > 0) {
      this.logger.info(`Parallel starting ${startTasks.length} channel instances...`)
      await Promise.allSettled(startTasks)
    }

    this.logger.info(
      `Active channels: TG(${this.runningTgBots.size}), Feishu(${this.runningFeishuApps.size})`
    )
  }

  private syncTelegramChannels(
    tgConfigs: TelegramChannelConfig[],
    config: AppConfig,
    gatewayUrl: string,
    gatewayToken: string | undefined,
    startTasks: Promise<void>[]
  ) {
    for (const botConfig of tgConfigs) {
      const resolvedProxy = botConfig.useProxy ? config.proxy : undefined
      const fingerPrint = JSON.stringify({
        enabled: botConfig.enabled,
        botToken: botConfig.botToken,
        useProxy: botConfig.useProxy,
        resolvedProxy,
        defaultAgentId: botConfig.defaultAgentId,
        agentBindings: botConfig.agentBindings,
        gatewayUrl,
        gatewayToken
      })

      const running = this.runningTgBots.get(botConfig.botToken)

      if (botConfig.enabled && botConfig.botToken) {
        if (running && running.fingerPrint === fingerPrint) continue
        if (running) {
          this.logger.info(`Restarting TG bot: ${botConfig.botToken.slice(0, 8)}...`)
          running.instance.stop()
        }

        const startTask = (async () => {
          try {
            const instance = new TelegramChannel({
              botToken: botConfig.botToken,
              proxy: resolvedProxy,
              defaultAgentId: botConfig.defaultAgentId,
              agentBindings: botConfig.agentBindings,
              gatewayUrl,
              gatewayToken,
              onBindingChange: (newBindings) =>
                this.updateBotBindings(botConfig.botToken, newBindings)
            })
            await instance.start()
            this.runningTgBots.set(botConfig.botToken, { instance, fingerPrint })
          } catch (err) {
            this.logger.error(`Failed to start TG Bot:`, (err as Error).message)
          }
        })()
        startTasks.push(startTask)
      } else if (!botConfig.enabled && running) {
        running.instance.stop()
        this.runningTgBots.delete(botConfig.botToken)
      }
    }

    const currentTokens = new Set(tgConfigs.map((b) => b.botToken))
    for (const [token, running] of this.runningTgBots.entries()) {
      if (!currentTokens.has(token)) {
        running.instance.stop()
        this.runningTgBots.delete(token)
      }
    }
  }

  private syncFeishuChannels(
    feishuConfigs: FeishuChannelConfig[],
    _config: AppConfig,
    gatewayUrl: string,
    gatewayToken: string | undefined,
    startTasks: Promise<void>[]
  ) {
    for (const appConfig of feishuConfigs) {
      const fingerPrint = JSON.stringify({
        enabled: appConfig.enabled,
        appId: appConfig.appId,
        appSecret: appConfig.appSecret,
        verificationToken: appConfig.verificationToken,
        encryptKey: appConfig.encryptKey,
        defaultAgentId: appConfig.defaultAgentId,
        agentBindings: appConfig.agentBindings,
        gatewayUrl,
        gatewayToken
      })

      const running = this.runningFeishuApps.get(appConfig.appId)

      if (appConfig.enabled && appConfig.appId && appConfig.appSecret) {
        if (running && running.fingerPrint === fingerPrint) continue
        if (running) {
          this.logger.info(`Restarting Feishu app: ${appConfig.appId}...`)
          running.instance.stop()
        }

        const startTask = (async () => {
          try {
            const instance = new FeishuChannel({
              ...appConfig,
              gatewayUrl,
              gatewayToken,
              onBindingChange: (newBindings) =>
                this.updateFeishuBindings(appConfig.appId, newBindings)
            })
            await instance.start()
            this.runningFeishuApps.set(appConfig.appId, { instance, fingerPrint })
          } catch (err) {
            this.logger.error(
              `Failed to start Feishu App (${appConfig.appId}):`,
              (err as Error).message
            )
          }
        })()
        startTasks.push(startTask)
      } else if (!appConfig.enabled && running) {
        running.instance.stop()
        this.runningFeishuApps.delete(appConfig.appId)
      }
    }

    const currentAppIds = new Set(feishuConfigs.map((b) => b.appId))
    for (const [appId, running] of this.runningFeishuApps.entries()) {
      if (!currentAppIds.has(appId)) {
        running.instance.stop()
        this.runningFeishuApps.delete(appId)
      }
    }
  }

  private async stopAllTelegram() {
    for (const running of this.runningTgBots.values()) {
      await running.instance.stop()
    }
    this.runningTgBots.clear()
  }

  private async stopAllFeishu() {
    for (const running of this.runningFeishuApps.values()) {
      await running.instance.stop()
    }
    this.runningFeishuApps.clear()
  }

  async stopAll() {
    await Promise.all([this.stopAllTelegram(), this.stopAllFeishu()])
    this.logger.info('All channels stopped')
  }

  async onLanguageChanged(lang: string) {
    const p1 = Array.from(this.runningTgBots.values()).map((b) =>
      b.instance.onLanguageChanged(lang)
    )
    const p2 = Array.from(this.runningFeishuApps.values()).map((b) =>
      b.instance.onLanguageChanged(lang)
    )
    await Promise.allSettled([...p1, ...p2])
    this.logger.info(`All channels notified about language change to: ${lang}`)
  }

  async restart() {
    await this.startAll()
  }

  private updateBotBindings(botToken: string, bindings: Record<string, string>) {
    this.updateChannelBindings('telegram', botToken, bindings)
  }

  private updateFeishuBindings(appId: string, bindings: Record<string, string>) {
    this.updateChannelBindings('feishu', appId, bindings)
  }

  private updateChannelBindings(
    type: 'telegram' | 'feishu',
    key: string,
    bindings: Record<string, string>
  ) {
    const configService = ConfigService.getInstance()
    const currentConfig = configService.getConfig()
    const channelList = currentConfig.channels?.[type]

    if (!channelList) return

    const keyField = type === 'telegram' ? 'botToken' : 'appId'
    const newList = channelList.map((item) => {
      if (item[keyField] === key) {
        return { ...item, agentBindings: bindings }
      }
      return item
    })

    const runningMap = type === 'telegram' ? this.runningTgBots : this.runningFeishuApps
    const running = runningMap.get(key)
    if (running) {
      const { gateway } = currentConfig
      const rawPrint = JSON.parse(running.fingerPrint)
      rawPrint.agentBindings = bindings
      rawPrint.gatewayUrl = `ws://localhost:${gateway.port}`
      rawPrint.gatewayToken = gateway.token
      running.fingerPrint = JSON.stringify(rawPrint)
    }

    configService.saveConfig({
      channels: {
        ...currentConfig.channels,
        [type]: newList
      }
    })
    this.logger.info(`Updated bindings for ${type}:${key.slice(0, 8)}... (Persisted)`)

    // 通知所有网关客户端配置已保存 (触发 UI 刷新)
    GatewayManager.getInstance().dispatch({
      type: 'config:saved',
      path: configService.getRootPath()
    })
  }

  async validateTelegramBot(token: string, useProxy?: boolean): Promise<TelegramValidationResult> {
    if (!token) throw new Error('Token is required')

    const globalProxy = ConfigService.getInstance().getConfig().proxy
    const proxy = useProxy ? globalProxy : undefined

    this.logger.info(`Validating Bot Token: ${token.slice(0, 8)}... (Proxy: ${proxy || 'none'})`)

    const clientConfig = {
      baseFetchConfig: ProxyUtils.getBaseFetchConfig(proxy)
    }

    const bot = new Bot(token, { client: clientConfig })

    try {
      await bot.init()
      const { id, username, first_name } = bot.botInfo

      this.logger.info(`Validation successful: @${username}`)
      return {
        ok: true,
        info: { id, username, firstName: first_name }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Validation failed for ${token.slice(0, 8)}...:`, errorMsg)
      return {
        ok: false,
        error: errorMsg
      }
    }
  }
}
