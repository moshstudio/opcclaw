import fs from 'node:fs'
import path from 'node:path'
import { newShortId } from '@shared/utils/id'
import type { Tool } from '@main/services/tools/types'
import { builtinTools } from '@main/services/tools/builtin'
import { SessionManager } from '@main/services/session/session'
import { MemoryManager } from '@main/services/memory/memory'
import { SkillManager } from '@main/services/skills/skills'
import { HeartbeatManager } from '@main/services/heartbeat/heartbeat'
import { resolveSessionKey } from '@main/services/session/session-key'
import { runAgentLoop } from './agent-loop'
import { ContextLoader } from '@main/services/context/index'

import { UsageManager } from '@main/services/usage/usage-manager'
import { ConfigService } from '../config/config-service'
import type { Model, Api, KnownProvider } from '@mariozechner/pi-ai'
import { streamSimple } from '@mariozechner/pi-ai'
import type { AIModelConfig } from '@shared/types/models'
import type { MiniAgentEvent } from './agent-events'
import type { AgentConfig, RunResult, Message } from '@shared/types/agent'
export type { AgentConfig, RunResult, Message }

// 导入核心子服务
import { AgentStateManager } from './core/state-manager'
import { AgentPromptBuilder } from './core/prompt-builder'
import { AgentContextManager } from './core/context-manager'
import { AgentSessionService } from './core/session-service'
import { SubagentService } from './core/subagent-service'

// ============== 类型定义 ==============

// ============== Agent 核心类 ==============

/**
 * Agent 核心类 (Architecture Orchestrator)
 */
export class Agent {
  public readonly id: string
  public readonly config: AgentConfig
  public readonly workspaceDir: string

  private readonly sessionManager: SessionManager
  private readonly memoryManager: MemoryManager
  private readonly skillManager: SkillManager
  private readonly heartbeat: HeartbeatManager
  private readonly usageManager: UsageManager

  // 子服务实例
  private readonly stateManager: AgentStateManager
  private readonly promptBuilder: AgentPromptBuilder
  private readonly contextManager: AgentContextManager
  private readonly sessionService: AgentSessionService
  private readonly subagentService: SubagentService
  private interactionCallbacks = new Map<
    string,
    { resolve: (res: boolean) => void; timer: NodeJS.Timeout }
  >()

  private eventsListeners = new Set<(event: MiniAgentEvent) => void>()

  constructor(config: AgentConfig) {
    this.id = config.agentId || newShortId()
    this.config = { ...config, agentId: this.id }
    this.workspaceDir = config.workspaceDir || path.join(process.cwd(), 'agents', this.id)

    // 1. 初始化基础管理器
    this.sessionManager = new SessionManager(config.sessionDir!)
    this.memoryManager = new MemoryManager(config.memoryDir!)
    this.skillManager = new SkillManager(this.workspaceDir)
    this.usageManager = new UsageManager(config.usageDir!)
    this.heartbeat = new HeartbeatManager(this.workspaceDir, config.heartbeatDir!, {
      enabled: config.enableHeartbeat,
      intervalMs: config.heartbeatInterval,
      heartbeatPath: 'HEARTBEAT.md'
    })

    // 2. 初始化子服务
    this.stateManager = new AgentStateManager(this.sessionManager)

    this.promptBuilder = new AgentPromptBuilder({
      baseSystemPrompt: config.systemPrompt || 'You are a helpful assistant.',
      enableMemory: config.enableMemory,
      skills: this.skillManager,
      context: config.enableContext ? new ContextLoader(this.workspaceDir) : undefined,
      sandbox: config.sandbox
    })

    const { modelDef, apiKey: resolvedApiKey } = this.resolveModelDef()
    this.contextManager = new AgentContextManager({
      sessionManager: this.sessionManager,
      contextTokens: config.contextTokens || 4000,
      modelDef,
      apiKey: resolvedApiKey || config.apiKey,
      emit: (ev) => this.emit(ev)
    })

    this.sessionService = new AgentSessionService({
      agentId: this.id,
      sessionManager: this.sessionManager,
      emit: (ev) => this.emit(ev)
    })

    this.subagentService = new SubagentService(
      this.id,
      this.sessionManager,
      (sk, msg) => this.run(sk, msg || ''),
      (ev) => this.emit(ev),
      (sk, txt) => this.steer(sk, txt),
      (psk) => {
        // 子代理任务完成后的回调
        // 如果宿主 Session 当前没有在运行的任务，则自动触发一次运行以消费 Steering 指令
        if (!this.stateManager.isSessionActive(psk)) {
          this.run(psk, '').catch((err) => {
            console.error(`[Agent:${this.id}] Auto-wake run failed for session ${psk}:`, err)
          })
        }
      }
    )
    // 3. 注册心跳回调 (始终注册，确保手动触发可用)
    this.heartbeat.onStatusChange(() => {
      this.emit({
        type: 'heartbeat:updated',
        agentId: this.id,
        status: this.getHeartbeatStatus()
      })
    })

    this.heartbeat.onHeartbeat(async (o) => {
      const sk = resolveSessionKey({ agentId: this.id, sessionKey: 'heartbeat' })
      try {
        // [Auto-Create] 如果是首次运行心跳任务且 Session 不存在，则显式创建并广播通知前端
        if (!(await this.sessionManager.getMetadata(sk))) {
          await this.sessionManager.create(sk)
          this.emit({
            type: 'session:created',
            sessionKey: sk,
            agentId: this.id
          })
        }

        await this.run(
          sk,
          `[心跳唤醒] 当前时间: ${new Date().toLocaleString()}\n唤醒原因: ${o.reason}\n\n任务上下文:\n${o.content}`
        )
        return { text: 'Executed heartbeat task' }
      } catch (err) {
        console.error(`[Agent ${this.id}] Heartbeat execution failed:`, err)
        return null
      }
    })

    // 4. 如果配置启用，则启动调度
    if (config.enableHeartbeat) {
      this.heartbeat.start()
    }
  }

  /**
   * 解析模型定义。
   * 优先级：Agent 自身配置 > 系统默认模型 > 模型库第一个模型
   */
  private resolveModelConfig(): AIModelConfig | undefined {
    const configService = ConfigService.getInstance()
    const appConfig = configService.getConfig()

    // 1. 尝试获取模型配置的对象
    let modelConfig: AIModelConfig | undefined

    // 优先级 1: Agent 绑定了特定模型 ID
    if (this.config.model) {
      modelConfig = configService.getModel(this.config.model)
    }

    // 优先级 2: 使用系统默认模型
    if (!modelConfig && appConfig.defaultModelId) {
      modelConfig = configService.getModel(appConfig.defaultModelId)
    }

    // 优先级 3: 实在没有，拿第一个
    if (!modelConfig && appConfig.models.length > 0) {
      modelConfig = appConfig.models[0]
    }

    return modelConfig
  }

  private resolveModelDef(): { modelDef: Model<Api> | undefined; apiKey?: string } {
    // 如果 config 中直接注入了 runtime 的 modelDef，优先使用
    if (this.config.modelDef) {
      return { modelDef: this.config.modelDef, apiKey: this.config.apiKey }
    }

    const modelConfig = this.resolveModelConfig()
    if (!modelConfig) return { modelDef: undefined }

    const provider = this.config.provider || modelConfig.provider
    const modelId = modelConfig.model // 真正的模型标识符

    const API_FOR_PROVIDER: Record<string, string> = {
      openai: 'openai-completions',
      anthropic: 'anthropic-messages',
      google: 'google-generative-ai',
      groq: 'openai-completions'
    }
    const api = API_FOR_PROVIDER[provider] || 'openai-completions'

    const def: any = {
      id: modelId,
      name: modelConfig.name || modelId,
      api: api as Api,
      provider: provider as KnownProvider,
      baseUrl: this.config.baseUrl || modelConfig.baseUrl || '',
      reasoning: this.config.reasoning !== undefined,
      input: ['text'],
      contextWindow: this.config.contextTokens || 128000,
      maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    }

    return { modelDef: def as Model<Api>, apiKey: modelConfig.apiKey }
  }

  // --- 基础 Getter ---

  public getSessionManager() {
    return this.sessionManager
  }
  public getMemoryManager() {
    return this.memoryManager
  }
  public getSkillManager() {
    return this.skillManager
  }
  public getHeartbeatManager() {
    return this.heartbeat
  }
  public getUsageManager() {
    return this.usageManager
  }
  public getPromptBuilder() {
    return this.promptBuilder
  }
  public getContextManager() {
    return this.contextManager
  }
  public getSessionService() {
    return this.sessionService
  }
  public getStateManager() {
    return this.stateManager
  }

  // --- 会话管理代理 ---

  public async listSessions(): Promise<string[]> {
    return this.sessionService.list()
  }

  public async createSession(): Promise<string> {
    return this.sessionService.create()
  }

  public async resetSession(rawSessionKey: string) {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    return this.sessionService.reset(sk)
  }

  public async deleteSession(rawSessionKey: string) {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    return this.sessionService.delete(sk)
  }

  public async getSessionHistory(
    rawSessionKey: string,
    options?: { limit?: number; offset?: number }
  ) {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    return this.sessionService.getHistory(sk, options)
  }

  // --- 事件系统 ---

  public subscribe(fn: (event: MiniAgentEvent) => void) {
    this.eventsListeners.add(fn)
    return () => this.eventsListeners.delete(fn)
  }

  private emit(event: MiniAgentEvent) {
    for (const fn of this.eventsListeners) fn(event)
  }

  // --- 核心业务方法 (Run / Abort / Steer) ---

  public async run(rawSessionKey: string, userInput: string): Promise<RunResult> {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    const runId = newShortId()

    // 监听 Abort
    const signal = this.stateManager.startRun(sk, runId)

    try {
      const { modelDef, apiKey: resolvedApiKey } = this.resolveModelDef()

      if (!modelDef) {
        throw new Error(
          `No model defined for agent ${this.id}. Please configure a model in settings.`
        )
      }
      const finalApiKey = this.config.apiKey || resolvedApiKey
      this.contextManager.updateConfig({ modelDef, apiKey: finalApiKey })

      const history = await this.sessionManager.load(sk)
      const currentMessages = [...history.messages]
      this.emit({
        type: 'agent:run-start',
        runId,
        sessionKey: sk,
        agentId: this.id,
        model: modelDef.id
      })

      // 只有在 userInput 非空时才注入并广播 User 消息
      if (userInput) {
        const userMessage: Message = { role: 'user', content: userInput, timestamp: Date.now() }
        currentMessages.push(userMessage)
        this.sessionManager.append(sk, userMessage)

        this.emit({
          type: 'chat:userMessage',
          runId,
          sessionKey: sk,
          message: userMessage
        })
      }

      // 5. 构建 params 对接 runAgentLoop
      const stream = runAgentLoop({
        runId,
        sessionKey: sk,
        agentId: this.id,
        currentMessages,
        compactionSummary: undefined, // 初始为空
        systemPrompt: await this.promptBuilder.build({
          sessionKey: sk,
          availableTools: this.getAvailableTools(),
          runtime: { agentId: this.id, workspaceDir: this.workspaceDir }
        }),
        toolsForRun: this.getAvailableTools(),
        toolCtx: {
          agentId: this.id,
          sessionKey: sk,
          workspaceDir: this.workspaceDir,
          abortSignal: signal,
          memory: this.memoryManager,
          spawnSubagent: async (params) => {
            return this.subagentService.spawn({
              parentSessionKey: sk,
              task: params.task,
              label: params.label,
              cleanup: params.cleanup
            })
          },
          heartbeat: {
            updateConfig: (cfg) => this.heartbeat.updateConfig(cfg),
            start: () => this.heartbeat.start(),
            stop: () => this.heartbeat.stop(),
            trigger: () => this.heartbeat.trigger()
          },
          confirm: async (prompt, options) => {
            return new Promise((resolve) => {
              const interactionId = `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

              // 5 分钟超时处理
              const timer = setTimeout(
                () => {
                  this.respondInteraction(interactionId, false)
                },
                5 * 60 * 1000
              )

              this.interactionCallbacks.set(interactionId, {
                resolve,
                timer
              })

              this.emit({
                type: 'chat:interaction',
                runId,
                sessionKey: sk,
                interactionId,
                prompt,
                options,
                isComplete: false
              })
            })
          }
        },
        modelDef: modelDef,
        streamFn: this.config.streamFn || streamSimple,
        apiKey: finalApiKey,
        temperature: this.config.temperature,
        reasoning: this.config.reasoning,
        maxTurns: this.config.maxTurns || 10,
        contextTokens: this.config.contextTokens || 4000,
        abortSignal: signal,

        // 回调
        getSteeringMessages: () => this.stateManager.drainSteering(sk),
        appendMessage: (key, msg) => this.sessionManager.append(key, msg),
        prepareCompaction: (params) => this.contextManager.prepareMessages(params),
        recordUsage: (record) => this.usageManager.recordRun(record)
      })

      // 3. 消费输出流与事件转发
      let lastResult: MiniAgentEvent | null = null
      let turns = 0
      let toolCalls = 0

      for await (const event of stream) {
        this.emit(event)
        switch (event.type) {
          case 'agent:turn-start':
            turns++
            break
          case 'chat:toolCall':
            toolCalls++
            break
          case 'chat:final':
          case 'agent:run-error':
            lastResult = event
            break
        }
      }

      if (!lastResult || lastResult.type === 'agent:run-error') {
        throw new Error(
          lastResult && 'error' in lastResult ? lastResult.error : 'Unknown error during agent run'
        )
      }

      return {
        runId,
        text: lastResult.type === 'chat:final' ? lastResult.text : '',
        turns,
        toolCalls
      }
    } finally {
      // 清理该次运行所有挂起的交互
      this.interactionCallbacks.forEach((entry, id) => {
        this.respondInteraction(id, false)
      })
      await this.stateManager.endRun(sk, runId)
    }
  }

  public abort(runId?: string) {
    this.stateManager.abort(runId)
  }

  public abortSession(rawSessionKey: string) {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    this.stateManager.abortSession(sk)
  }

  public steer(rawSessionKey: string, text: string) {
    const sk = resolveSessionKey({ agentId: this.id, sessionKey: rawSessionKey })
    this.stateManager.steer(sk, text)
    this.emit({ type: 'chat:notice', sessionKey: sk, runId: 'steer', text: '指令已注入' })
  }

  public respondInteraction(interactionId: string, result: boolean) {
    const entry = this.interactionCallbacks.get(interactionId)
    if (entry) {
      this.interactionCallbacks.delete(interactionId)
      clearTimeout(entry.timer)
      entry.resolve(result)
    }
  }

  // --- 辅助工具方法 ---

  public getAvailableTools(): Tool[] {
    return [...builtinTools, ...(this.config.tools || [])]
  }

  // --- 心跳管理相关 ---

  public getHeartbeatStatus() {
    const status = this.heartbeat.getStatus()
    return {
      enabled: status.enabled,
      started: status.started,
      isRunning: status.isRunning,
      lastRunMs: status.lastRunMs || 0,
      nextDueMs: status.nextDueMs,
      intervalMs: status.intervalMs,
      activeHours: status.activeHours || { start: '00:00', end: '23:59' },
      isWithinActiveHours: status.isWithinActiveHours
    }
  }

  public hasHeartbeatFile(): boolean {
    return fs.existsSync(this.getHeartbeatFilePath())
  }

  public async getHeartbeatFileContent(): Promise<string> {
    const filePath = this.getHeartbeatFilePath()
    if (!fs.existsSync(filePath)) return ''
    return fs.promises.readFile(filePath, 'utf-8')
  }

  public async saveHeartbeatFile(content: string): Promise<void> {
    const filePath = this.getHeartbeatFilePath()
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    await fs.promises.writeFile(filePath, content, 'utf-8')
  }

  public async deleteHeartbeatFile(): Promise<void> {
    const filePath = this.getHeartbeatFilePath()
    if (fs.existsSync(filePath)) await fs.promises.unlink(filePath)
    this.stopHeartbeat()
  }

  public startHeartbeat() {
    this.heartbeat.start()
  }

  public stopHeartbeat() {
    this.heartbeat.stop()
  }

  public async triggerHeartbeat() {
    return this.heartbeat.trigger()
  }

  public updateHeartbeatConfig(config: {
    intervalMs?: number
    enabled?: boolean
    activeHours?: { start: string; end: string }
  }) {
    this.heartbeat.updateConfig(config)
  }

  public getHeartbeatLogs() {
    return this.heartbeat.getLogs()
  }

  public async readHeartbeatLogs(options?: { limit?: number; offset?: number; reverse?: boolean }) {
    return this.heartbeat.readLogs(options)
  }

  private getHeartbeatFilePath(): string {
    const status = this.heartbeat.getStatus()
    return path.isAbsolute(status.heartbeatPath)
      ? status.heartbeatPath
      : path.join(this.workspaceDir, status.heartbeatPath)
  }
}
