import { Agent } from '../../agent/agent'
import { ErrorCodes, errorShape, type ErrorShape } from '../protocol'
import type { HandlerContext } from './types'

export type Result<T> = ({ ok: true } & T) | { ok: false; error: ErrorShape }

/**
 * 参数类型定义
 */
type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
type SchemaEntry = ParamType | `${ParamType}?`

/**
 * 推断 Schema 结果类型
 */
type InferSchemaType<S extends Record<string, SchemaEntry>> = {
  [K in keyof S]: S[K] extends 'string'
    ? string
    : S[K] extends 'string?'
      ? string | undefined
      : S[K] extends 'number'
        ? number
        : S[K] extends 'number?'
          ? number | undefined
          : S[K] extends 'boolean'
            ? boolean
            : S[K] extends 'boolean?'
              ? boolean | undefined
              : S[K] extends 'object'
                ? Record<string, unknown>
                : S[K] extends 'object?'
                  ? Record<string, unknown> | undefined
                  : S[K] extends 'array'
                    ? unknown[]
                    : S[K] extends 'array?'
                      ? unknown[] | undefined
                      : unknown
}

/**
 * 校验必需的参数 (函数重载)
 */
export function ensureParams<T extends string>(
  params: unknown,
  required: T[]
): Result<{ values: Record<T, unknown> }>

export function ensureParams<S extends Record<string, SchemaEntry>>(
  params: unknown,
  schema: S
): Result<{ values: InferSchemaType<S> }>

export function ensureParams(
  params: unknown,
  schema: Record<string, SchemaEntry> | string[]
): Result<Record<string, unknown>> {
  const p = params as Record<string, unknown>
  if (!p || typeof p !== 'object') {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'invalid params') }
  }

  const values: Record<string, unknown> = {}

  // 数组模式：宽松模式，仅校验字段是否存在且非空 (不再强制 string)
  if (Array.isArray(schema)) {
    for (const key of schema) {
      if (p[key] === undefined || p[key] === null) {
        return {
          ok: false,
          error: errorShape(ErrorCodes.INVALID_REQUEST, `${key} is required`)
        }
      }
      values[key] = p[key]
    }
    return { ok: true, values }
  }

  // Schema 模式：按需严格校验
  for (const [key, type] of Object.entries(schema)) {
    const isOptional = (type as string).endsWith('?')
    const baseType = isOptional ? (type as string).slice(0, -1) : (type as string)

    const val = p[key]

    // 如果未提供
    if (val === undefined || val === null) {
      if (isOptional) {
        values[key] = undefined
        continue
      }
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `${key} is required`)
      }
    }

    // 类型校验
    let isValid = false
    switch (baseType) {
      case 'string':
        isValid = typeof val === 'string'
        break
      case 'number':
        isValid = typeof val === 'number' && !isNaN(val)
        break
      case 'boolean':
        isValid = typeof val === 'boolean'
        break
      case 'object':
        isValid = typeof val === 'object' && val !== null && !Array.isArray(val)
        break
      case 'array':
        isValid = Array.isArray(val)
        break
      case 'any':
        isValid = true // 'any' 模式下只要 val 存在（前面已判定）即为合法
        break
    }

    if (!isValid) {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `${key} must be ${baseType}`)
      }
    }

    values[key] = val
  }

  return { ok: true, values }
}

/**
 * 获取 Agent 实例，若不存在则返回错误响应 (支持异步加载/自动创建)
 */
export async function getAgentOrError(
  ctx: HandlerContext,
  agentId: string
): Promise<Result<{ agent: Agent; id: string }>> {
  const agent = await ctx.registry.ensureAgent(agentId)
  if (!agent) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`)
    }
  }
  return { ok: true, agent, id: agentId }
}
