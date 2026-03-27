import fs from 'node:fs/promises'
import {
  ErrorCodes,
  errorShape,
  PROTOCOL_VERSION,
  GATEWAY_METHODS,
  GATEWAY_EVENTS,
  TICK_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
  type HelloOk
} from '../protocol'
import { builtinTools } from '../../tools/builtin'
import { loadWorkspaceBootstrapFiles } from '../../context/bootstrap'
import { ConfigService } from '../../config/config-service'
import { AgentRegistry } from '../../agent/registry'
import { GatewayManager } from '../manager'
import { type AppConfig } from '@shared/types/config'
import { type Handler, safeEqual } from './types'
import { GATEWAY_EVENTS_DOC } from '@shared/metadata/events'
import { ensureParams, getAgentOrError } from './handler-utils'

/**
 * system:events-doc
 */
export const handleEventsDoc: Handler = async (_params, _client, _ctx) => {
  return { ok: true, payload: { events: GATEWAY_EVENTS_DOC } }
}

/**
 * connect
 */
export const handleConnect: Handler = async (params, client, ctx) => {
  const p = params as { token?: string; nonce?: string } | undefined

  // token 验证
  if (ctx.token) {
    if (!p?.token || !safeEqual(p.token, ctx.token)) {
      return { ok: false, error: errorShape(ErrorCodes.UNAUTHORIZED, 'invalid token') }
    }
  }

  // nonce 验证
  const expectedNonce = ctx.nonces.get(client.id)
  if (expectedNonce && p?.nonce !== expectedNonce) {
    return { ok: false, error: errorShape(ErrorCodes.UNAUTHORIZED, 'nonce mismatch') }
  }
  ctx.nonces.delete(client.id)

  client.authed = true

  const hello: HelloOk = {
    protocol: PROTOCOL_VERSION,
    methods: [...GATEWAY_METHODS],
    events: [...GATEWAY_EVENTS],
    policy: { tickIntervalMs: TICK_INTERVAL_MS, maxPayloadBytes: MAX_PAYLOAD_BYTES }
  }
  return { ok: true, payload: hello }
}

/**
 * health
 */
export const handleHealth: Handler = async (_params, _client, ctx) => {
  return {
    ok: true,
    payload: {
      uptimeMs: Date.now() - ctx.startedAt,
      agents: ctx.registry.listAgents().length,
      clients: ctx.clients.size,
      authedClients: [...ctx.clients].filter((c) => c.authed).length
    }
  }
}

/**
 * tools.list
 */
export const handleToolsList: Handler = async (_params, _client, _ctx) => {
  const tools = builtinTools.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    inputSchema: t.inputSchema
  }))
  return { ok: true, payload: { tools } }
}

/**
 * skills.list
 */
export const handleSkillsList: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string?' })
  if (!check.ok) return check

  const { agentId = 'main' } = check.values
  const agentCheck = getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    const skillManager = agentCheck.agent.getSkillManager()
    const skills = await skillManager.list()

    return {
      ok: true,
      payload: {
        agentId,
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
          source: s.source,
          path: s.filePath,
          baseDir: s.baseDir
        }))
      }
    }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills.install
 */
export const handleSkillInstall: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string?',
    target: 'string',
    name: 'string',
    content: 'string'
  })
  if (!check.ok) return check

  const { agentId = 'main', target, name, content } = check.values
  const agentCheck = getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    await agentCheck.agent
      .getSkillManager()
      .installSkill(target as 'workspace' | 'managed', name, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills.update
 */
export const handleSkillUpdate: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string?',
    name: 'string',
    content: 'string'
  })
  if (!check.ok) return check

  const { agentId = 'main', name, content } = check.values
  const agentCheck = getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    await agentCheck.agent.getSkillManager().updateSkill(name, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills.delete
 */
export const handleSkillDelete: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string?',
    name: 'string'
  })
  if (!check.ok) return check

  const { agentId = 'main', name } = check.values
  const agentCheck = getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    await agentCheck.agent.getSkillManager().deleteSkill(name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * bootstrap:list
 */
export const handleBootstrapList: Handler = async (params, _client, _ctx) => {
  const p = params as { workspaceDir?: string } | undefined
  if (!p?.workspaceDir) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'workspaceDir required') }
  }

  try {
    const files = await loadWorkspaceBootstrapFiles(p.workspaceDir)
    return { ok: true, payload: { files } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * bootstrap:save
 */
export const handleBootstrapSave: Handler = async (params, _client, ctx) => {
  const p = params as { path?: string; content?: string } | undefined
  if (!p?.path || p.content === undefined) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, 'path and content required')
    }
  }

  try {
    await fs.writeFile(p.path, p.content, 'utf-8')
    ctx.broadcaster.dispatch({ type: 'config:saved', path: p.path })
    return { ok: true, payload: { path: p.path } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * usage:stats
 */
export const handleUsageStats: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const stats = await agent.getUsageManager().getStats(p?.sessionKey)
  return { ok: true, payload: { stats } }
}

/**
 * config:get
 */
export const handleConfigGet: Handler = async (_params, _client, _ctx) => {
  return { ok: true, payload: ConfigService.getInstance().getConfig() }
}

/**
 * config:save
 */
export const handleConfigSave: Handler = async (params, _client, ctx) => {
  const config = params as Partial<AppConfig>
  if (!config) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'config required') }
  }

  const configService = ConfigService.getInstance()
  const oldConfig = configService.getConfig()
  configService.saveConfig(config)

  // 1. 如果修改了网关配置，执行重启 (异步执行，不阻塞响应)
  if (config.gateway) {
    // 延迟一秒重启，给响应留出时间
    setTimeout(async () => {
      await GatewayManager.getInstance().restart()
    }, 1000)
  }

  // 2. 如果修改了模型配置，触发广播并重载智能体
  const modelChanged =
    config.defaultModelId !== undefined && config.defaultModelId !== oldConfig.defaultModelId
  const modelsListChanged = config.models !== undefined

  if (modelChanged || modelsListChanged) {
    await AgentRegistry.getInstance().loadAllAgents()

    const newConfig = configService.getConfig()
    ctx.broadcaster.dispatch({
      type: 'models:list',
      models: newConfig.models,
      defaultModelId: newConfig.defaultModelId || null
    })
  }

  return { ok: true }
}
