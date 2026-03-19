/**
 * Gateway RPC 方法实现
 *
 * 对齐 OpenClaw:
 * - server-methods/connect.ts → connect 握手验证
 * - server-methods/chat.ts → chat.send / chat.history
 * - server-methods/sessions.ts → sessions.list / sessions.reset
 * - server-methods/health.ts → health
 *
 * Handler 签名对齐 openclaw GatewayRequestHandler:
 *   (params, client, ctx) → { ok, payload?, error? }
 */

import { timingSafeEqual } from 'node:crypto'
import type { AgentRegistry } from '@main/services/agent/registry'
import type { MiniAgentEvent } from '@main/services/agent/agent-events'
import {
  ErrorCodes,
  errorShape,
  PROTOCOL_VERSION,
  GATEWAY_METHODS,
  GATEWAY_EVENTS,
  TICK_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
  type HelloOk,
  type ErrorShape
} from './protocol.js'
import { builtinTools } from '../tools/builtin.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadWorkspaceBootstrapFiles } from '../context/bootstrap.js'
import { ConfigService } from '../config/config-service.js'
import { Broadcaster, type BroadcastFn } from './broadcaster.js'

// ============== 类型 ==============

export type GwClient = {
  id: string
  socket: {
    send: (data: string) => void
    close: (code?: number, reason?: string) => void
    bufferedAmount: number
  }
  authed: boolean
}

export type HandlerContext = {
  registry: AgentRegistry
  broadcast: BroadcastFn
  broadcaster: Broadcaster
  clients: Set<GwClient>
  token?: string
  nonces: Map<string, string>
  startedAt: number
}

export type HandlerResult = { ok: boolean; payload?: unknown; error?: ErrorShape }
export type Handler = (
  params: unknown,
  client: GwClient,
  ctx: HandlerContext
) => Promise<HandlerResult>

// ============== 安全工具（对齐 openclaw auth.ts safeEqual） ==============

/** 防计时攻击的字符串比较 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// ============== connect ==============

const handleConnect: Handler = async (params, client, ctx) => {
  const p = params as { token?: string; nonce?: string } | undefined

  // token 验证（对齐 openclaw auth.ts: timingSafeEqual 防计时攻击）
  if (ctx.token) {
    if (!p?.token || !safeEqual(p.token, ctx.token)) {
      return { ok: false, error: errorShape(ErrorCodes.UNAUTHORIZED, 'invalid token') }
    }
  }

  // nonce 验证（对齐 openclaw challenge-response）
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

// ============== chat.send ==============

/**
 * 对齐 openclaw server-methods/chat.ts:
 * 1. 立即返回 { runId } (ACK)
 * 2. 异步执行 agent.run()
 * 3. agent 事件流 → broadcast("agent") + broadcast("chat" delta/final)
 */
const handleChatSend: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string; message?: string } | undefined
  if (!p?.message) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'message required') }
  }

  const agentId = p.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  let sessionKey = p.sessionKey
  if (!sessionKey || sessionKey === 'main') {
    sessionKey = await agent.createSession()
  }

  // 开始新运行前，先终止该会话中可能存在的旧运行（标准行为，防止输出重叠）
  agent.abortSession(sessionKey)

  // 追踪 agent 内部的 runId（通过 agent_start 事件获取）
  let agentRunId: string | undefined

  // Delta 限流状态
  let deltaBuffer = ''
  let lastDeltaSentAt = 0
  let lastDeltaSentLen = 0 // 上次广播时 buffer 的长度，用于计算新增部分
  const DELTA_THROTTLE_MS = 150

  // 辅助函数：统一处理 chat 事件的 delta/final 分发
  const emitChatState = (
    state: 'delta' | 'final' | 'error',
    event?: { text?: string; message?: any; usage?: any; performance?: any; error?: string }
  ) => {
    const fullText = event?.text ?? deltaBuffer
    const text = fullText.slice(lastDeltaSentLen)
    lastDeltaSentLen = fullText.length

    ctx.broadcaster.chat({
      agentId,
      runId: agentRunId,
      sessionKey,
      state,
      text,
      message: event?.message,
      usage: event?.usage,
      performance: event?.performance,
      error: event?.error
    })
  }

  // 异步执行，不阻塞响应（对齐 openclaw chat.send 的 ACK-then-stream 模式）
  const unsub = agent.subscribe((event: MiniAgentEvent) => {
    // 捕获 agent 内部 runId，用于后续事件关联
    if (event.type === 'agent_start' && event.sessionKey === sessionKey) {
      agentRunId = event.runId
    }

    // 仅转发属于本次 run 的事件（按 sessionKey 过滤，避免并发混杂）
    const eventRunId = 'runId' in event ? (event as { runId: string }).runId : undefined
    if (eventRunId && eventRunId !== agentRunId) return

    // 桥接 agent 事件 → gateway 广播
    ctx.broadcaster.agentBridge(agentId, sessionKey, agentRunId, event)

    // 状态转换逻辑
    switch (event.type) {
      case 'message_start':
        ctx.broadcaster.chat({
          agentId,
          runId: agentRunId,
          sessionKey,
          state: 'start',
          message: event.message
        })
        break

      case 'message_delta': {
        deltaBuffer += event.delta
        const now = Date.now()
        // 增量限流发送
        if (now - lastDeltaSentAt >= DELTA_THROTTLE_MS) {
          lastDeltaSentAt = now
          emitChatState('delta')
        }
        break
      }

      case 'message_end':
        // 强制刷新缓冲区并发送结束状态
        emitChatState('final', {
          text: event.text,
          message: event.message,
          usage: event.usage
        })
        break

      case 'agent_end':
        // Agent 运行彻底结束，包含累积用量和性能指标
        emitChatState('final', {
          usage: event.usage,
          performance: event.performance
        })
        break

      case 'agent_error':
        emitChatState('error', { error: event.error })
        break
    }
  })

  // 启动运行逻辑
  try {
    // 向 agent 发起主循环请求
    agent.run(sessionKey, p.message).finally(() => unsub())

    // 立即响应 ACK，包含最终确定的 sessionKey
    return { ok: true, payload: { sessionKey, sessionId: sessionKey, agentId } }
  } catch (err) {
    // 捕获启动时的同步错误（例如模型配置缺失）
    unsub()
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, String(err))
    }
  }
}

// ============== chat.abort ==============

const handleChatAbort: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  agent.abortSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

// ============== chat.history ==============

const handleChatHistory: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  const messages = await agent.getHistory(sessionKey)
  return { ok: true, payload: { agentId, sessionKey, messages } }
}

// ============== sessions.create ==============
const handleSessionsCreate: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }
  const sessionKey = await agent.createSession()

  // 广播新会话创建事件给所有客户端
  ctx.broadcaster.sessionEvent('session_created', agentId, sessionKey)

  return { ok: true, payload: { agentId, sessionKey, sessionId: sessionKey } }
}

// ============== sessions.list ==============

const handleSessionsList: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessions = await agent.listSessions()
  return { ok: true, payload: { agentId, sessions } }
}

// ============== sessions.reset ==============

const handleSessionsReset: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  await agent.reset(sessionKey)

  // 广播重置事件给所有客户端
  ctx.broadcaster.sessionEvent('session_reset', agentId, sessionKey)

  return { ok: true, payload: { agentId, sessionKey } }
}

// ============== sessions.delete ==============

const handleSessionsDelete: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  await agent.deleteSession(sessionKey)

  // 广播删除事件给所有客户端
  ctx.broadcaster.sessionEvent('session_deleted', agentId, sessionKey)

  return { ok: true, payload: { agentId, sessionKey } }
}

// ============== health ==============

const handleHealth: Handler = async (_params, _client, ctx) => {
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

// ============== agent.list ==============

const handleAgentList: Handler = async (_params, _client, ctx) => {
  const agents = ctx.registry.listAgents().map((a) => ({
    id: a.id,
    config: a.config
  }))
  return { ok: true, payload: { agents } }
}

// ============== agent.create ==============

const handleAgentCreate: Handler = async (params, _client, ctx) => {
  const config = params as any
  if (!config) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'config required') }
  }
  const agentId = await ctx.registry.createAgent(config)

  // 广播新智能体创建事件给所有客户端
  ctx.broadcaster.agentLifecycle('agent_created', agentId)

  return { ok: true, payload: { agentId } }
}

// ============== agent.update ==============

const handleAgentUpdate: Handler = async (params, _client, ctx) => {
  const p = params as { agentId: string; [key: string]: any } | undefined
  if (!p?.agentId) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, 'agentId required for update')
    }
  }
  const { agentId, ...updates } = p
  await ctx.registry.updateAgent(agentId, updates)

  // 广播智能体配置更新事件给所有客户端
  ctx.broadcaster.agentLifecycle('agent_updated', agentId)

  return { ok: true, payload: { agentId } }
}

// ============== agent.delete ==============

const handleAgentDelete: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string } | undefined
  if (!p?.agentId) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'agentId required') }
  }
  await ctx.registry.deleteAgent(p.agentId)

  // 广播智能体删除事件给所有客户端
  ctx.broadcaster.agentLifecycle('agent_deleted', p.agentId)

  return { ok: true, payload: { agentId: p.agentId } }
}

// ============== tools.list ==============

const handleToolsList: Handler = async (_params, _client, _ctx) => {
  const tools = builtinTools.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    inputSchema: t.inputSchema
  }))
  return { ok: true, payload: { tools } }
}

// ============== skills.list ==============

const handleSkillsList: Handler = async (params, _client, ctx) => {
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
    // 目录不存在
    return { ok: true, payload: { agentId, skills: [] } }
  }
}

// ============== bootstrap.list ==============

const handleBootstrapList: Handler = async (params, _client, _ctx) => {
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

// ============== bootstrap.save ==============

const handleBootstrapSave: Handler = async (params, _client, ctx) => {
  const p = params as { path?: string; content?: string } | undefined
  if (!p?.path || p.content === undefined) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, 'path and content required')
    }
  }

  try {
    await fs.writeFile(p.path, p.content, 'utf-8')

    // 广播配置/预设更新事件给所有客户端
    ctx.broadcaster.bootstrapSaved(p.path)

    return { ok: true, payload: { path: p.path } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

// ============== usage.stats ==============

const handleUsageStats: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const stats = await agent.usage.getStats(p?.sessionKey)
  return { ok: true, payload: { stats } }
}

// ============== 方法注册表 ==============

export const handlers: Record<string, Handler> = {
  connect: handleConnect,
  'agent.list': handleAgentList,
  'agent.create': handleAgentCreate,
  'agent.update': handleAgentUpdate,
  'agent.delete': handleAgentDelete,
  'chat.send': handleChatSend,
  'chat.abort': handleChatAbort,
  'chat.history': handleChatHistory,
  'sessions.create': handleSessionsCreate,
  'sessions.list': handleSessionsList,
  'sessions.reset': handleSessionsReset,
  'sessions.delete': handleSessionsDelete,
  'tools.list': handleToolsList,
  'skills.list': handleSkillsList,
  'bootstrap.list': handleBootstrapList,
  'bootstrap.save': handleBootstrapSave,
  'usage.stats': handleUsageStats,
  health: handleHealth
}
