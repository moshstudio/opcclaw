import { ErrorCodes, errorShape } from '../protocol'
import type { Handler } from './types'
import { ensureParams, getAgentOrError } from './handler-utils'

/**
 * chat.send
 */
export const handleChatSend: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId', 'sessionKey', 'message'])
  if (!check.ok) return check

  const { agentId, sessionKey, message } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res

  try {
    agent.run(sessionKey, message)
    return { ok: true, payload: { sessionKey, sessionId: sessionKey, agentId } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * chat.abort
 */
export const handleChatAbort: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId', 'sessionKey'])
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  agent.abortSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * chat.history
 */
export const handleChatHistory: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, ['agentId', 'sessionKey'])
  if (!check.ok) return check

  const { agentId, sessionKey } = check.values
  const p = params as Record<string, unknown>
  const limit = p.limit
  const offset = p.offset
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const { messages, hasMore, total } = await agent.getSessionHistory(sessionKey, {
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined
  })
  return { ok: true, payload: { agentId, sessionKey, messages, hasMore, total } }
}

/**
 * chat.respondInteraction
 */
export const handleChatRespondInteraction: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string',
    interactionId: 'string',
    result: 'boolean'
  })
  if (!check.ok) return check

  const { agentId, interactionId, result } = check.values
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  agent.respondInteraction(interactionId, !!result)
  return { ok: true, payload: { agentId, interactionId } }
}
