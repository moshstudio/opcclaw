import type { Handler } from './types.js'
import { ensureParams, getAgentOrError } from './handler-utils.js'

/**
 * sessions.create
 */
export const handleSessionsCreate: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId'])
  if (!check.ok) return check

  const { agentId } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const sessionKey = await agent.createSession()
  return { ok: true, payload: { agentId, sessionKey, sessionId: sessionKey } }
}

/**
 * sessions.list
 */
export const handleSessionsList: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId'])
  if (!check.ok) return check

  const { agentId } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const sessions = await agent.listSessions()
  return { ok: true, payload: { agentId, sessions } }
}

/**
 * sessions.reset
 */
export const handleSessionsReset: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId', 'sessionKey'])
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  await agent.reset(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * sessions.delete
 */
export const handleSessionsDelete: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId', 'sessionKey'])
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  await agent.deleteSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}
