import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ErrorCodes,
  errorShape,
  PROTOCOL_VERSION,
  GATEWAY_METHODS,
  GATEWAY_EVENTS,
  TICK_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
  type HelloOk
} from '../protocol.js'
import { builtinTools } from '../../tools/builtin.js'
import { loadWorkspaceBootstrapFiles } from '../../context/bootstrap.js'
import { ConfigService } from '../../config/config-service.js'
import { type Handler, safeEqual } from './types.js'
import { GATEWAY_EVENTS_DOC } from '@shared/metadata/events.js'

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
export const handleSkillsList: Handler = async (params, _client, _ctx) => {
  const p = params as { agentId?: string } | undefined
  const agentId = p?.agentId || 'main'
  const configService = ConfigService.getInstance()
  const agentDir = configService.getAgentDir(agentId)
  const skillsDir = path.join(agentDir, 'skills')

  try {
    await fs.access(skillsDir)
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const skills = entries
      .filter((e) => e.name.endsWith('.ts') || e.name.endsWith('.js'))
      .map((e) => ({
        name: e.name,
        path: path.join(skillsDir, e.name)
      }))
    return { ok: true, payload: { agentId, skills } }
  } catch {
    return { ok: true, payload: { agentId, skills: [] } }
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

  const stats = await agent.usage.getStats(p?.sessionKey)
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
  const config = params as any
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
      const { GatewayManager } = await import('../manager.js')
      await GatewayManager.getInstance().restart()
    }, 1000)
  }

  // 2. 如果修改了模型配置，触发广播并重载智能体
  const modelChanged =
    config.defaultModelId !== undefined && config.defaultModelId !== oldConfig.defaultModelId
  const modelsListChanged = config.models !== undefined

  if (modelChanged || modelsListChanged) {
    const { AgentRegistry } = await import('../../agent/registry.js')
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
