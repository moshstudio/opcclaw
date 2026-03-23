import { ErrorCodes, errorShape } from '../protocol.js'
import type { Handler } from './types.js'
import { ensureParams, getAgentOrError } from './handler-utils.js'

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
  const res = getAgentOrError(ctx, agentId)
  if (!res.ok) return res

  const { agent } = res
  const messages = await agent.getHistory(sessionKey)
  return { ok: true, payload: { agentId, sessionKey, messages } }
}
