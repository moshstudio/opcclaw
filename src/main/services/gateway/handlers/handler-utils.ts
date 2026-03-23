import { Agent } from '../../agent/agent.js'
import { ErrorCodes, errorShape, type ErrorShape } from '../protocol.js'
import type { HandlerContext } from './types.js'

export type Result<T> = ({ ok: true } & T) | { ok: false; error: ErrorShape }

/**
 * 校验必需的字符串参数
 */
export function ensureParams<T extends string>(
  params: unknown,
  required: T[]
): Result<{ values: Record<T, string> }> {
  const p = params as Record<string, any>
  if (!p || typeof p !== 'object') {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'invalid params') }
  }
  const values = {} as Record<T, string>
  for (const key of required) {
    if (typeof p[key] !== 'string') {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `${key} required as string`)
      }
    }
    values[key] = p[key]
  }
  return { ok: true, values }
}

/**
 * 获取 Agent 实例，若不存在则返回错误响应
 */
export function getAgentOrError(
  ctx: HandlerContext,
  agentId: string
): Result<{ agent: Agent; id: string }> {
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`)
    }
  }
  return { ok: true, agent, id: agentId }
}
