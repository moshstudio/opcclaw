import type { Handler } from './types'
import { ensureParams, getAgentOrError } from './handler-utils'

/**
 * sessions.create
 */
export const handleSessionsCreate: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const res = await getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const sessionKey = await agent.createSession()
  return { ok: true, payload: { agentId, sessionKey, sessionId: sessionKey } }
}

/**
 * sessions.list
 */
export const handleSessionsList: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const res = await getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const sessions = await agent.listSessions()
  return { ok: true, payload: { agentId, sessions } }
}

/**
 * sessions.reset
 */
export const handleSessionsReset: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string', sessionKey: 'string' })
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const res = await getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  await agent.resetSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * sessions.delete
 */
export const handleSessionsDelete: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string', sessionKey: 'string' })
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const res = await getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  await agent.deleteSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}
