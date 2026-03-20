import { ErrorCodes, errorShape } from '../protocol.js'
import type { Handler } from './types.js'

/**
 * chat.send
 */
export const handleChatSend: Handler = async (params, _client, ctx) => {
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

  // 直接执行引擎，不在这里手动开启监听。
  // 事件将通过全局 server.ts -> subscribeAll -> Broadcaster.handleAgentEvent 自动广播。
  try {
    agent.run(sessionKey, p.message)
    return { ok: true, payload: { sessionKey, sessionId: sessionKey, agentId } }
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.UNAVAILABLE, String(err)) }
  }
}

/**
 * chat.abort
 */
export const handleChatAbort: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent)
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }

  const sessionKey = p?.sessionKey || 'main'
  agent.abortSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * chat.history
 */
export const handleChatHistory: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent)
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }

  const sessionKey = p?.sessionKey || 'main'
  const messages = await agent.getHistory(sessionKey)
  return { ok: true, payload: { agentId, sessionKey, messages } }
}
