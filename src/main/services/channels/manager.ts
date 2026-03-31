import { Bot } from 'grammy'
import { Logger } from '@main/services/common/logger'
import { ConfigService } from '../config/config-service'
import { TelegramChannel } from './telegram'
import { ProxyUtils } from '@main/services/common/proxy'
import type { TelegramValidationResult, TelegramBotInfo } from '@shared/types/config'

export { TelegramValidationResult, TelegramBotInfo }

export class ChannelManager {
  private static instance: ChannelManager
  private logger = new Logger('[ChannelMgr]')

  // 记录当前正在运行的机器人实例：Map<botToken, { instance: TelegramChannel, config: string }>
  // 使用 config 的 JSON 字符串作为指纹，判断是否需要重启
  private runningTgBots = new Map<string, { instance: TelegramChannel; fingerPrint: string }>()

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

    if (!channels || !channels.telegram || !Array.isArray(channels.telegram)) {
      return
    }

    const gatewayUrl = `ws://localhost:${gateway.port}`
    const gatewayToken = gateway.token

    const startTasks: Promise<void>[] = []

    for (const botConfig of channels.telegram) {
      // 生成当前配置的指纹 (排除不影响运行的字段，如果业务需要可以全量)
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

      // 情况 1: 机器人已启用
      if (botConfig.enabled && botConfig.botToken) {
        // 如果已经在运行且指纹一致，跳过
        if (running && running.fingerPrint === fingerPrint) {
          continue
        }

        // 如果已经在运行但指纹不一致，并行的停止逻辑不建议，先确保停止旧的
        if (running) {
          this.logger.info(
            `Config changed for bot ${botConfig.botToken.slice(0, 8)}..., restarting...`
          )
          await running.instance.stop()
        }

        // 启动新实例 (封装成任务并行执行)
        const startBotTask = (async () => {
          try {
            const botProxy = botConfig.useProxy ? config.proxy : undefined
            const instance = new TelegramChannel({
              botToken: botConfig.botToken,
              proxy: botProxy,
              defaultAgentId: botConfig.defaultAgentId,
              agentBindings: botConfig.agentBindings,
              gatewayUrl,
              gatewayToken,
              onBindingChange: (newBindings) => {
                this.updateBotBindings(botConfig.botToken, newBindings)
              }
            })
            await instance.start()
            this.runningTgBots.set(botConfig.botToken, { instance, fingerPrint })
          } catch (err) {
            this.logger.error(
              `Failed to start Telegram Bot (${botConfig.botToken.slice(0, 8)}...):`,
              err
            )
          }
        })()
        startTasks.push(startBotTask)
      }
      // 情况 2: 机器人未启用但正在运行，需停止
      else if (!botConfig.enabled && running) {
        this.logger.info(`Bot disabled: ${botConfig.botToken.slice(0, 8)}..., stopping...`)
        await running.instance.stop()
        this.runningTgBots.delete(botConfig.botToken)
      }
    }

    // 处理那些在配置中直接被删除的机器人
    const currentTokens = new Set(channels.telegram.map((b) => b.botToken))
    for (const [token, running] of this.runningTgBots.entries()) {
      if (!currentTokens.has(token)) {
        this.logger.info(`Bot removed from config: ${token.slice(0, 8)}..., stopping...`)
        await running.instance.stop()
        this.runningTgBots.delete(token)
      }
    }

    // 等待所有启动任务完成 (不阻塞主线程显示，但在 startAll 返回前完成)
    if (startTasks.length > 0) {
      this.logger.info(`Starting ${startTasks.length} Telegram instances in parallel...`)
      await Promise.allSettled(startTasks)
    }

    this.logger.info(`Active Telegram instances: ${this.runningTgBots.size}`)
  }

  /**
   * 停止所有频道
   */
  async stopAll() {
    for (const [token, running] of this.runningTgBots.entries()) {
      await running.instance.stop()
    }
    this.runningTgBots.clear()
    this.logger.info('All channels stopped')
  }

  /**
   * 重启所有频道
   * 现在的 startAll 已经具备智能差量逻辑，所以直接调用即可实现无感更新
   */
  async restart() {
    await this.startAll()
  }

  /**
   * 更新并持久化绑定关系 (此操作不应触发 Bot 重启，故需额外处理指纹)
   */
  private updateBotBindings(botToken: string, bindings: Record<string, string>) {
    const configService = ConfigService.getInstance()
    const currentConfig = configService.getConfig()

    if (!currentConfig.channels?.telegram) return

    const newTelegramList = currentConfig.channels.telegram.map((bot) => {
      if (bot.botToken === botToken) {
        return { ...bot, agentBindings: bindings }
      }
      return bot
    })

    // 更新本地运行状态的指纹，防止由于持久化导致的“配置变化”误触发重启
    const running = this.runningTgBots.get(botToken)
    if (running) {
      const { gateway } = currentConfig
      running.fingerPrint = JSON.stringify({
        enabled: true,
        botToken,
        agentBindings: bindings,
        gatewayUrl: `ws://localhost:${gateway.port}`,
        gatewayToken: gateway.token
      })
    }

    configService.saveConfig({
      channels: {
        ...currentConfig.channels,
        telegram: newTelegramList
      }
    })
    this.logger.info(`Updated bindings for bot: ${botToken.slice(0, 8)}... (Persisted)`)
  }

  /**
   * 验证 Telegram Bot Token 是否有效
   */
  async validateTelegramBot(token: string, useProxy?: boolean): Promise<TelegramValidationResult> {
    if (!token) throw new Error('Token is required')

    const globalProxy = ConfigService.getInstance().getConfig().proxy
    const proxy = useProxy ? globalProxy : undefined

    this.logger.info(`Validating Bot Token: ${token.slice(0, 8)}... (Proxy: ${proxy || 'none'})`)

    // 获取代理配置并初始化 Bot
    const clientConfig = {
      baseFetchConfig: ProxyUtils.getBaseFetchConfig(proxy)
    }

    const bot = new Bot(token, { client: clientConfig })

    try {
      // 这里的 init() 会去请求 getMe，如果 token 错误会直接报错
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
