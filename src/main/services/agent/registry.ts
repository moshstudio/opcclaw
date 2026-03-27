import fs from 'node:fs'
import path from 'node:path'
import { Agent, type AgentConfig } from './agent'
import { ConfigService } from '../config/config-service'
import { MiniAgentEvent } from './agent-events'
import { Logger } from '@main/services/common/logger'
import { newShortId } from '@shared/utils/id'
import { DEFAULT_MAX_CONCURRENT_RUNS } from '@shared/types/agent'

export interface RegisteredAgent {
  id: string
  instance: Agent
  config: AgentConfig // 来自 agent.json
}

export class AgentRegistry {
  private static instance: AgentRegistry
  private agents = new Map<string, RegisteredAgent>()
  private logger = new Logger('[AgentRegistry]')
  private createLocks = new Map<string, Promise<void>>()
  private loadLock: Promise<void> | null = null

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry()
    }
    return AgentRegistry.instance
  }

  private globalListeners = new Set<(agentId: string, event: MiniAgentEvent) => void>()

  /**
   * 订阅所有智能体事件
   */
  public subscribeAll(fn: (agentId: string, event: MiniAgentEvent) => void): () => void {
    this.globalListeners.add(fn)
    // 为现有智能体挂载
    for (const [id, agent] of this.agents) {
      agent.instance.subscribe((ev) => fn(id, ev))
    }
    return () => this.globalListeners.delete(fn)
  }

  /**
   * 手动注册一个智能体实例
   */
  public registerAgent(agentId: string, instance: Agent, config: AgentConfig): void {
    // 为新实例挂载所有全局监听器
    for (const fn of this.globalListeners) {
      instance.subscribe((ev) => fn(agentId, ev))
    }

    this.agents.set(agentId, {
      id: agentId,
      instance,
      config
    })
  }

  /**
   * 初始化并加载所有智能体
   */
  public async loadAllAgents(): Promise<void> {
    if (this.loadLock) return this.loadLock

    this.loadLock = (async () => {
      const configService = ConfigService.getInstance()
      const agentsDir = configService.getAgentsRootDir()

      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true })
      }

      const folders = fs.readdirSync(agentsDir)
      for (const folder of folders) {
        const agentPath = path.join(agentsDir, folder)
        if (fs.statSync(agentPath).isDirectory()) {
          try {
            await this.loadAgent(folder)
          } catch (err) {
            this.logger.error(`Failed to load agent ${folder}:`, err)
          }
        }
      }
    })()

    try {
      await this.loadLock
    } finally {
      this.loadLock = null
    }
  }

  /**
   * 加载指定 ID 的智能体
   */
  private async loadAgent(agentId: string): Promise<void> {
    const configService = ConfigService.getInstance()
    // 1. 加载配置（磁盘 -> 内存）

    // 2. 加载配置并创建新实例
    const agentDir = configService.getAgentDir(agentId)
    const configPath = path.join(agentDir, 'agent.json')
    const promptPath = path.join(agentDir, 'agent.md')
    const toolsPath = path.join(agentDir, 'tools.json')

    // 默认配置
    let agentJson: Partial<AgentConfig> = {}
    if (fs.existsSync(configPath)) {
      agentJson = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }

    // 默认设定
    let systemPrompt = ''
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8')
    }

    // 默认工具策略
    let toolPolicy = agentJson.toolPolicy as AgentConfig['toolPolicy']
    if (!toolPolicy && fs.existsSync(toolsPath)) {
      toolPolicy = JSON.parse(fs.readFileSync(toolsPath, 'utf8'))
    }

    // 确定使用的模型配置
    const selectedModel = agentJson.modelId ? configService.getModel(agentJson.modelId) : undefined

    // 全局默认模型
    const appConfig = configService.getConfig()
    const defaultModelId = appConfig.defaultModelId
    const defaultModel = configService.getModel(defaultModelId || '')

    // 确定生效的模型基准 (Agent 指定 > 全局默认)
    const effectiveBaseModel = selectedModel || defaultModel

    // 自动修复：如果配置的 modelId 指定了但找不到，且回退也没找到，则在运行时标记重置（但不一定立即写回磁盘）
    if (agentJson.modelId && !selectedModel) {
      this.logger.warn(
        `Agent ${agentId} configured modelId ${agentJson.modelId} not found, using fallback or default.`
      )
    }

    const agentConfig: AgentConfig = {
      agentId,
      name: agentJson.name || agentId,
      modelId: agentJson.modelId || selectedModel?.id,
      apiKey: agentJson.apiKey || effectiveBaseModel?.apiKey,
      provider: agentJson.provider || effectiveBaseModel?.provider,
      model: agentJson.model || effectiveBaseModel?.model,
      baseUrl: agentJson.baseUrl || effectiveBaseModel?.baseUrl,
      headers: agentJson.headers,
      systemPrompt: systemPrompt || undefined,
      toolPolicy,
      // 路径隔离
      sessionDir: path.join(agentDir, 'sessions'),
      memoryDir: path.join(agentDir, 'memory'),
      workspaceDir: agentJson.workspaceDir || path.join(agentDir, 'workspace'),
      usageDir: agentJson.usageDir || path.join(agentDir, 'usage'),
      heartbeatDir: agentJson.heartbeatDir || path.join(agentDir, 'heartbeat'),
      // 功能开关
      enableMemory: agentJson.enableMemory,
      enableSkills: agentJson.enableSkills,
      enableContext: agentJson.enableContext,
      enableHeartbeat: agentJson.enableHeartbeat,
      heartbeatInterval: agentJson.heartbeatInterval,
      heartbeatActiveHours: agentJson.heartbeatActiveHours,
      heartbeatStartTime: agentJson.heartbeatStartTime,
      // 参数设置
      temperature: agentJson.temperature,
      reasoning: agentJson.reasoning,
      maxTurns: agentJson.maxTurns,
      contextTokens: agentJson.contextTokens,
      maxTokens: agentJson.maxTokens,
      maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_RUNS,
      supportsVision: agentJson.supportsVision ?? defaultModel?.supportsVision,
      // 沙箱配置
      sandbox: agentJson.sandbox,
      isPinned: agentJson.isPinned
    }

    // 2. 检查是否有已有实例（热更新）
    const existing = this.agents.get(agentId)
    if (existing) {
      existing.instance.updateConfig(agentConfig)
      existing.config = agentConfig
      this.logger.info(`Agent hot-reloaded: ${agentId}`)
      return
    }

    // 3. 创建新实例
    const instance = new Agent(agentConfig, {
      onConfigChange: (cfg) => this.saveAgentJson(agentId, cfg)
    })
    this.registerAgent(agentId, instance, agentConfig)

    this.logger.info(
      `Loaded agent: ${agentId} (Heartbeat: ${agentConfig.enableHeartbeat ? 'on' : 'off'})`
    )
  }

  public async createDefaultAgent(agentId: string): Promise<void> {
    if (this.agents.has(agentId)) return

    // 并发锁：防止多个请求同时创建同一个智能体
    const existingLock = this.createLocks.get(agentId)
    if (existingLock) return existingLock

    const promise = (async () => {
      const configService = ConfigService.getInstance()
      const agentDir = configService.getAgentDir(agentId)

      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true })
        fs.mkdirSync(path.join(agentDir, 'workspace'), { recursive: true })
        fs.mkdirSync(path.join(agentDir, 'sessions'), { recursive: true })
        fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true })
        fs.mkdirSync(path.join(agentDir, 'usage'), { recursive: true })
        fs.mkdirSync(path.join(agentDir, 'heartbeat'), { recursive: true })
        fs.writeFileSync(path.join(agentDir, 'agent.md'), '# 身份\n\n你是一个乐于助人的 AI 助手。')
        this.saveAgentJson(agentId, {
          name: '默认智能体'
        })
      }

      await this.loadAgent(agentId)

      // 创建第一个 session
      const agent = this.getAgent(agentId)
      if (agent) {
        const sessions = await agent.listSessions()
        if (sessions.length === 0) {
          await agent.createSession()
        }
      }
    })()

    this.createLocks.set(agentId, promise)
    try {
      await promise
    } finally {
      this.createLocks.delete(agentId)
    }
  }

  public getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.instance
  }

  public async createAgent(config: AgentConfig & { id?: string }): Promise<string> {
    const agentId = config.id || `agent-${newShortId(8)}`
    const configService = ConfigService.getInstance()
    const agentDir = configService.getAgentDir(agentId)

    if (fs.existsSync(agentDir)) {
      throw new Error(`Agent ${agentId} already exists`)
    }

    fs.mkdirSync(agentDir, { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'workspace'), { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'sessions'), { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'usage'), { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'heartbeat'), { recursive: true })

    const { systemPrompt, ...agentJson } = config

    // 保存配置
    this.saveAgentJson(agentId, agentJson)

    // 保存系统提示词
    if (systemPrompt) {
      fs.writeFileSync(path.join(agentDir, 'agent.md'), systemPrompt)
    }

    await this.loadAgent(agentId)

    // 创建第一个 session (仅在列表为空时创建，确保幂等性)
    const agent = this.getAgent(agentId)
    if (agent) {
      const sessions = await agent.listSessions()
      if (sessions.length === 0) {
        await agent.createSession()
      }
    }

    return agentId
  }

  public async deleteAgent(agentId: string): Promise<void> {
    if (agentId === 'main') {
      throw new Error('Cannot delete default agent')
    }

    const configService = ConfigService.getInstance()
    const agentDir = configService.getAgentDir(agentId)

    if (this.agents.has(agentId)) {
      this.agents.delete(agentId)
    }

    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true })
    }
  }

  public async updateAgent(agentId: string, updates: Partial<AgentConfig>): Promise<void> {
    const agentData = this.agents.get(agentId)
    if (!agentData) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const configService = ConfigService.getInstance()
    const agentDir = configService.getAgentDir(agentId)
    const promptPath = path.join(agentDir, 'agent.md')

    const { systemPrompt, ...otherUpdates } = updates

    // 合并配置并持久化
    const newConfig = { ...agentData.config, ...otherUpdates }
    this.saveAgentJson(agentId, newConfig)

    // 更新系统提示词
    if (systemPrompt !== undefined) {
      fs.writeFileSync(promptPath, systemPrompt)
    }

    // 重新加载实例
    await this.loadAgent(agentId)
  }

  /**
   * 当模型配置或默认模型变更时，刷新受影响的智能体
   */
  public async refreshImpactedAgents(changedModelId?: string): Promise<void> {
    const configService = ConfigService.getInstance()
    const appConfig = configService.getConfig()
    const defaultModelId = appConfig.defaultModelId

    for (const [id, agent] of this.agents) {
      const needsUpdate =
        !changedModelId || // 如果没传具体 ID，全量刷一次（保证安全重试）
        agent.config.modelId === changedModelId || // 显式使用了该模型
        (!agent.config.modelId && changedModelId === defaultModelId) // 依赖默认模型，且默认模型发生了变化

      if (needsUpdate) {
        try {
          await this.loadAgent(id)
        } catch (err) {
          this.logger.error(`Failed to refresh impacted agent ${id}:`, err)
        }
      }
    }
  }

  public listAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values())
  }

  /**
   * 统一处理 Agent JSON 配置的持久化
   */
  public saveAgentJson(agentId: string, data: Partial<AgentConfig & { id?: string }>) {
    try {
      const configService = ConfigService.getInstance()
      const agentDir = configService.getAgentDir(agentId)
      const configPath = path.join(agentDir, 'agent.json')

      const { systemPrompt: _sp, id: _id, modelDef: _md, tools: _t, ...saveable } = data

      // 过滤掉 null 值，使其在 JSON 中不可见 (触发 fallback)
      const filtered = Object.fromEntries(
        Object.entries(saveable).filter(([_, value]) => value !== null)
      )

      fs.writeFileSync(configPath, JSON.stringify(filtered, null, 2), 'utf8')
    } catch (err) {
      this.logger.error(`Failed to save agent.json for ${agentId}:`, err)
    }
  }

  public stopAll(): void {
    for (const agent of this.agents.values()) {
      try {
        agent.instance.abort()
        agent.instance.stopHeartbeat() // 停止所有心跳
      } catch (err) {
        this.logger.error(`Failed to stop agent ${agent.id}:`, err)
      }
    }
  }

  /**
   * 获取所有存有 heartbeat.md 文件的 Agent 定时任务列表
   */
  public listHeartbeatTasks() {
    const tasks: Array<{
      agentId: string
      agentName: string
      status: ReturnType<Agent['getHeartbeatStatus']>
    }> = []
    for (const [id, agent] of this.agents) {
      if (agent.instance.hasHeartbeatFile()) {
        const status = agent.instance.getHeartbeatStatus()
        tasks.push({
          agentId: id,
          agentName: agent.config.name || id,
          status: status
        })
      }
    }
    return tasks
  }
}
