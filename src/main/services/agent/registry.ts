import fs from 'node:fs'
import path from 'node:path'
import { Agent, type AgentConfig } from './agent.js'
import { ConfigService } from '../config/config-service.js'
import { MiniAgentEvent } from './agent-events.js'
import { Logger } from '@main/services/common/logger.js'
import { newShortId } from '@shared/utils/id.js'

export interface RegisteredAgent {
  id: string
  instance: Agent
  config: any // 来自 agent.json
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

  private globalListeners = new Set<(agentId: string, event: any) => void>()

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
  public registerAgent(agentId: string, instance: Agent, config: any = {}): void {
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
    const agentDir = configService.getAgentDir(agentId)

    const configPath = path.join(agentDir, 'agent.json')
    const promptPath = path.join(agentDir, 'agent.md')
    const toolsPath = path.join(agentDir, 'tools.json')

    // 默认配置
    let agentJson: any = {}
    if (fs.existsSync(configPath)) {
      agentJson = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }

    // 默认设定
    let systemPrompt = ''
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8')
    }

    // 默认工具策略
    let toolPolicy = agentJson.toolPolicy
    if (!toolPolicy && fs.existsSync(toolsPath)) {
      toolPolicy = JSON.parse(fs.readFileSync(toolsPath, 'utf8'))
    }

    // 模型配置优先级：agent.json > 全局配置
    const appConfig = configService.getConfig()
    const defaultModel = configService.getModel(appConfig.defaultModelId || '')

    const agentConfig: AgentConfig = {
      agentId,
      apiKey: agentJson.apiKey || defaultModel?.apiKey,
      provider: agentJson.provider || defaultModel?.provider,
      model: agentJson.model || defaultModel?.model,
      baseUrl: agentJson.baseUrl || defaultModel?.baseUrl,
      headers: agentJson.headers,
      systemPrompt: systemPrompt || undefined,
      toolPolicy,
      // 路径隔离
      sessionDir: path.join(agentDir, 'sessions'),
      memoryDir: path.join(agentDir, 'memory'),
      workspaceDir: agentJson.workspaceDir || path.join(agentDir, 'workspace'),
      // 功能开关
      enableMemory: agentJson.enableMemory,
      enableSkills: agentJson.enableSkills,
      enableContext: agentJson.enableContext,
      enableHeartbeat: agentJson.enableHeartbeat,
      heartbeatInterval: agentJson.heartbeatInterval,
      // 参数设置
      temperature: agentJson.temperature,
      reasoning: agentJson.reasoning,
      maxTurns: agentJson.maxTurns,
      contextTokens: agentJson.contextTokens,
      maxTokens: agentJson.maxTokens,
      maxConcurrentRuns: agentJson.maxConcurrentRuns,
      supportsVision: agentJson.supportsVision ?? defaultModel?.supportsVision,
      // 沙箱配置
      sandbox: agentJson.sandbox
    }

    const instance = new Agent(agentConfig)
    this.registerAgent(agentId, instance, {
      ...agentJson,
      systemPrompt,
      // 传递解析后的关键路径和设置，方便前端显示完整路径
      workspaceDir: agentConfig.workspaceDir,
      sessionDir: agentConfig.sessionDir,
      memoryDir: agentConfig.memoryDir
    })

    this.logger.info(`Loaded agent: ${agentId}`)
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
        fs.writeFileSync(
          path.join(agentDir, 'agent.md'),
          '# Identity\n\nYou are a helpful AI assistant.'
        )
        fs.writeFileSync(
          path.join(agentDir, 'agent.json'),
          JSON.stringify(
            {
              name: 'Default Assistant'
            },
            null,
            2
          )
        )
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

  public async createAgent(config: any): Promise<string> {
    const agentId = config.id || `agent-${newShortId(8)}`
    const configService = ConfigService.getInstance()
    const agentDir = configService.getAgentDir(agentId)

    if (fs.existsSync(agentDir)) {
      throw new Error(`Agent ${agentId} already exists`)
    }

    fs.mkdirSync(agentDir, { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'workspace'), { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'sessions'), { recursive: true })

    const { systemPrompt, ...agentJson } = config

    // 保存配置
    fs.writeFileSync(path.join(agentDir, 'agent.json'), JSON.stringify(agentJson, null, 2))

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

  public async updateAgent(agentId: string, updates: any): Promise<void> {
    const agentData = this.agents.get(agentId)
    if (!agentData) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const configService = ConfigService.getInstance()
    const agentDir = configService.getAgentDir(agentId)
    const configPath = path.join(agentDir, 'agent.json')
    const promptPath = path.join(agentDir, 'agent.md')

    const { systemPrompt, ...otherUpdates } = updates

    // 合并配置
    const newConfig = { ...agentData.config, ...otherUpdates }
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2))

    // 更新系统提示词
    if (systemPrompt !== undefined) {
      fs.writeFileSync(promptPath, systemPrompt)
    }

    // 重新加载实例
    await this.loadAgent(agentId)
  }

  public listAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values())
  }

  public stopAll(): void {
    for (const agent of this.agents.values()) {
      try {
        agent.instance.abort()
      } catch (err) {
        this.logger.error(`Failed to abort agent ${agent.id}:`, err)
      }
    }
  }
}
