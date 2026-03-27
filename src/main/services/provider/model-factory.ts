import { type Model, type Api, type KnownProvider } from '@mariozechner/pi-ai'
import { type AIModelConfig } from '@shared/types/models'

const API_FOR_PROVIDER: Record<string, string> = {
  openai: 'openai-completions',
  anthropic: 'anthropic-messages',
  google: 'google-generative-ai',
  groq: 'openai-completions',
  deepseek: 'openai-completions',
  glm: 'openai-completions',
  kimi: 'openai-completions'
}

export function createModelDef(
  modelConfig: AIModelConfig,
  overrides: {
    provider?: string
    baseUrl?: string
    reasoning?: boolean
    contextTokens?: number
    supportsVision?: boolean
  } = {}
): Model<Api> {
  const provider = overrides.provider || modelConfig.provider
  const modelId = modelConfig.model
  const api = API_FOR_PROVIDER[provider] || 'openai-completions'
  const vision =
    overrides.supportsVision !== undefined ? overrides.supportsVision : !!modelConfig.supportsVision

  return {
    id: modelId,
    name: modelConfig.name || modelId,
    api: api as Api,
    provider: provider as KnownProvider,
    baseUrl: overrides.baseUrl || modelConfig.baseUrl || '',
    reasoning: overrides.reasoning !== undefined ? overrides.reasoning : true,
    input: vision ? ['text', 'image'] : ['text'],
    contextWindow: overrides.contextTokens || 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  } as Model<Api>
}
