import { ErrorCodes, errorShape } from '../protocol.js'
import type { Handler } from './types.js'

/**
 * sessions.create
 */
export const handleSessionsCreate: Handler = async (params, _client, ctx) => {
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

/**
 * sessions.list
 */
export const handleSessionsList: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessions = await agent.listSessions()
  return { ok: true, payload: { agentId, sessions } }
}

/**
 * sessions.reset
 */
export const handleSessionsReset: Handler = async (params, _client, ctx) => {
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

/**
 * sessions.delete
 */
export const handleSessionsDelete: Handler = async (params, _client, ctx) => {
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
