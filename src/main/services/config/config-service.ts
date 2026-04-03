import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { newUUID } from '@shared/utils/id'
import { completeSimple } from '@mariozechner/pi-ai'
import { Logger } from '@main/services/common/logger'

const OPCCLAW_ROOT = path.join(os.homedir(), app.isPackaged ? '.opcclaw' : '.opcclaw-dev')

import { type AIModelConfig, type ModelTestResult, type ModelProvider } from '@shared/types/models'
import { type AppConfig } from '@shared/types/config'
import { createModelDef } from '@main/services/provider/model-factory'

const DEFAULT_CONFIG: AppConfig = {
  models: [],
  gateway: {
    port: 18781,
    token: 'opcclaw-mini-secret',
    logLevel: 'info'
  },
  defaultModelId: '',
  channels: {
    telegram: []
  },
  language: 'zh',
  theme: 'light',
  fontSize: 14,
  interactionTimeout: 300,
  agentDefaults: {
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1.0,
    capabilities: {
      webSearch: true,
      codeExecution: true,
      vision: true
    }
  }
}

export class ConfigService extends EventEmitter {
  private static instance: ConfigService
  private configPath: string
  private config: AppConfig
  private logger = new Logger('ConfigService')

  private constructor() {
    super()
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
      this.logger.error('Failed to load config, using defaults:', err)
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
      this.emit('config-saved', this.config)
    } catch (err) {
      this.logger.error('Failed to save config:', err)
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
    const newModel: AIModelConfig = { ...model, id: newUUID() }
    this.config.models.push(newModel)

    // 如果添加的是第一个模型，自动设置为默认模型
    if (this.config.models.length === 1 || !this.config.defaultModelId) {
      this.config.defaultModelId = newModel.id
    }

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

  /** 获取全局技能目录 (OPCCLAW_ROOT/skills) */
  public getGlobalSkillsDir(): string {
    return path.join(OPCCLAW_ROOT, 'skills')
  }

  /** 获取内置技能目录 (根目录 resources/skills 或分发后的 resourcesPath) */
  public getBuiltInSkillsDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'skills')
    } else {
      return path.join(app.getAppPath(), 'resources', 'skills')
    }
  }

  public async testModel(modelConfig: AIModelConfig): Promise<ModelTestResult> {
    try {
      // 简单测试连接：发送一个极短的消息
      const apiKey = modelConfig.apiKey

      // 构造临时 Model 定义
      const testModelDef = createModelDef(modelConfig)

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
      this.logger.error('Model test failed:', err)
      return { ok: false, error: err.message || String(err) }
    }
  }

  public getProviders(): ModelProvider[] {
    return [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        defaultModel: 'deepseek-chat',
        supportsVision: false,
        thinkingSignature: 'reasoning_content',
        apiKeyUrl: 'https://platform.deepseek.com/api_keys'
      },
      {
        id: 'glm',
        name: 'Zhipu GLM (智谱)',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'GLM-5-Turbo',
        supportsVision: false,
        apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
      },
      {
        id: 'kimi',
        name: 'Moonshot Kimi (月之暗面)',
        baseUrl: 'https://api.moonshot.cn/v1',
        defaultModel: 'kimi-k2.5',
        supportsVision: true,
        apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys'
      },
      {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-5-mini',
        supportsVision: false,
        apiKeyUrl: 'https://platform.openai.com/api-keys'
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-4-5-sonnet',
        supportsVision: false,
        apiKeyUrl: 'https://console.anthropic.com/settings/keys'
      },
      {
        id: 'google',
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-3.1-pro',
        supportsVision: true,
        apiKeyUrl: 'https://aistudio.google.com/app/apikey'
      },
      {
        id: 'groq',
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama3-70b-8192',
        supportsVision: false,
        apiKeyUrl: 'https://console.groq.com/keys'
      }
    ]
  }

  public getProviderThinkingSignature(providerId: string, modelId?: string): string | undefined {
    const fromProvider = this.getProviders().find((p) => p.id === providerId)?.thinkingSignature
    if (fromProvider) return fromProvider

    // 处理某些通过通用 API (如 OpenAI/OpenRouter) 格式访问 DeepSeek 的场景
    if (modelId?.toLowerCase().includes('deepseek')) {
      return 'reasoning_content'
    }

    return undefined
  }
}
