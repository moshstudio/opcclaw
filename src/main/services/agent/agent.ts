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
    this.heartbeat = new HeartbeatManager(this.workspaceDir, {
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
      (_psk) => {
        // 子代理任务完成后的回调，目前为空
      }
    )
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

  public async resetSession(sessionKey: string) {
    return this.sessionService.reset(sessionKey)
  }

  public async deleteSession(sessionKey: string) {
    return this.sessionService.delete(sessionKey)
  }

  public async getSessionHistory(
    sessionKey: string,
    options?: { limit?: number; offset?: number }
  ) {
    return this.sessionService.getHistory(sessionKey, options)
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

  public async run(sessionKey: string, userInput: string): Promise<RunResult> {
    const sk = resolveSessionKey({ sessionKey })
    const runId = newShortId()

    // 监听 Abort
    const signal = this.stateManager.startRun(sk, runId)

    try {
      // 1. 准备初始消息与上下文压缩
      const history = await this.sessionManager.load(sk)
      const currentMessages = [...history.messages]
      let initialUserMessage: Message | undefined

      if (userInput) {
        initialUserMessage = { role: 'user', content: userInput, timestamp: Date.now() }
        // 立即持久化初始消息，确保哪怕运行失败也能保留
        await this.sessionManager.append(sk, initialUserMessage)
        currentMessages.push(initialUserMessage)
      }

      const { modelDef, apiKey: resolvedApiKey } = this.resolveModelDef()

      if (!modelDef) {
        throw new Error(
          `No model defined for agent ${this.id}. Please configure a model in settings.`
        )
      }

      // 2. 实时同步更新 contextManager 的配置，确保压缩总结可用
      const finalApiKey = this.config.apiKey || resolvedApiKey
      this.contextManager.updateConfig({ modelDef, apiKey: finalApiKey })

      // 3. 发送运行开始事件
      this.emit({
        type: 'agent:run-start',
        runId,
        sessionKey: sk,
        agentId: this.id,
        model: modelDef.id
      })

      // 4. 发送初始用户消息事件 (如有)
      if (initialUserMessage) {
        this.emit({
          type: 'chat:userMessage',
          runId,
          sessionKey: sk,
          message: initialUserMessage
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
        if (event.type === 'agent:turn-start') turns++
        if (event.type === 'chat:toolCall') toolCalls++

        if (event.type === 'chat:final' || event.type === 'agent:run-error') {
          lastResult = event
        }
        this.emit(event)
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
      await this.stateManager.endRun(sk, runId)
    }
  }

  public abort(runId?: string) {
    this.stateManager.abort(runId)
  }

  public abortSession(sessionKey: string) {
    this.stateManager.abortSession(sessionKey)
  }

  public steer(sessionKey: string, text: string) {
    this.stateManager.steer(sessionKey, text)
    this.emit({ type: 'chat:notice', sessionKey, runId: 'steer', text: '指令已注入' })
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
    this.heartbeat.onHeartbeat(async (o) => {
      const sk = resolveSessionKey({ agentId: this.id, sessionKey: 'heartbeat' })
      try {
        await this.run(sk, `[Heartbeat Wake] Reason: ${o.reason}\n\nContext:\n${o.content}`)
        return { text: 'Executed heartbeat task' }
      } catch (err) {
        console.error(`[Agent ${this.id}] Heartbeat execution failed:`, err)
        return null
      }
    })
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

  private getHeartbeatFilePath(): string {
    const status = this.heartbeat.getStatus()
    return path.isAbsolute(status.heartbeatPath)
      ? status.heartbeatPath
      : path.join(this.workspaceDir, status.heartbeatPath)
  }
}
