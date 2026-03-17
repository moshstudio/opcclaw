/**
 * Gateway 协议帧定义 (Shared)
 */

// ============== 协议版本 ==============

export const PROTOCOL_VERSION = 1

// ============== 帧类型 ==============

export type RequestFrame = {
  type: 'req'
  id: string
  method: string
  params?: unknown
}

export type ResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: ErrorShape
}

export type EventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq: number
}

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
  request<T = unknown>(method: string, params?: unknown): Promise<T>
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
  return isObject(f) && f.type === 'event' && typeof f.event === 'string'
}

// ============== 常量 ==============

export const TICK_INTERVAL_MS = 30_000
export const MAX_PAYLOAD_BYTES = 512 * 1024
export const MAX_BUFFERED_BYTES = 1.5 * 1024 * 1024
export const HANDSHAKE_TIMEOUT_MS = 10_000
export const REQUEST_TIMEOUT_MS = 60_000

export const GATEWAY_METHODS = [
  'connect',
  'agent.list',
  'chat.send',
  'chat.history',
  'sessions.list',
  'sessions.reset',
  'health'
] as const

export const GATEWAY_EVENTS = ['connect.challenge', 'tick', 'agent', 'chat', 'shutdown'] as const
