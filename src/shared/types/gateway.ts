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

export type { Agent, Message, Usage, AgentPerformance, AIModelConfig }

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

// ============== 1. 基础业务对象 ==============

/** chat 类事件携带的运行上下文 */
export interface BizContext {
  agentId: string
  sessionKey: string
  runId: string
}

export interface InteractionPayload {
  interactionId: string
  prompt: string
  options?: string[]
  isComplete?: boolean
  rememberKey?: string
  result?: boolean
  remember?: boolean
}

export interface ToolCallPayload {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  messageId: string
}

export interface HeartbeatTaskStatus {
  enabled: boolean
  started: boolean
  isRunning: boolean
  lastRunMs: number
  nextDueMs: number
  intervalMs: number
  activeHours: { start: string; end: string }
  isWithinActiveHours: boolean
  forcedNextDueMs: number | null
}

// ============== 2. 请求映射表 ==============

export interface RequestMethodMap {
  connect: { params: { token?: string; nonce?: string }; result: HelloOk }
  'chat:send': {
    params: { agentId: string; sessionKey: string; message: string }
    result: { runId: string }
  }
  'chat:abort': { params: { runId: string }; result: void }
  'chat:history': {
    params: { agentId: string; sessionKey: string; limit?: number; offset?: number }
    result: { messages: Message[] }
  }
  'chat:respondInteraction': {
    params: { agentId: string; interactionId: string; result: boolean; remember: boolean }
    result: void
  }
  'agent:list': { params: void; result: { agents: Agent[] } }
  'agent:create': { params: { config: Partial<Agent> }; result: Agent }
  'agent:update': { params: { agentId: string; config: Partial<Agent> }; result: Agent }
  'agent:delete': { params: { agentId: string }; result: void }
  'sessions:create': { params: { agentId: string }; result: { sessionKey: string } }
  'sessions:list': { params: { agentId: string }; result: { sessionKeys: string[] } }
  'sessions:reset': { params: { agentId: string; sessionKey: string }; result: void }
  'sessions:delete': { params: { agentId: string; sessionKey: string }; result: void }
  'tools:list': { params: void; result: { tools: unknown[] } }
  'skills:list': { params: void; result: { skills: unknown[] } }
  'skills:install': { params: { name: string }; result: void }
  'skills:update': { params: { name: string }; result: void }
  'skills:delete': { params: { name: string }; result: void }
  'bootstrap:list': { params: void; result: unknown }
  'bootstrap:save': { params: unknown; result: void }
  'usage:stats': { params: void; result: unknown }
  'config:get': { params: void; result: unknown }
  'config:save': { params: unknown; result: void }
  'models:fetch': { params: void; result: void }
  'models:add': { params: { model: AIModelConfig }; result: void }
  'models:update': { params: { model: AIModelConfig }; result: void }
  'models:delete': { params: { modelId: string }; result: void }
  'models:setDefault': { params: { modelId: string }; result: void }
  'models:test': { params: { modelId: string }; result: void }
  'models:providers': { params: void; result: string[] }
  'channel:telegram:test': { params: void; result: void }
  'heartbeat:list': { params: void; result: unknown }
  'heartbeat:update': { params: { agentId: string; config: unknown }; result: void }
  'heartbeat:trigger': { params: { agentId: string }; result: void }
  'heartbeat:save-file': { params: { agentId: string; content: string }; result: void }
  'heartbeat:delete-file': { params: { agentId: string }; result: void }
  'heartbeat:get-file': { params: { agentId: string }; result: { content: string } }
  'heartbeat:logs': { params: { agentId: string }; result: unknown }
  'system:events-doc': { params: void; result: string }
  health: { params: void; result: { uptimeMs: number; clients: number; system: string } }
}

export type GatewayMethod = keyof RequestMethodMap

// ============== 3. 事件映射表（唯一事实来源，BizContext 直接内嵌）==============

/**
 * 所有 Gateway 事件的完整载荷定义。
 *
 * chat/agent 运行类事件直接内嵌 BizContext，不再通过条件类型注入。
 */
export interface EventPayloadMap {
  // --- chat 领域 (含 BizContext) ---
  'chat:start': BizContext & { messageId: string; message: Message }
  'chat:userMessage': BizContext & { messageId: string; message: Message }
  'chat:thinking': BizContext & { delta: string; messageId: string }
  'chat:delta': BizContext & { delta: string; messageId: string }
  'chat:toolCall': BizContext & ToolCallPayload
  'chat:toolResult': BizContext & {
    toolCallId: string
    toolName: string
    content: unknown
    isError: boolean
    messageId: string
  }
  'chat:retrying': BizContext & { attempt: number; delay: number; error: string; messageId: string }
  'chat:interaction': BizContext & InteractionPayload
  'chat:interaction-responded': BizContext & InteractionPayload
  'chat:final': BizContext & {
    message: Message
    messageId: string
    usage?: Usage
    performance?: AgentPerformance
    text?: string
  }
  'chat:error': BizContext & { error: string }
  // --- agent 운行态 (含 BizContext) ---
  'agent:run-start': BizContext & { model: string }
  'agent:run-end': BizContext & {
    messages: Message[]
    usage?: Usage
    performance?: AgentPerformance
  }
  'agent:run-error': BizContext & { error: string }
  'agent:skill-triggered': BizContext & { skillName: string }
  'agent:turn-start': BizContext & { sessionKey: string; runId: string; turn: number }
  'agent:turn-end': BizContext & { sessionKey: string; runId: string; turn: number }
  'agent:context-overflow': BizContext & { error: string }
  // --- 系统/全局事件 (无 BizContext) ---
  'connect:challenge': { nonce: string; ts: number }
  'agent:created': { agentId: string; agent?: Agent }
  'agent:updated': { agentId: string; agent?: Agent }
  'agent:deleted': { agentId: string }
  'session:created': { sessionKey: string; agentId: string }
  'session:reset': { sessionKey: string }
  'session:deleted': { sessionKey: string }
  // --- 通知事件 ---
  'notice:info': { sessionKey: string; runId?: string; text: string }
  'notice:compact': {
    sessionKey: string
    runId: string
    firstKeptId?: string
    summaryChars?: number
    droppedMessages?: number
  }
  'notice:warning': { sessionKey: string; text?: string; delta?: string }
  'notice:error': { sessionKey: string; text?: string; error?: string }
  'system:tick': { ts: number }
  'system:shutdown': { reason: string; restartExpectedMs: number | null }
  'heartbeat:updated': { agentId: string; status: HeartbeatTaskStatus }
  'heartbeat:triggered': { agentId: string; status: HeartbeatTaskStatus }
  'heartbeat:created': { agentId: string; status: HeartbeatTaskStatus }
  'heartbeat:deleted': { agentId: string }
  'models:list': { models: AIModelConfig[]; defaultModelId: string | null }
  'config:saved': { path: string }

  // --- 虚拟命名空间 (前端聚合订阅使用) ---
  chat: ChatPayload
  agent: AgentEventPayload
  notice: NoticePayload
  session: AgentEventPayload
  heartbeat: HeartbeatEventPayload
}

/** 所有事件动作名 */
export type GatewayAction = keyof EventPayloadMap

/** chat 类事件名（内嵌 BizContext 的那些）*/
export type ChatAction =
  | 'chat:start'
  | 'chat:userMessage'
  | 'chat:thinking'
  | 'chat:delta'
  | 'chat:toolCall'
  | 'chat:toolResult'
  | 'chat:retrying'
  | 'chat:interaction'
  | 'chat:interaction-responded'
  | 'chat:final'
  | 'chat:error'
  | 'agent:run-start'
  | 'agent:run-end'
  | 'agent:run-error'
  | 'agent:skill-triggered'
  | 'agent:turn-start'
  | 'agent:turn-end'
  | 'agent:context-overflow'

// ============== 4. 工具类型（极少泛型）==============

/**
 * 带 type 标签的具体事件——预计算好的辨别联合，无需泛型。
 * 相当于旧版 ActionToEvent<GatewayAction>。
 */
export type TaggedEvent = { [A in GatewayAction]: { type: A } & EventPayloadMap[A] }[GatewayAction]

/**
 * 按名称索引具体的带标签事件（仅此一处简单泛型）。
 * 用于 switch/cast 场景：event as EventOf<'chat:final'>
 */
export type EventOf<A extends GatewayAction> = { type: A } & EventPayloadMap[A]

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

// ============== 6. 运行时常量 ==============

export const GATEWAY_METHODS = [
  'connect',
  'chat:send',
  'chat:abort',
  'chat:history',
  'chat:respondInteraction',
  'agent:list',
  'agent:create',
  'agent:update',
  'agent:delete',
  'sessions:create',
  'sessions:list',
  'sessions:reset',
  'sessions:delete',
  'tools:list',
  'skills:list',
  'skills:install',
  'skills:update',
  'skills:delete',
  'bootstrap:list',
  'bootstrap:save',
  'usage:stats',
  'config:get',
  'config:save',
  'models:fetch',
  'models:add',
  'models:update',
  'models:delete',
  'models:setDefault',
  'models:test',
  'models:providers',
  'channel:telegram:test',
  'heartbeat:list',
  'heartbeat:update',
  'heartbeat:trigger',
  'heartbeat:save-file',
  'heartbeat:delete-file',
  'heartbeat:get-file',
  'heartbeat:logs',
  'system:events-doc',
  'health'
] as const satisfies GatewayMethod[]

export const GATEWAY_EVENTS = [
  'chat:start',
  'chat:userMessage',
  'chat:thinking',
  'chat:delta',
  'chat:toolCall',
  'chat:toolResult',
  'chat:retrying',
  'chat:interaction',
  'chat:interaction-responded',
  'chat:final',
  'chat:error',
  'agent:run-start',
  'agent:run-end',
  'agent:run-error',
  'agent:skill-triggered',
  'agent:turn-start',
  'agent:turn-end',
  'agent:context-overflow',
  'connect:challenge',
  'agent:created',
  'agent:updated',
  'agent:deleted',
  'session:created',
  'session:reset',
  'session:deleted',
  'notice:info',
  'notice:compact',
  'system:tick',
  'system:shutdown',
  'heartbeat:updated',
  'heartbeat:triggered',
  'heartbeat:created',
  'heartbeat:deleted',
  'models:list',
  'config:saved'
] as const satisfies GatewayAction[]

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

// ============== 8. 业务类型 ==============

export type HelloOk = {
  protocol: number
  methods: string[]
  events: string[]
  policy: { tickIntervalMs: number; maxPayloadBytes: number }
}

/**
 * 聊天流扁平载荷（Broadcaster 专用）。
 * 将所有 ChatAction 的字段展开为可选并集，附加链路追踪字段。
 */
export type ChatPayload = BizContext & {
  state: ChatAction
  chunkId?: string
  parentId?: string
  messageId?: string
  message?: Message
  text?: string
  usage?: Usage
  performance?: AgentPerformance
  delta?: string
  error?: string
  model?: string
  messages?: Message[]
  toolCallId?: string
  toolName?: string
  arguments?: Record<string, unknown>
  content?: unknown
  isError?: boolean
  interactionId?: string
  prompt?: string
  options?: string[]
  isComplete?: boolean
  rememberKey?: string
  result?: boolean
  remember?: boolean
  skillName?: string
}

// ============== 9. 客户端配置 ==============

export interface GatewayClientOptions {
  url: string
  token?: string
  autoReconnect?: boolean
  onEvent?: (evt: EventFrame) => void
  onConnect?: (hello: HelloOk) => void
  onClose?: (code: number, reason: string) => void
  onGap?: (gap: { expected: number; received: number }) => void
}

/** EventPayload<E> 工具类型：提取特定事件的 payload */
export type EventPayload<E extends GatewayAction> = EventPayloadMap[E]

/** TickPayload 别名 */
export type TickPayload = EventPayloadMap['system:tick']

/** ShutdownPayload 别名 */
export type ShutdownPayload = EventPayloadMap['system:shutdown']

/** heartbeat 事件 payload 联合体 */
export type HeartbeatEventPayload =
  | ({ type: 'heartbeat:updated' } & EventPayloadMap['heartbeat:updated'])
  | ({ type: 'heartbeat:triggered' } & EventPayloadMap['heartbeat:triggered'])
  | ({ type: 'heartbeat:created' } & EventPayloadMap['heartbeat:created'])
  | ({ type: 'heartbeat:deleted' } & EventPayloadMap['heartbeat:deleted'])

/** agent 局 lifecycle 事件 payload 联合体 */
export type AgentEventPayload =
  | ({
      type: 'agent:created'
      sessionKey?: string
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['agent:created'])
  | ({
      type: 'agent:updated'
      sessionKey?: string
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['agent:updated'])
  | ({
      type: 'agent:deleted'
      sessionKey?: string
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['agent:deleted'])
  | ({
      type: 'session:created'
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['session:created'])
  | ({
      type: 'session:reset'
      agentId?: string
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['session:reset'])
  | ({
      type: 'session:deleted'
      agentId?: string
      error?: string
      skillName?: string
      id?: string
    } & EventPayloadMap['session:deleted'])
  | ({ type: 'agent:run-start'; id?: string } & BizContext & { model: string })
  | ({ type: 'agent:run-end'; id?: string } & BizContext & {
        messages: Message[]
        usage?: Usage
        performance?: AgentPerformance
      })
  | ({ type: 'agent:run-error'; id?: string } & BizContext & { error: string })
  | ({ type: 'agent:skill-triggered'; id?: string } & BizContext & { skillName: string })

/** notice 事件 payload 联合体 */
export type NoticePayload = {
  type: 'notice:info' | 'notice:compact' | 'notice:warning' | 'notice:error'
  sessionKey?: string
  agentId?: string
  runId?: string
  text?: string
  delta?: string
  error?: string
  firstKeptId?: string
  summaryChars?: number
  droppedMessages?: number
}

/** models:list 的 payload */
export type ModelsPayload = { type: 'models:list' } & EventPayloadMap['models:list']

/** GatewayPayload = 任意事件 payload 的联合体（用于 reducer 类型收窄） */
export type GatewayPayload =
  | ChatPayload
  | AgentEventPayload
  | HeartbeatEventPayload
  | NoticePayload
  | ModelsPayload
