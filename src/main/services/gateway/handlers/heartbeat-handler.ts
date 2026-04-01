import type { Handler } from './types'
import { ErrorCodes, errorShape } from '../protocol'
import { ensureParams } from './handler-utils'
import type { HeartbeatLog } from '@shared/types/gateway'

// ===================== Handlers =====================

/**
 * 获取心跳任务列表
 */
export const handleHeartbeatList: Handler = async (_params, _client, ctx) => {
  const tasks = ctx.registry.listHeartbeatTasks()
  return { ok: true, payload: { tasks } }
}

export const handleHeartbeatUpdate: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string',
    intervalMs: 'number?',
    enabled: 'boolean?',
    activeHours: 'object?'
  })
  if (!check.ok) return check

  const { agentId, intervalMs, enabled, activeHours } = check.values
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
  }

  agent.updateHeartbeatConfig({
    intervalMs,
    enabled,
    activeHours: activeHours as { start: string; end: string } | undefined
  })

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

export const handleHeartbeatTrigger: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
  }

  // 1. 启动心跳任务 (触发 isRunning 状态变更)
  const heartbeatTask = agent.triggerHeartbeat()

  // 2. 广播立即触发事件 (此时 isRunning 已为 true)
  ctx.broadcaster.dispatch({
    type: 'heartbeat:triggered',
    agentId,
    status: agent.getHeartbeatStatus()
  })

  try {
    const result = await heartbeatTask
    return { ok: true, payload: { result } }
  } finally {
    // 任务完成后通常会由 agent trigger 发布更新，无需重复 dispatch
  }
}

export const handleHeartbeatSaveFile: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string',
    content: 'string'
  })
  if (!check.ok) return check

  const { agentId, content } = check.values
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
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

export const handleHeartbeatDeleteFile: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
  }

  await agent.deleteHeartbeatFile()

  // 广播任务删除
  ctx.broadcaster.dispatch({
    type: 'heartbeat:deleted',
    agentId
  })

  return { ok: true, payload: { success: true } }
}

export const handleHeartbeatGetFile: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, { agentId: 'string' })
  if (!check.ok) return check

  const { agentId } = check.values
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
  }

  const content = await agent.getHeartbeatFileContent()
  return { ok: true, payload: { content } }
}

/**
 * 获取心跳任务执行记录
 */
export const handleHeartbeatLogs: Handler = async (params, _client, ctx) => {
  const check = ensureParams(params, {
    agentId: 'string?',
    limit: 'number?',
    offset: 'number?'
  })
  if (!check.ok) return check

  const { agentId, limit: paramLimit, offset: paramOffset } = check.values
  const limit = paramLimit || 50
  const offset = paramOffset || 0

  // 1. 如果指定了特定的 Agent
  if (agentId) {
    const agent = ctx.registry.getAgent(agentId)
    if (!agent) {
      return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `Agent ${agentId} not found`) }
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
