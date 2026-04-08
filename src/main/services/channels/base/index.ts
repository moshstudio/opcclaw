/**
 * 频道基类
 * 封装了网关连接、流式响应处理、会话管理等通用逻辑
 */

import { GatewayClient } from '../../gateway/client'
import type { EventFrame, ChatPayloadFlat } from '../../gateway/protocol'
import { Logger } from '@main/services/common/logger'
import {
  BaseChannelOptions,
  CommonRun,
  QueueTask,
  CommonSessionContext,
  InteractionRecord,
  AgentListResponse,
  HealthResponse,
  Agent
} from './types'
import {
  parseSessionKey,
  extractText,
  getTranslate,
  truncate,
  getSessionKey,
  SessionKeyInfo
} from './utils'

export abstract class BaseChannel<TOptions extends BaseChannelOptions> {
  protected readonly client: GatewayClient
  protected readonly logger: Logger
  protected readonly opts: TOptions
  protected readonly channelId: string

  /** 平台特定的消息长度限制 (子类可覆盖) */
  protected maxMessageLength: number = 4096

  /** 获取间隔 (任务队列轮询间隔) (子类可覆盖) */
  protected queueInterval: number = 1000

  /** 状态追踪 */
  protected readonly activeRuns = new Map<string, CommonRun>()
  protected readonly typingTimers = new Map<string | number, NodeJS.Timeout>()
  protected readonly sessionRegistry = new Map<string, CommonSessionContext>()
  protected readonly agentBindings = new Map<string, string>()
  protected readonly interactionMessages = new Map<string, InteractionRecord>()

  constructor(opts: TOptions, channelId: string) {
    this.opts = opts
    this.channelId = channelId
    this.logger = new Logger(`${channelId}:${this.constructor.name}`)

    if (opts.agentBindings) {
      Object.entries(opts.agentBindings).forEach(([k, v]) => this.agentBindings.set(k, v))
    }

    this.client = new GatewayClient({
      url: opts.gatewayUrl || 'ws://localhost:18781',
      token: opts.gatewayToken,
      onEvent: (evt) => this.handleGatewayEvent(evt),
      onConnect: (hello) => this.logger.info(`[Gateway] 已连接 (v${hello.protocol})`)
    })
  }

  // ============== 生命周期管理 ==============

  async start(): Promise<void> {
    this.client.connect().catch((err) => this.logger.error('网关连接失败:', err))
    await this.setupPlatform()
  }

  async stop(): Promise<void> {
    this.typingTimers.forEach(clearInterval)
    this.typingTimers.clear()
    try {
      await this.teardownPlatform()
    } catch (err) {
      this.logger.warn('Platform teardown failed:', (err as Error).message)
    }
    this.client.close()
    this.logger.info(`${this.channelId} 频道已停止`)
  }

  protected abstract setupPlatform(): Promise<void> | void
  protected abstract teardownPlatform(): Promise<void> | void

  // ============== 任务分发中枢 (生产者) ==============

  /**
   * 处理网关分发的原始事件流
   */
  protected async handleGatewayEvent(evt: EventFrame): Promise<void> {
    if (evt.type !== 'event') return

    const eventName = evt.event
    const isChannelEvent =
      eventName.startsWith('chat:') ||
      eventName.startsWith('agent:run-') ||
      eventName.startsWith('agent:skill-') ||
      eventName === 'agent:context-overflow'

    if (!isChannelEvent) return

    const payload = evt.payload as ChatPayloadFlat
    const sessionInfo = parseSessionKey(payload.sessionKey!, this.channelId)

    if (!sessionInfo) return

    const run = this.activeRuns.get(payload.runId!)
    const context = this.sessionRegistry.get(payload.sessionKey!)
    const chatId = sessionInfo.chatId
    const lang = run?.lang ?? context?.lang

    // 状态路由分发
    switch (eventName) {
      case 'agent:run-start':
        await this.handleChatStart(payload, chatId, sessionInfo, lang)
        break

      case 'chat:start':
      case 'chat:thinking':
      case 'chat:delta':
      case 'chat:toolCall':
      case 'chat:toolResult':
      case 'chat:interaction':
      case 'chat:interaction-responded':
        if (run) this.pushTaskToQueue(run, eventName, payload)
        break

      case 'chat:final':
        await this.handleChatFinal(payload, chatId, run)
        break

      case 'agent:run-end':
        await this.handleRunEnd(payload, chatId, run)
        break

      case 'chat:error':
      case 'agent:run-error':
      case 'agent:context-overflow':
        await this.handleChatError(payload, chatId, run)
        break
    }
  }

  /**
   * 将解析后的网关事件转化为具体的 QueueTask 推入队列
   */
  protected pushTaskToQueue(run: CommonRun, event: string, p: ChatPayloadFlat): void {
    const task: any = { type: 'text' }

    switch (event) {
      case 'chat:start':
        return
      case 'chat:delta':
        task.text = p.delta
        break
      case 'chat:toolCall':
        task.text = this.formatToolExecution('call', p)
        break
      case 'chat:toolResult':
        task.text = this.formatToolExecution('result', p)
        break
      case 'chat:final':
        task.type = 'text-fix'
        task.text = extractText(p.message)
        break
      case 'agent:run-end':
        task.type = 'run-end'
        break
      case 'chat:error':
      case 'agent:run-error':
      case 'agent:context-overflow':
        task.type = 'error'
        task.payload = p
        break
      case 'chat:interaction':
        task.type = 'interaction'
        task.payload = p
        break
      case 'chat:interaction-responded':
        task.type = 'interaction-responded'
        task.payload = p
        break
      default:
        return
    }

    run.taskQueue.push(task)

    // 确保消费者循环已启动
    if (!run.isUpdating) {
      this.scheduleUpdate(run).catch((err) => this.logger.error(`[Base] Consumer loop crash:`, err))
    }
  }

  // ============== 核心处理逻辑 (消费者) ==============

  /**
   * 任务消费者循环：根据设定的节流间隔同步队列内容到物理平台
   */
  protected async scheduleUpdate(run: CommonRun, isForceFinal = false): Promise<void> {
    if (isForceFinal) run.isFinal = true
    if (run.isUpdating) return
    run.isUpdating = true

    try {
      while (true) {
        // --- 1. 任务批处理：快速消费队列中的连续非阻塞状态 ---
        while (run.taskQueue.length > 0) {
          const nextTask = run.taskQueue[0]
          // 遇到交互任务，必须先停止批处理，确保文本同步后再发送交互
          if (nextTask.type === 'interaction' || nextTask.type === 'interaction-responded') {
            break
          }

          const task = run.taskQueue.shift()!

          if (task.type === 'text' && task.text) {
            run.accumulatedText += task.text
          } else if (task.type === 'text-fix' && task.text) {
            if (task.text.length > run.accumulatedText.length) {
              run.accumulatedText = task.text
            }
          } else if (task.type === 'run-end') {
            run.isFinal = true
          } else if (task.type === 'error') {
            const t = getTranslate(run.lang)
            const errorMsg = `\n\n❌ ${t('channel_base:error', { error: task.payload?.error ?? 'unknown' })}`
            run.accumulatedText += errorMsg
            run.isFinal = true
          }
        }

        // --- 2. 交互任务特殊处理：确保在处理交互前文本已全部同步 ---
        const interactionTask = run.taskQueue[0]
        if (
          interactionTask &&
          (interactionTask.type === 'interaction' ||
            interactionTask.type === 'interaction-responded')
        ) {
          // 先将之前积累的文本发送出去
          await this.syncAccumulatedText(run)

          // 取出并执行该交互类任务
          const task = run.taskQueue.shift()!

          await this.handleQueueTask(run, task)

          // 交互后通常需要一些响应时间，防止后续任务冲突
          await new Promise((r) => setTimeout(r, this.queueInterval))
          continue
        }

        // --- 3. 节流检查与物理分发 ---
        const textToSent = run.accumulatedText || ''
        const decorated = this.decorateMessage(textToSent, !!run.isFinal)
        const truncated = truncate(decorated, this.maxMessageLength)

        const needsSync =
          truncated !== run.lastSentDecoratedText || (run.isFinal && !run.lastSentText)

        if (needsSync) {
          await this.waitForThrottle(run, !!run.isFinal)

          // 处理超长文本分页
          if (decorated.length > this.maxMessageLength && !run.isFinal) {
            const handled = await this.handleStreamPagination(run, textToSent)
            if (handled) continue
          }

          // 调用平台实现进行物理更新
          await this.handleQueueTask(run, { type: 'text', text: truncated })
          run.lastSentText = textToSent
          run.lastSentDecoratedText = truncated
          run.lastUpdateAt = Date.now()
        }

        // 退出逻辑：队列清空 且 标记结束 且 物理同步完成
        if (
          run.taskQueue.length === 0 &&
          run.isFinal &&
          (run.accumulatedText === run.lastSentText || truncated === run.lastSentDecoratedText)
        ) {
          break
        }

        // 队列为空时的休眠保持轮训节奏
        if (run.taskQueue.length === 0 && !run.isFinal) {
          await new Promise((r) => setTimeout(r, this.queueInterval))
        }
      }
    } finally {
      run.isUpdating = false
      this.stopTyping(run.chatId)

      // 彻底完成后清理 Run 对象
      if (run.isFinal && run.taskQueue.length === 0 && run.agentRunId) {
        const runId = run.agentRunId
        setTimeout(() => this.activeRuns.delete(runId), 2000)
      }
    }
  }

  /**
   * 辅助同步累积文本到平台 (增加节流支持)
   */
  private async syncAccumulatedText(run: CommonRun): Promise<void> {
    const textToSent = run.accumulatedText || ''
    const decorated = this.decorateMessage(textToSent, !!run.isFinal)
    const truncated = truncate(decorated, this.maxMessageLength)

    if (truncated === run.lastSentDecoratedText) return

    // 交互前的同步也必须遵守节流
    await this.waitForThrottle(run, !!run.isFinal)

    // 处理超长分页
    if (decorated.length > this.maxMessageLength && !run.isFinal) {
      await this.handleStreamPagination(run, textToSent)
      return
    }

    await this.handleQueueTask(run, { type: 'text', text: truncated })
    run.lastSentText = textToSent
    run.lastSentDecoratedText = truncated
    run.lastUpdateAt = Date.now()
  }

  /**
   * 等待节流限制
   */
  private async waitForThrottle(run: CommonRun, isFinal: boolean): Promise<void> {
    const now = Date.now()
    const elapsed = now - run.lastUpdateAt
    const minGap = isFinal ? 100 : this.queueInterval

    if (elapsed < minGap) {
      await new Promise((r) => setTimeout(r, minGap - elapsed))
    }
  }

  // ============== 事件处理器 (Entry Points) ==============

  protected async handleChatStart(
    p: ChatPayloadFlat,
    chatId: string | number,
    sessionInfo?: SessionKeyInfo | null,
    lang?: string
  ): Promise<void> {
    await this.startTyping(chatId)
    let run = this.activeRuns.get(p.runId!)

    if (run) {
      if (p.runId) run.agentRunId = p.runId
      return
    }

    run = {
      chatId,
      threadId: sessionInfo?.threadId,
      accumulatedText: '',
      taskQueue: [],
      lastUpdateAt: 0,
      lastSentText: '',
      lastSentDecoratedText: '',
      lang,
      agentRunId: p.runId,
      isUpdating: false,
      isFinal: false
    }
    this.activeRuns.set(p.runId!, run!)
    this.scheduleUpdate(run!).catch((err) => this.logger.error(`[Base] Run loop crash:`, err))
  }

  protected async handleChatFinal(
    p: ChatPayloadFlat,
    chatId: string | number,
    run?: CommonRun
  ): Promise<void> {
    if (run) {
      this.pushTaskToQueue(run, 'chat:final', p)
    } else {
      const finalText = extractText(p.message) || ''
      if (finalText.trim()) await this.sendFullMessage(chatId, finalText)
    }
  }

  protected async handleRunEnd(
    p: ChatPayloadFlat,
    chatId: string | number,
    run?: CommonRun
  ): Promise<void> {
    if (run) {
      this.pushTaskToQueue(run, 'agent:run-end', p)
    } else {
      this.stopTyping(chatId)
      const finalText = extractText(p.message) || ''
      if (finalText.trim()) await this.sendFullMessage(chatId, finalText)
    }
  }

  protected async handleChatError(
    p: ChatPayloadFlat,
    chatId: string | number,
    run?: CommonRun
  ): Promise<void> {
    if (run) {
      this.pushTaskToQueue(run, 'chat:error', p)
    } else {
      this.stopTyping(chatId)
      const t = getTranslate(undefined)
      const errorMsg = `\n\n❌ ${t('channel_base:error', { error: p.error ?? 'unknown' })}`
      await this.sendPlatformMessage(chatId, errorMsg).catch(() => {})
    }
  }

  // ============== 分页与同步辅助 ==============

  private async handleStreamPagination(run: CommonRun, fullText: string): Promise<boolean> {
    const safeLimit = this.maxMessageLength - 8
    const finalPart = fullText.slice(0, safeLimit)

    await this.finalizeMessage(run, finalPart)

    run.accumulatedText = fullText.slice(finalPart.length)
    run.lastSentText = ''
    run.lastSentDecoratedText = ''
    delete run.channelMessageId

    await new Promise((r) => setTimeout(r, 600))
    return true
  }

  private async finalizeMessage(run: CommonRun, overrideText?: string): Promise<void> {
    if (!run.channelMessageId) return
    const text = overrideText ?? run.accumulatedText
    if (run.lastSentDecoratedText === text) return

    await this.editPlatformMessage(run.chatId, run.channelMessageId, text).catch(() => {})
    run.lastSentText = text
    run.lastSentDecoratedText = text
  }

  // ============== 子类平台实现占位 (Abstracts) ==============

  protected abstract handleQueueTask(run: CommonRun, task: QueueTask): Promise<void>
  protected abstract sendPlatformMessage(
    chatId: string | number,
    text: string
  ): Promise<string | number>
  protected abstract editPlatformMessage(
    chatId: string | number,
    messageId: string | number,
    text: string
  ): Promise<void>
  protected abstract sendPlatformInteraction(
    chatId: string | number,
    p: ChatPayloadFlat,
    lang?: string,
    threadId?: string | number,
    messageId?: string | number
  ): Promise<string | number | undefined>
  protected abstract updatePlatformInteraction(
    chatId: string | number,
    messageId: string | number,
    p: ChatPayloadFlat,
    lang?: string
  ): Promise<void>
  protected abstract startTyping(chatId: string | number): Promise<void> | void
  protected abstract stopTyping(chatId: string | number): Promise<void> | void

  // ============== 修饰钩子 ==============

  protected decorateMessage(text: string, _isFinal: boolean): string {
    return text
  }

  /**
   * 格式化工具执行详情 (名称、参数、结果) - 极简合并模式
   */
  protected formatToolExecution(type: 'call' | 'result', p: ChatPayloadFlat): string {
    const toolName = p.toolName || 'unknown'
    const content = type === 'call' ? p.arguments : p.content
    const isError = p.isError || false

    let detail = ''
    if (content !== undefined && content !== null) {
      try {
        // 统一处理为单行展示，避免 JSON 换行或内容换行撑开行高
        detail = typeof content === 'string' ? content.replace(/\n/g, ' ') : JSON.stringify(content)
      } catch {
        detail = String(content)
      }
    }

    // 截断阈值
    const maxLen = 100
    if (detail.length > maxLen) {
      detail = detail.slice(0, maxLen) + '...'
    }

    if (type === 'call') {
      // 采用【图标 工具名 + 换行 + 块状代码】格式
      return `\n**🔧 ${toolName}**:\n\`\`\`\n${detail}\n\`\`\`\n`
    } else {
      // 结果阶段：采用【图标 Result + 换行 + 块状代码】格式
      const icon = isError ? '❌' : '✅'
      const t = getTranslate(undefined)
      const label = t('channel_base:tool_result_label')
      return `\n${icon} **${label}**:\n\`\`\`\n${detail}\n\`\`\`\n`
    }
  }

  // ============== 辅助工具方法 (Internal/Protected) ==============

  protected registerSession(chatId: string | number, sessionKey: string, lang?: string): void {
    this.sessionRegistry.set(sessionKey, { chatId, lang })
  }

  protected async sendFullMessage(chatId: string | number, text: string): Promise<void> {
    if (!text) return
    let remaining = text
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, this.maxMessageLength)
      remaining = remaining.slice(this.maxMessageLength)
      await this.sendPlatformMessage(chatId, chunk)
    }
  }

  protected getInternalSessionKey(chatId: number | string, threadId?: string | number): string {
    return getSessionKey(
      chatId,
      this.channelId,
      this.agentBindings,
      this.opts.defaultAgentId || 'main',
      threadId
    )
  }

  protected async sendToGateway(
    agentId: string,
    sessionKey: string,
    message: string,
    chatId: string | number,
    lang?: string
  ): Promise<void> {
    this.registerSession(chatId, sessionKey, lang)
    await this.client.request('chat:send', { agentId, sessionKey, message })
  }

  /**
   * 增强型文本格式转换器 (Markdown -> HTML / Markdown)
   * 针对即时通讯平台 (Telegram, Feishu 等) 的 HTML 模式进行深度优化
   */
  protected mdToFormat(text: string, format: 'markdown' | 'html' = 'html'): string {
    if (!text) return ''

    // 飞书等 IM 平台对换行符 \r\n 比较敏感，统一转为 \n
    let processed = text.replace(/\r\n/g, '\n')

    if (format === 'markdown') return processed

    let html = processed

    // 1. 基础转义与预处理 (注意顺序: & 必须首先转义)
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // 2. 块级元素转换
    // 多行代码块 (```): 转换为 <pre>
    html = html.replace(/```(?:\w+)?\n?([\s\S]+?)```/g, '<pre>$1</pre>')

    // 标题 (#): 统一转为加粗
    html = html.replace(/^(?:#{1,6})\s+(.+)$/gm, '<b>$1</b>')

    // 引用 (>): blockquote
    html = html.replace(/^&gt;\s*(.+)$/gm, '<blockquote>$1</blockquote>')

    // 3. 行内元素转换
    // 行内代码 (`): 转换为 <code>
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')

    // 处理跨行的行内代码 (如果存在)
    html = html.replace(/`([\s\S]+?)`/g, '<code>$1</code>')

    // 粗体 (**): 转换为 <b>
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')

    // 4. 其他基础转换 (链接等)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

    // 5. 自动补全标签 (针对流式传输断点处的安全策略)
    const tagsToProtect = ['b', 'i', 'code', 'pre', 'a', 'blockquote']
    for (const tag of tagsToProtect) {
      const openTag = `<${tag}>`
      const closeTag = `</${tag}>`
      const openCount = (html.match(new RegExp(openTag, 'g')) || []).length
      const closeCount = (html.match(new RegExp(closeTag, 'g')) || []).length
      if (openCount > closeCount) {
        html += closeTag.repeat(openCount - closeCount)
      }
    }

    return html
  }

  /**
   * 简单的 HTML 转义，确保 UI 逻辑不因特殊字符崩溃
   */
  protected escapeHTML(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  async onLanguageChanged(_lang: string): Promise<void> {
    // pass
  }

  // ============== 指令分发系统 ==============

  protected async processCommand(
    chatId: string | number,
    command: string,
    args: string[],
    lang?: string,
    threadId?: string | number
  ): Promise<boolean> {
    const result = await (async () => {
      switch (command.toLowerCase()) {
        case 'id':
          await this.handleCmdId(chatId, threadId, lang)
          return true
        case 'help':
          await this.handleCmdHelp(chatId, lang)
          return true
        case 'health':
          await this.handleCmdHealth(chatId, lang)
          return true
        case 'agents':
          await this.handleCmdAgents(chatId, lang)
          return true
        case 'bind':
          await this.handleCmdBind(chatId, args[0], lang, threadId)
          return true
        case 'reset':
          await this.handleCmdReset(chatId, lang, threadId)
          return true
        default:
          return false
      }
    })()

    if (result) await this.stopTyping(chatId)
    return result
  }

  protected async tryProcessCommand(
    text: string,
    chatId: string | number,
    opt: { lang?: string; threadId?: string | number } = {}
  ): Promise<boolean> {
    if (!text.startsWith('/')) return false
    const parts = text.slice(1).split(/\s+/)
    let command = parts[0]
    const args = parts.slice(1)
    if (command.includes('@')) command = command.split('@')[0]

    const handled = await this.processCommand(chatId, command, args, opt.lang, opt.threadId)
    if (!handled) {
      const t = getTranslate(opt.lang)
      await this.replyToCommand(chatId, t('channel_base:unknown_command', { command }))
    }
    return true
  }

  protected abstract replyToCommand(
    chatId: string | number,
    text: string,
    options?: { parseMode?: 'Markdown' }
  ): Promise<void>

  protected getAvailableCommands(
    lang?: string
  ): { command: string; description: string; raw: string }[] {
    const t = getTranslate(lang)
    const commands = ['help', 'agents', 'bind', 'reset', 'id', 'health']
    return commands.map((cmd) => {
      const raw = t(`channel_base:help_${cmd}`)
      const description = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : raw
      return { command: cmd, description, raw }
    })
  }

  private async handleCmdHelp(chatId: string | number, lang?: string): Promise<void> {
    const t = getTranslate(lang)
    const commands = this.getAvailableCommands(lang)
    const baseCmds = commands.map((c) => c.raw)
    const platformHelp = this.getPlatformHelp(lang)
    const title = t('channel_base:help_title')
    let helpText = `${title}\n\n${baseCmds.join('\n')}`
    if (platformHelp) helpText += `\n\n${platformHelp}`
    await this.replyToCommand(chatId, helpText, { parseMode: 'Markdown' })
  }

  protected getPlatformHelp(_lang?: string): string {
    return ''
  }

  private async handleCmdId(
    chatId: string | number,
    threadId?: string | number,
    lang?: string
  ): Promise<void> {
    const t = getTranslate(lang)
    let info = `*${t('channel_base:chat_info_title')}*\n\n`
    info += `${t('channel_base:chat_id', { chatId })}\n`
    if (threadId) info += `${t('channel_base:topic_id', { threadId })}\n`
    await this.replyToCommand(chatId, info, { parseMode: 'Markdown' })
  }

  private async handleCmdHealth(chatId: string | number, lang?: string): Promise<void> {
    const t = getTranslate(lang)
    try {
      const h = await this.client.request<HealthResponse>('health')
      await this.replyToCommand(
        chatId,
        t('channel_base:gateway_status', {
          uptime: Math.round(h.uptimeMs / 1000),
          clients: h.clients
        })
      )
    } catch (err) {
      await this.replyToCommand(
        chatId,
        t('channel_base:error', { error: (err as Error).message })
      )
    }
  }

  protected async fetchAgents(): Promise<Agent[]> {
    const res = await this.client.request<AgentListResponse>('agent:list')
    return res.agents || []
  }

  private async handleCmdAgents(chatId: string | number, lang?: string): Promise<void> {
    const t = getTranslate(lang)
    try {
      const agents = await this.fetchAgents()
      const list = agents.map((a) => `- \`${a.id}\` (${a.config.name || 'Unnamed'})`).join('\n')
      await this.replyToCommand(
        chatId,
        t('channel_base:available_agents', {
          list: list || t('channel_base:no_agents')
        }),
        { parseMode: 'Markdown' }
      )
    } catch (err) {
      this.logger.error(`[Cmd] /agents failed:`, err)
      await this.replyToCommand(
        chatId,
        t('channel_base:fetch_agents_failed') + `: ${(err as Error).message}`
      )
    }
  }

  private async handleCmdBind(
    chatId: string | number,
    agentId?: string,
    lang?: string,
    threadId?: string | number
  ): Promise<void> {
    const t = getTranslate(lang)
    if (!agentId) {
      const key = threadId ? `${chatId}_${threadId}` : `${chatId}`
      const currentId = this.agentBindings.get(key) || this.opts.defaultAgentId || 'main'
      return void (await this.replyToCommand(
        chatId,
        t('channel_base:current_binding', { agentId: currentId })
      ))
    }
    try {
      const agents = await this.fetchAgents()
      if (!agents.some((a) => a.id === agentId)) {
        await this.replyToCommand(chatId, t('channel_base:agent_not_found', { agentId }))
        return
      }
      const key = threadId ? `${chatId}_${threadId}` : `${chatId}`
      this.agentBindings.set(key, agentId)
      this.opts.onBindingChange?.(Object.fromEntries(this.agentBindings))
      const target = threadId
        ? t('channel_base:target_topic', { threadId })
        : t('channel_base:target_current')
      await this.replyToCommand(chatId, t('channel_base:bind_success', { agentId, target }))
    } catch (err) {
      await this.replyToCommand(
        chatId,
        t('channel_base:error', { error: 'Gateway unreachable' })
      )
    }
  }

  private async handleCmdReset(
    chatId: string | number,
    lang?: string,
    threadId?: string | number
  ): Promise<void> {
    const t = getTranslate(lang)
    const sessionKey = this.getInternalSessionKey(chatId, threadId)
    const sessionInfo = parseSessionKey(sessionKey, this.channelId)
    try {
      await this.client.request('sessions:reset', {
        agentId: sessionInfo?.agentId || 'main',
        sessionKey
      })
      await this.replyToCommand(chatId, t('channel_base:session_reset'))
    } catch (err) {
      await this.replyToCommand(
        chatId,
        t('channel_base:reset_failed', { error: (err as Error).message })
      )
    }
  }
}
