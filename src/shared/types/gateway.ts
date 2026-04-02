/**
 * Gateway 协议契约 (Physical Port Contract)
 *
 * 设计原则：单一事实来源，最小化泛型。
 * - 所有请求：RequestMethodMap
 * - 所有事件：EventPayloadMap（BizContext 直接内嵌，无条件类型）
 * - 运行时数组：as const satisfies 自动校验
 */

import type { Usage } from '@mariozechner/pi-ai'
import type { Agent, Message, AgentPerformance } from './agent'
import type { AIModelConfig } from './models'
import { type RequestMethodMap, type GatewayMethod, type HelloOk } from './gateway/in'
import { type GatewayAction } from './gateway/out'
export * from './gateway/out'

export type {
  Agent,
  Message,
  Usage,
  AgentPerformance,
  AIModelConfig,
  RequestMethodMap,
  GatewayMethod,
  HelloOk
}

// ============== 0. Heartbeat 日志类型（供 heartbeat.ts 使用）==============

export type HeartbeatLogStatus = 'success' | 'skipped' | 'failed'

export interface HeartbeatLogEntry {
  id: string
  timestamp: number
  reason: string
  status: HeartbeatLogStatus
  message?: string
  durationMs?: number
}

/** 含 agentId/name 的展开版日志（用于跨 agent 聚合展示） */
export interface HeartbeatLog extends HeartbeatLogEntry {
  agentId: string
  agentName: string
}

// ============== 5. 物理帧（无泛型）==============

export type RequestFrame = {
  type: 'req'
  id: string
  method: GatewayMethod
  params: unknown
}

export type ResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload: unknown
  error?: ErrorShape
}

export type EventFrame = {
  type: 'event'
  event: GatewayAction
  payload: unknown
  seq: number
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame

export const isRequestFrame = (f: unknown): f is RequestFrame => {
  const q = f as RequestFrame
  return q != null && q.type === 'req' && typeof q.method === 'string'
}

export const isResponseFrame = (f: unknown): f is ResponseFrame => {
  const q = f as ResponseFrame
  return q != null && q.type === 'res' && typeof q.id === 'string'
}

export const isEventFrame = (f: unknown): f is EventFrame => {
  const q = f as EventFrame
  return q != null && q.type === 'event' && typeof q.event === 'string'
}

// ============== 7. 错误处理与协议常量 ==============

export const PROTOCOL_VERSION = 1
export const MAX_BUFFERED_BYTES = 1.5 * 1024 * 1024
export const MAX_PAYLOAD_BYTES = 1.5 * 1024 * 1024
export const TICK_INTERVAL_MS = 30_000
export const HANDSHAKE_TIMEOUT_MS = 10_000
export const REQUEST_TIMEOUT_MS = 60_000

export enum ErrorCodes {
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAVAILABLE = 'UNAVAILABLE',
  NOT_FOUND = 'NOT_FOUND'
}

export type ErrorShape = { code: ErrorCodes; message: string }
export const errorShape = (code: ErrorCodes, message: string): ErrorShape => ({ code, message })
