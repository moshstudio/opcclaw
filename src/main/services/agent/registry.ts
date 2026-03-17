import fs from 'node:fs'
import path from 'node:path'
import { Agent, type AgentConfig } from './agent.js'
import { ConfigService } from '../config/config-service.js'

export interface RegisteredAgent {
  id: string
  instance: Agent
  config: any // 来自 agent.json
}

export class AgentRegistry {
  private static instance: AgentRegistry
  private agents = new Map<string, RegisteredAgent>()

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry()
    }
    return AgentRegistry.instance
  }

  /**
   * 手动注册一个智能体实例
   */
  public registerAgent(agentId: string, instance: Agent, config: any = {}): void {
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
          console.error(`[AgentRegistry] Failed to load agent ${folder}:`, err)
        }
      }
    }

    // 如果没有任何智能体，创建一个默认的 'main' 智能体
    if (this.agents.size === 0) {
      await this.createDefaultAgent('main')
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
    let toolPolicy = undefined
    if (fs.existsSync(toolsPath)) {
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
      systemPrompt: systemPrompt || undefined,
      toolPolicy,
      // 路径隔离
      sessionDir: path.join(agentDir, 'sessions'),
      memoryDir: path.join(agentDir, 'memory'),
      workspaceDir: agentJson.workspaceDir || path.join(agentDir, 'workspace'),
      // 其他参数
      temperature: agentJson.temperature,
      reasoning: agentJson.reasoning,
      maxTurns: agentJson.maxTurns,
      supportsVision: agentJson.supportsVision ?? defaultModel?.supportsVision
    }

    const instance = new Agent(agentConfig)
    this.agents.set(agentId, {
      id: agentId,
      instance,
      config: agentJson
    })

    console.log(`[AgentRegistry] Loaded agent: ${agentId}`)
  }

  private async createDefaultAgent(agentId: string): Promise<void> {
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
            name: 'Default Assistant',
            description: 'Initial default agent'
          },
          null,
          2
        )
      )
    }

    await this.loadAgent(agentId)
  }

  public getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.instance
  }

  public listAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values())
  }
}
