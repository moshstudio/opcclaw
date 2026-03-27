import { ConfigService } from '../../config/config-service'
import { AgentRegistry } from '../../agent/registry'
import { ErrorCodes, errorShape } from '../protocol'
import type { Handler } from './types'
import type { AIModelConfig } from '@shared/types/models'

/**
 * models.fetch
 */
export const handleModelsFetch: Handler = async (_params, _client, ctx) => {
  const configService = ConfigService.getInstance()
  const config = configService.getConfig()
  ctx.broadcaster.dispatch({
    type: 'models:list',
    models: config.models,
    defaultModelId: config.defaultModelId || null
  })
  return { ok: true }
}

/**
 * models.add
 */
export const handleModelsAdd: Handler = async (params, _client, ctx) => {
  const model = params as AIModelConfig
  if (!model) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'model config required') }
  }
  const configService = ConfigService.getInstance()
  const oldDefault = configService.getConfig().defaultModelId
  configService.addModel(model)
  const newDefault = configService.getConfig().defaultModelId

  // 如果此操作产生了新的默认模型（通常是添加了第一个模型），刷新依赖默认模型的智能体
  if (newDefault && oldDefault !== newDefault) {
    await AgentRegistry.getInstance().refreshImpactedAgents(newDefault)
  }

  const config = configService.getConfig()
  ctx.broadcaster.dispatch({
    type: 'models:list',
    models: config.models,
    defaultModelId: config.defaultModelId || null
  })
  return { ok: true }
}

/**
 * models.update
 */
export const handleModelsUpdate: Handler = async (params, _client, ctx) => {
  const p = params as { id: string; updates: Partial<AIModelConfig> } | undefined
  if (!p?.id || !p.updates) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'id and updates required') }
  }
  const configService = ConfigService.getInstance()
  configService.updateModel(p.id, p.updates)

  // 定向刷新受影响的智能体
  await AgentRegistry.getInstance().refreshImpactedAgents(p.id)

  const config = configService.getConfig()
  ctx.broadcaster.dispatch({
    type: 'models:list',
    models: config.models,
    defaultModelId: config.defaultModelId || null
  })
  return { ok: true }
}

/**
 * models.delete
 */
export const handleModelsDelete: Handler = async (params, _client, ctx) => {
  const p = params as { id: string } | undefined
  if (!p?.id) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'id required') }
  }
  const configService = ConfigService.getInstance()
  configService.deleteModel(p.id)

  // 定向刷新受影响的智能体
  await AgentRegistry.getInstance().refreshImpactedAgents(p.id)

  const config = configService.getConfig()
  ctx.broadcaster.dispatch({
    type: 'models:list',
    models: config.models,
    defaultModelId: config.defaultModelId || null
  })
  return { ok: true }
}

/**
 * models.setDefault
 */
export const handleModelsSetDefault: Handler = async (params, _client, ctx) => {
  const p = params as { id: string } | undefined
  if (!p?.id) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'id required') }
  }
  const configService = ConfigService.getInstance()
  configService.saveConfig({ defaultModelId: p.id })

  // 刷新所有依赖默认模型的智能体
  await AgentRegistry.getInstance().refreshImpactedAgents(p.id)

  const config = configService.getConfig()
  ctx.broadcaster.dispatch({
    type: 'models:list',
    models: config.models,
    defaultModelId: config.defaultModelId || null
  })
  return { ok: true }
}

/**
 * models.test
 */
export const handleModelsTest: Handler = async (params, _client, _ctx) => {
  const model = params as AIModelConfig
  if (!model) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'model config required') }
  }
  const configService = ConfigService.getInstance()
  const result = await configService.testModel(model)
  return { ok: true, payload: result }
}
/**
 * models.providers
 */
export const handleModelsGetProviders: Handler = async (_params, _client, _ctx) => {
  const configService = ConfigService.getInstance()
  const providers = configService.getProviders()
  return { ok: true, payload: providers }
}
