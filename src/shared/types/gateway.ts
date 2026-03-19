/**
 * Gateway 协议帧定义 (Shared)
 */

import type { Message, Usage, AgentPerformance } from './agent.js'
import type { AIModelConfig } from './models.js'


// ============== 协议版本 ==============

export const PROTOCOL_VERSION = 1

// ============== 协议列表 ==============

export const GATEWAY_METHODS = [
  'connect',
  'agent.list',
  'agent.create',
  'agent.delete',
  'sessions.list',
  'sessions.create',
  'sessions.reset',
  'sessions.delete',
  'chat.send',
  'chat.abort',
  'chat.history',

  'usage.stats',
  'config.get',
  'config.save',
  'models.fetch',
  'models.add',
  'models.update',
  'models.delete',
  'models.setDefault',
  'models.test',
  'health'
] as const

export const GATEWAY_EVENTS = [
  'connect.challenge',
  'tick',
  'agent',
  'chat',
  'models',
  'shutdown'
] as const

export type GatewayMethod = (typeof GATEWAY_METHODS)[number]
export type GatewayEvent = (typeof GATEWAY_EVENTS)[number]

// ============== 帧类型 ==============

export type RequestFrame = {
  type: 'req'
  id: string
  method: GatewayMethod
  params?: unknown
}


export type ResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: ErrorShape
}

export type EventFrame =
  | { type: 'event'; event: 'chat'; payload: ChatPayload; seq: number }
  | { type: 'event'; event: 'agent'; payload: AgentEventPayload; seq: number }
  | { type: 'event'; event: 'models'; payload: ModelsPayload; seq: number }
  | { type: 'event'; event: 'tick'; payload: TickPayload; seq: number }
  | { type: 'event'; event: 'shutdown'; payload: ShutdownPayload; seq: number }
  | { type: 'event'; event: 'connect.challenge'; payload: { nonce: string; ts: number }; seq: number }



export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame

export type GatewayClientOptions = {
  url: string
  token?: string
  onEvent?: (event: EventFrame) => void
  onClose?: (code: number, reason: string) => void
  /** 连接成功回调（含重连） */
  onConnect?: (hello: HelloOk) => void
  /** 事件序列号间隙回调（对齐 openclaw onGap） */
  onGap?: (info: { expected: number; received: number }) => void
  /** 是否启用自动重连（默认 true） */
  autoReconnect?: boolean
}

export interface IGatewayClient {
  connect(): Promise<HelloOk>
  request<T = unknown>(method: GatewayMethod, params?: unknown): Promise<T>
  close(): void
}

// ============== 错误 ==============

export type ErrorShape = { code: string; message: string }

export const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND'
} as const

export function errorShape(code: string, message: string): ErrorShape {
  return { code, message }
}

// ============== 握手响应 ==============

export type HelloOk = {
  protocol: number
  methods: string[]
  events: string[]
  policy: { tickIntervalMs: number; maxPayloadBytes: number }
}

// ============== 帧验证（类型守卫） ==============

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isRequestFrame(f: unknown): f is RequestFrame {
  return isObject(f) && f.type === 'req' && typeof f.id === 'string' && typeof f.method === 'string'
}

export function isResponseFrame(f: unknown): f is ResponseFrame {
  return isObject(f) && f.type === 'res' && typeof f.id === 'string' && typeof f.ok === 'boolean'
}

export function isEventFrame(f: unknown): f is EventFrame {
  return isObject(f) && f.type === 'event' && GATEWAY_EVENTS.includes(f.event as any)
}


// ============== 常量 ==============

export const TICK_INTERVAL_MS = 30_000
export const MAX_PAYLOAD_BYTES = 512 * 1024
export const MAX_BUFFERED_BYTES = 1.5 * 1024 * 1024
export const HANDSHAKE_TIMEOUT_MS = 10_000
export const REQUEST_TIMEOUT_MS = 60_000



// ============== 广播 Payload 定义 ==============

/** 聊天状态类型 */
export type ChatState = 'start' | 'delta' | 'final' | 'error'

/** chat 频道负载：主要用于流式输出文本和最终结果 */
export interface ChatPayload {
  agentId: string
  sessionKey: string
  runId?: string
  /** 当前分片的唯一 ID */
  chunkId?: string
  /** 父分片的 ID，首个分片为 null 或 undefined */
  parentId?: string
  state: ChatState
  /** 增量文本 (state=delta) 或完整文本 (state=final) */
  text?: string
  /** 完整的消息对象 (state=start/final) */
  message?: Message
  /** 累计用量 */
  usage?: Usage
  /** 性能指标 */
  performance?: AgentPerformance
  /** 错误信息 */
  error?: string
}

/** agent 频道负载：主要用于生命周期管理和智能体内部事件转发 */
export interface AgentEventPayload {
  /**
   * 事件类型：
   * - 管理类：session_created, agent_updated 等
   * - 桥接类：agent_start, message_delta 等 (透传自 MiniAgentEvent)
   */
  type: string
  agentId?: string
  sessionKey?: string
  runId?: string
  [key: string]: unknown
}

/** models 频道负载：模型列表更新 */
export interface ModelsPayload {
  type: 'models.list'
  models: AIModelConfig[]
  defaultModelId: string | null
}

/** tick 频道负载：系统分发心跳 */
export interface TickPayload {
  ts: number
}

/** shutdown 频道负载：系统停放预警 */
export interface ShutdownPayload {
  reason: string
  restartExpectedMs: number | null
}

