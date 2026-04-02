import { ConfigService } from '../../config/config-service'
import { Logger } from '../../common/logger'
import { ToolContext, InteractionResult } from '@shared/types/agent'

const logger = new Logger('ConfirmProvider')

/**
 * 交互确认任务描述
 */
export interface ConfirmTask {
  /** 持久化索引 */
  key: string
  /** 提示文案 */
  prompt: string
  /** 备选项 */
  options?: string[]
}

/**
 * 交互确认中心 (Unified Confirmation Flow)
 *
 * 职责：
 * 1. 维护所有的确认 Key 和文案模板 (Registry)
 * 2. 核心逻辑：记忆检查 -> 异步交互 -> 记忆保存 (State Machine)
 */
export class ConfirmProvider {
  /**
   * 确认是否安装运行环境
   */
  public static async confirmInstallEnv(ctx: ToolContext, env: string): Promise<boolean> {
    const res = await this.run(ctx, {
      key: `env:install:${env}`,
      prompt: `检测到本地未安装 ${env} 环境，是否现在尝试安装？（安装过程可能需要管理员权限且耗时较长）`,
      options: ['立即安装', '取消执行']
    })
    // 判定逻辑：严格匹配第一个选项原文
    return res[0] === '立即安装'
  }

  /**
   * 确认是否开启 Host 模式浏览器
   */
  public static async confirmOpenHostBrowser(ctx: ToolContext): Promise<boolean> {
    const res = await this.run(ctx, {
      key: 'browser:host:launch',
      prompt: `[Host 模式] 将开启一个持久化浏览器（保存登录态）。由于安全限制，请在首次打开时手动登录。准备好了吗？`,
      options: ['立即启动', '取消']
    })
    // 判定逻辑：严格匹配第一个选项原文
    return res[0] === '立即启动'
  }

  /**
   * 统一执行器
   * 直接在 Provider 层完成 [检查 -> 交互 -> 保存] 全过程
   *
   * @param ctx 工具上下文 (需包含真正的交互实现 confirmUI)
   * @param task 任务描述
   */
  public static async run(ctx: ToolContext, task: ConfirmTask): Promise<InteractionResult> {
    // 1. 记忆拦截：如果已经记住过，直接走自动化
    const config = ConfigService.getInstance().getConfig()
    const remembered = config.rememberedChoices?.[task.key]
    if (remembered !== undefined) {
      logger.info(`[Auto-Confirm] Bypassing UI for ${task.key}: ${remembered.result}`)
      return remembered.result
    }

    // 2. 交互下发：调用底层的 UI 确认 (此函数应由 Agent 提供，仅负责单纯的弹窗交互)
    if (!ctx.confirmUI) {
      logger.warn(`Confirm requested for ${task.key} but ctx.confirmUI is not available.`)
      const fallback = task.options?.[0] || 'Confirmed'
      return [fallback]
    }

    const { result, remember } = await ctx.confirmUI(task.prompt, task.options, task.key)

    // 3. 记忆保存：如果勾选了记住，则持久化
    if (remember) {
      const service = ConfigService.getInstance()
      const cfg = service.getConfig()
      const rememberedChoices = {
        ...(cfg.rememberedChoices || {}),
        [task.key]: {
          result,
          description: task.prompt,
          timestamp: Date.now()
        }
      }
      service.saveConfig({ rememberedChoices })
      logger.info(`[Remember] Choice saved for ${task.key} = ${result}`)
    }

    return result
  }
}
