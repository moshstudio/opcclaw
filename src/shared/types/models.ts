/**
 * Model 相关通用类型定义 (Shared)
 */

export interface AIModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  supportsVision?: boolean
}

export interface ModelTestResult {
  ok: boolean
  error?: string
}
