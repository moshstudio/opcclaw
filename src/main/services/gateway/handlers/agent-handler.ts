import { ErrorCodes, errorShape } from '../protocol.js'
import type { Handler } from './types.js'

/**
 * agent.list
 */
export const handleAgentList: Handler = async (_params, _client, ctx) => {
  const agents = ctx.registry.listAgents().map((a) => ({
    id: a.id,
    config: a.config
  }))
  return { ok: true, payload: { agents } }
}

/**
 * agent.create
 */
export const handleAgentCreate: Handler = async (params, _client, ctx) => {
  const config = params as any
  if (!config) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'config required') }
  }
  const agentId = await ctx.registry.createAgent(config)

  // 广播新智能体创建事件给所有客户端
  ctx.broadcaster.agentLifecycle('agent_created', agentId)

  return { ok: true, payload: { agentId } }
}

/**
 * agent.update
 */
export const handleAgentUpdate: Handler = async (params, _client, ctx) => {
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

/**
 * agent.delete
 */
export const handleAgentDelete: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string } | undefined
  if (!p?.agentId) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'agentId required') }
  }
  await ctx.registry.deleteAgent(p.agentId)

  // 广播智能体删除事件给所有客户端
  ctx.broadcaster.agentLifecycle('agent_deleted', p.agentId)

  return { ok: true, payload: { agentId: p.agentId } }
}
