import type { Handler } from './types'
import { HeartbeatLog } from '@shared/types/gateway'

// ===================== 明确的 params 结构定义 =====================

interface HeartbeatUpdateParams {
  agentId: string
  intervalMs?: number
  enabled?: boolean
  activeHours?: { start: string; end: string }
}

interface HeartbeatAgentParams {
  agentId: string
}

interface HeartbeatSaveFileParams {
  agentId: string
  content: string
}

// ===================== Handlers =====================

/**
 * 获取心跳任务列表
 */
export const handleHeartbeatList: Handler = async (_params, _client, ctx) => {
  const tasks = ctx.registry.listHeartbeatTasks()
  return { ok: true, payload: { tasks } }
}

/**
 * 更新心跳任务配置
 */
export const handleHeartbeatUpdate: Handler = async (params, _client, ctx) => {
  const { agentId, intervalMs, enabled, activeHours } = params as HeartbeatUpdateParams
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  agent.updateHeartbeatConfig({ intervalMs, enabled, activeHours })

  // 如果是手动开启，确保启动
  if (enabled) {
    agent.startHeartbeat()
  } else {
    agent.stopHeartbeat()
  }

  // 广播更新
  ctx.broadcaster.dispatch({
    type: 'heartbeat:updated',
    agentId,
    status: agent.getHeartbeatStatus()
  })

  return { ok: true, payload: { success: true } }
}

/**
 * 立即触发心跳
 */
export const handleHeartbeatTrigger: Handler = async (params, _client, ctx) => {
  const { agentId } = params as HeartbeatAgentParams
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  // 1. 广播开始 (isRunning: true)
  ctx.broadcaster.dispatch({
    type: 'heartbeat:updated',
    agentId,
    status: agent.getHeartbeatStatus()
  })

  try {
    const result = await agent.triggerHeartbeat()

    // 2. 广播触发结果
    ctx.broadcaster.dispatch({
      type: 'heartbeat:triggered',
      agentId,
      status: agent.getHeartbeatStatus()
    })

    return { ok: true, payload: { result } }
  } finally {
    // 3. 广播结束 (isRunning: false)
    ctx.broadcaster.dispatch({
      type: 'heartbeat:updated',
      agentId,
      status: agent.getHeartbeatStatus()
    })
  }
}

/**
 * 保存/编辑 heartbeat.md 文件
 */
export const handleHeartbeatSaveFile: Handler = async (params, _client, ctx) => {
  const { agentId, content } = params as HeartbeatSaveFileParams
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const isNew = !agent.hasHeartbeatFile()
  await agent.saveHeartbeatFile(content)

  // 广播新任务创建或现有更新
  ctx.broadcaster.dispatch({
    type: isNew ? 'heartbeat:created' : 'heartbeat:updated',
    agentId,
    status: agent.getHeartbeatStatus()
  })

  return { ok: true, payload: { success: true } }
}

/**
 * 删除 heartbeat.md 文件
 */
export const handleHeartbeatDeleteFile: Handler = async (params, _client, ctx) => {
  const { agentId } = params as HeartbeatAgentParams
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  await agent.deleteHeartbeatFile()

  // 广播任务删除
  ctx.broadcaster.dispatch({
    type: 'heartbeat:deleted',
    agentId
  })

  return { ok: true, payload: { success: true } }
}

/**
 * 获取 heartbeat.md 文件内容
 */
export const handleHeartbeatGetFile: Handler = async (params, _client, ctx) => {
  const { agentId } = params as HeartbeatAgentParams
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const content = await agent.getHeartbeatFileContent()
  return { ok: true, payload: { content } }
}

interface HeartbeatLogsParams {
  agentId?: string
  limit?: number
  offset?: number
}

/**
 * 获取心跳任务执行记录
 */
export const handleHeartbeatLogs: Handler = async (params, _client, ctx) => {
  const { agentId, limit: paramLimit, offset: paramOffset } = (params || {}) as HeartbeatLogsParams
  const limit = paramLimit || 50
  const offset = paramOffset || 0

  // 1. 如果指定了特定的 Agent
  if (agentId) {
    const agent = ctx.registry.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const { items, total, hasMore } = await agent.readHeartbeatLogs({
      limit,
      offset,
      reverse: true
    })

    const logs: HeartbeatLog[] = items.map((log) => ({
      ...log,
      agentId: agent.id,
      agentName: agent.config.name || agent.id
    }))

    return { ok: true, payload: { logs, total, hasMore } }
  }

  // 2. 全局日志 (暂维持从内存中聚合最近 100 条的做法，但支持分页切片)
  const agents = ctx.registry.listAgents()
  const allLogs: HeartbeatLog[] = []

  for (const agent of agents) {
    const logs: HeartbeatLog[] = agent.instance.getHeartbeatLogs().map((log) => ({
      ...log,
      agentId: agent.id,
      agentName: agent.config.name || agent.id
    }))
    allLogs.push(...logs)
  }

  // 按时间倒序排序
  allLogs.sort((a, b) => b.timestamp - a.timestamp)

  // 应用分页
  const logs = allLogs.slice(offset, offset + limit)
  const hasMore = offset + limit < allLogs.length

  return { ok: true, payload: { logs, total: allLogs.length, hasMore } }
}
