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
import { ChannelManager } from '../../channels/manager'
import { type AppConfig } from '@shared/types/config'
import { type Handler, safeEqual } from './types'
import { changeLanguage } from '../../../i18n'
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
 * skills:commands
 */
export const handleSkillsCommands: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string?' })
  if (!check.ok) return check

  const { agentId = 'main' } = check.values
  const agentCheck = await getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    const skillManager = agentCheck.agent.getSkillManager()
    const commands = await skillManager.listCommands()

    return {
      ok: true,
      payload: {
        agentId,
        commands
      }
    }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills.list
 */
export const handleSkillsList: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string?' })
  if (!check.ok) return check

  const { agentId = 'main' } = check.values
  const agentCheck = await getAgentOrError(ctx, agentId)
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
  const agentCheck = await getAgentOrError(ctx, agentId)
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
  const agentCheck = await getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    await agentCheck.agent.getSkillManager().updateSkill(name, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

import { SkillRepoService } from '../../skills/repo-service'

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
  const agentCheck = await getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    await agentCheck.agent.getSkillManager().deleteSkill(name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills:repo:explore
 */
export const handleSkillRepoExplore: Handler = async (params) => {
  const check = ensureParams(params, { url: 'string', branch: 'string?', refresh: 'boolean?' })
  if (!check.ok) return check

  const { url, branch = 'main', refresh = false } = check.values
  try {
    const skills = await SkillRepoService.getInstance().exploreRepo(url, branch, refresh)
    return { ok: true, payload: { skills } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * skills:repo:install
 */
export const handleSkillRepoInstall: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string?',
    target: 'string',
    url: 'string',
    branch: 'string?',
    path: 'string',
    name: 'string'
  })
  if (!check.ok) return check

  const { agentId = 'main', target, url, branch = 'main', path, name } = check.values
  const agentCheck = await getAgentOrError(ctx, agentId)
  if (!agentCheck.ok) return agentCheck

  try {
    const content = await SkillRepoService.getInstance().getSkillContent(url, path, branch)
    await agentCheck.agent
      .getSkillManager()
      .installSkill(target as 'workspace' | 'managed', name, content)
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
  const agent = await ctx.registry.ensureAgent(agentId)
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
  const newConfig = configService.getConfig()

  // 1. 判断并执行 Gateway 重启
  const gatewayChanged = JSON.stringify(oldConfig.gateway) !== JSON.stringify(newConfig.gateway)
  if (gatewayChanged) {
    // 延迟一秒重启，给响应留出时间
    setTimeout(async () => {
      await GatewayManager.getInstance().restart()
    }, 1000)
  }

  // 2. 判断并重载智能体/配置模型
  const modelChanged =
    newConfig.defaultModelId !== oldConfig.defaultModelId ||
    JSON.stringify(newConfig.models) !== JSON.stringify(oldConfig.models)

  if (modelChanged) {
    await AgentRegistry.getInstance().loadAllAgents()

    ctx.broadcaster.dispatch({
      type: 'models:list',
      models: newConfig.models,
      defaultModelId: newConfig.defaultModelId || null
    })
  }

  // 3. 判断并重启外部频道
  const channelsChanged = JSON.stringify(oldConfig.channels) !== JSON.stringify(newConfig.channels)
  if (channelsChanged) {
    setTimeout(async () => {
      await ChannelManager.getInstance().restart()
    }, 1000)
  }

  // 4. 判断并执行语言切换 (Side effects)
  if (newConfig.language && newConfig.language !== oldConfig.language) {
    await changeLanguage(newConfig.language)
    // 通知各个频道更新 (如 Telegram 注册指令)
    ChannelManager.getInstance().onLanguageChanged(newConfig.language as string)
  }

  return { ok: true }
}

/**
 * channel:telegram:test
 */
export const handleChannelTelegramTest: Handler = async (params) => {
  const check = ensureParams(params, { token: 'string', useProxy: 'boolean?' })
  if (!check.ok) return check

  const { token, useProxy } = check.values
  const result = await ChannelManager.getInstance().validateTelegramBot(token, useProxy)

  if (!result.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, result.error || 'Validation failed')
    }
  }

  return { ok: true, payload: result }
}

/**
 * channel:feishu:test
 */
export const handleChannelFeishuTest: Handler = async (params) => {
  const check = ensureParams(params, { appId: 'string', appSecret: 'string' })
  if (!check.ok) return check

  const { appId, appSecret } = check.values
  const result = await ChannelManager.getInstance().validateFeishuBot(appId, appSecret)

  if (!result.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, result.error || 'Validation failed')
    }
  }

  return { ok: true, payload: result }
}

/**
 * channel:qq:test
 */
export const handleChannelQQTest: Handler = async (params) => {
  const check = ensureParams(params, { appId: 'string', clientSecret: 'string' })
  if (!check.ok) return check

  const { appId, clientSecret } = check.values
  const result = await ChannelManager.getInstance().validateQQBot(appId, clientSecret)

  if (!result.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, result.error || 'Validation failed')
    }
  }

  return { ok: true, payload: result }
}
