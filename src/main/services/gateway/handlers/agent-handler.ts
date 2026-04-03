import { ErrorCodes, errorShape } from '../protocol'
import type { Handler } from './types'
import { ensureParams } from './handler-utils'
import { AgentConfig } from '@shared/types/agent'

/**
 * agent.list
 */
export const handleAgentList: Handler = async (_params, _client, ctx) => {
  // 确保至少有一个默认智能体存在（这会自动完成加载和兜底创建逻辑）
  await ctx.registry.ensureAgent('main')
  const agents = ctx.registry.listAgents()

  const payload = {
    agents: agents.map((a) => ({
      id: a.id,
      config: a.config
    }))
  }
  return { ok: true, payload }
}

/**
 * agent.create
 */
export const handleAgentCreate: Handler = async (params, _client, ctx) => {
  if (!params || typeof params !== 'object') {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'config required') }
  }

  const config: AgentConfig = {
    name: 'New Agent',
    ...(params as Partial<AgentConfig>)
  }

  // Registry.createAgent 内部已包含同步创建第一个 session 的逻辑
  const agentId = await ctx.registry.createAgent(config)
  const agent = ctx.registry.getAgent(agentId)
  const sessionKey = (await agent?.listSessions())?.[0]

  // 统一分流：广播新智能体创建事件
  ctx.broadcaster.dispatch({ type: 'agent:created', agentId })

  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * agent.update
 */
export const handleAgentUpdate: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const { agentId: _, ...updates } = params as Partial<AgentConfig> & { agentId: string }

  await ctx.registry.updateAgent(agentId, updates)

  // 统一分流：广播智能体配置更新事件
  ctx.broadcaster.dispatch({ type: 'agent:updated', agentId })

  return { ok: true, payload: { agentId } }
}

/**
 * agent.delete
 */
export const handleAgentDelete: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  await ctx.registry.deleteAgent(agentId)

  // 统一分流：广播智能体删除事件
  ctx.broadcaster.dispatch({ type: 'agent:deleted', agentId })

  return { ok: true, payload: { agentId } }
}
