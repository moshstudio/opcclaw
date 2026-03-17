import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

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
  selectedModelId?: string
}

export interface AppConfig {
  models: AIModelConfig[]
  gateway: GatewaySettings
}

const DEFAULT_CONFIG: AppConfig = {
  models: [],
  gateway: {
    port: 18789,
    token: 'openclaw-mini-secret',
    selectedModelId: ''
  }
}

export class ConfigService {
  private static instance: ConfigService
  private configPath: string
  private config: AppConfig

  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json')
    this.config = this.loadConfig()
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

  public addModel(model: AIModelConfig): void {
    this.config.models.push(model)
    this.saveConfig({})
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
    // 如果删除的是网关选中的模型，则重置网关选中 ID
    if (this.config.gateway.selectedModelId === id) {
      this.config.gateway.selectedModelId = this.config.models[0]?.id || ''
    }
    this.saveConfig({})
  }
}
