import { ErrorCodes, errorShape } from '../protocol'
import type { Handler } from './types'
import { ensureParams } from './handler-utils'
import { AgentConfig } from '@shared/types/agent'

/**
 * agent.list
 */
export const handleAgentList: Handler = async (_params, _client, ctx) => {
  let agents = ctx.registry.listAgents()

  // 1. 如果内存列表为空，先尝试从磁盘加载
  if (agents.length === 0) {
    await ctx.registry.loadAllAgents()
    agents = ctx.registry.listAgents()
  }

  // 2. 如果加载后依然为空，说明是初次运行或已被清空，自动兜底创建默认智能体 (main)
  if (agents.length === 0) {
    await ctx.registry.createDefaultAgent('main')
    agents = ctx.registry.listAgents()
  }

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
  const check = ensureParams(params, ['agentId'])
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
  const check = ensureParams(params, ['agentId'])
  if (!check.ok) return check

  const { agentId } = check.values
  await ctx.registry.deleteAgent(agentId)

  // 统一分流：广播智能体删除事件
  ctx.broadcaster.dispatch({ type: 'agent:deleted', agentId })

  return { ok: true, payload: { agentId } }
}
