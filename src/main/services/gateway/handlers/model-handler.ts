import { ConfigService } from '../../config/config-service.js'
import { ErrorCodes, errorShape } from '../protocol.js'
import type { Handler } from './types.js'

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
  const model = params as any
  if (!model) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'model config required') }
  }
  const configService = ConfigService.getInstance()
  configService.addModel(model)
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
  const p = params as { id: string; updates: any } | undefined
  if (!p?.id || !p.updates) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'id and updates required') }
  }
  const configService = ConfigService.getInstance()
  configService.updateModel(p.id, p.updates)
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
  const model = params as any
  if (!model) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'model config required') }
  }
  const configService = ConfigService.getInstance()
  const result = await configService.testModel(model)
  return { ok: true, payload: result }
}
