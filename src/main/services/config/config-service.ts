import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { completeSimple } from '@mariozechner/pi-ai'

const OPCCLAW_ROOT = path.join(os.homedir(), '.opcclaw')

export interface AIModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  supportsVision?: boolean
}

export interface GatewaySettings {
  port: number
  token?: string
}

export interface AppConfig {
  models: AIModelConfig[]
  gateway: GatewaySettings
  defaultModelId?: string
}

const DEFAULT_CONFIG: AppConfig = {
  models: [],
  gateway: {
    port: 18789,
    token: 'openclaw-mini-secret'
  },
  defaultModelId: ''
}

export class ConfigService {
  private static instance: ConfigService
  private configPath: string
  private config: AppConfig

  private constructor() {
    this.ensureDir(OPCCLAW_ROOT)
    this.ensureDir(path.join(OPCCLAW_ROOT, 'agents'))
    this.ensureDir(path.join(OPCCLAW_ROOT, 'skills')) // 新增：确保全局技能目录存在
    this.configPath = path.join(OPCCLAW_ROOT, 'config.json')
    this.config = this.loadConfig()
  }

  private ensureDir(p: string): void {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true })
    }
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService()
    }
    return ConfigService.instance
  }

  private generateToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8')
        const data = JSON.parse(content)
        // 自动生成遗漏的 token
        if (!data.gateway?.token) {
          data.gateway = { ...DEFAULT_CONFIG.gateway, ...data.gateway, token: this.generateToken() }
        }
        return { ...DEFAULT_CONFIG, ...data }
      }
    } catch (err) {
      console.error('Failed to load config, using defaults:', err)
    }
    return {
      ...DEFAULT_CONFIG,
      gateway: { ...DEFAULT_CONFIG.gateway, token: this.generateToken() }
    }
  }

  public saveConfig(newConfig: Partial<AppConfig>): void {
    this.config = { ...this.config, ...newConfig }
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }

  public getConfig(): AppConfig {
    return this.config
  }

  // --- 模型管理 ---

  public getModel(id: string): AIModelConfig | undefined {
    return this.config.models.find((m) => m.id === id)
  }

  public addModel(model: Omit<AIModelConfig, 'id'>): AIModelConfig {
    const newModel: AIModelConfig = { ...model, id: crypto.randomUUID() }
    this.config.models.push(newModel)
    this.saveConfig({})
    return newModel
  }

  public updateModel(id: string, updates: Partial<AIModelConfig>): void {
    const idx = this.config.models.findIndex((m) => m.id === id)
    if (idx !== -1) {
      this.config.models[idx] = { ...this.config.models[idx], ...updates }
      this.saveConfig({})
    }
  }

  public deleteModel(id: string): void {
    this.config.models = this.config.models.filter((m) => m.id !== id)
    // 如果删除的是选中的默认模型，则重置默认 ID
    if (this.config.defaultModelId === id) {
      this.config.defaultModelId = this.config.models[0]?.id || ''
    }
    this.saveConfig({})
  }

  // --- Agent 路径管理 ---

  public getRootPath(): string {
    return OPCCLAW_ROOT
  }

  public getAgentsRootDir(): string {
    return path.join(OPCCLAW_ROOT, 'agents')
  }

  public getAgentDir(agentId: string): string {
    return path.join(this.getAgentsRootDir(), agentId)
  }

  /** 获取全局技能目录 (~/.opcclaw/skills) */
  public getGlobalSkillsDir(): string {
    return path.join(OPCCLAW_ROOT, 'skills')
  }

  public async testModel(modelConfig: AIModelConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      // 简单测试连接：发送一个极短的消息
      const provider = modelConfig.provider
      const modelId = modelConfig.model
      const apiKey = modelConfig.apiKey
      const baseUrl = modelConfig.baseUrl

      // 构造临时 Model 定义
      const API_FOR_PROVIDER: Record<string, string> = {
        openai: 'openai-completions',
        anthropic: 'anthropic-messages',
        google: 'google-generative-ai',
        groq: 'openai-completions' // groq 也是 openai 兼容
      }

      const api = API_FOR_PROVIDER[provider] || 'openai-completions'

      const testModelDef = {
        id: modelId,
        name: modelId,
        api,
        provider,
        baseUrl: baseUrl || '',
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }

      const message = await completeSimple(
        testModelDef as any,
        {
          systemPrompt: 'You are a connection tester. Reply with "OK".',
          messages: [{ role: 'user', content: 'Test connection', timestamp: Date.now() }]
        },
        { maxTokens: 10, apiKey }
      )
      if (message.stopReason === 'error') {
        throw new Error(message.errorMessage)
      }

      return { ok: true }
    } catch (err: any) {
      console.error('[ConfigService] Model test failed:', err)
      return { ok: false, error: err.message || String(err) }
    }
  }
}
