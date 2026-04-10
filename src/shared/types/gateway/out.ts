import type { Usage } from '@mariozechner/pi-ai'
import type { Agent, Message, AgentPerformance, InteractionResult } from '../agent'
import type { AIModelConfig } from '../models'
import type { HelloOk } from './in'

// ============== 0. 基础业务对象 & 组合辅助 ==============

/** chat/agent 类事件自带的运行上下文 */
export interface BizContext {
  agentId: string
  sessionKey: string
  runId: string
}

/** 链路追踪字段 */
export interface ChatTrack {
  type: string
  chunkId: string
  parentId?: string
}

/** 将 Payload 注入 BizContext 的快捷工具 */
type WithBiz<T> = BizContext & T

export interface InteractionPayload {
  interactionId: string
  prompt: string
  options?: string[]
  isComplete?: boolean
  rememberKey?: string
  result?: InteractionResult
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

// ============== 1. 具名事件 Payload 定义 (原子层) ==============

// --- Chat 相关 ---
export type ChatMessageBody = { messageId: string; message: Message }
export type ChatDeltaBody = { delta: string; messageId: string }
export type ChatFinalBody = {
  message: Message
  messageId: string
  usage?: Usage
  performance?: AgentPerformance
  text?: string
}
export type ChatErrorBody = { error: string }
export type ChatRetryingBody = { attempt: number; delay: number; error: string; messageId: string }
export type ChatToolResultBody = {
  toolCallId: string
  toolName: string
  content: unknown
  isError: boolean
  messageId: string
}

// --- Agent 相关 ---
export type AgentRunStartBody = { model: string }
export type AgentRunEndBody = { messages: Message[]; usage?: Usage; performance?: AgentPerformance }
export type AgentSkillTriggeredBody = { skillName: string }
export type AgentTurnBody = { turn: number }

// ============== 2. 事件映射表 (唯一事实来源) ==============

const EVENT_REGISTRY = {
  // --- chat 领域 ---
  'chat:start': {} as WithBiz<ChatMessageBody>,
  'chat:userMessage': {} as WithBiz<ChatMessageBody>,
  'chat:thinking': {} as WithBiz<ChatDeltaBody>,
  'chat:delta': {} as WithBiz<ChatDeltaBody>,
  'chat:toolCall': {} as WithBiz<ToolCallPayload>,
  'chat:toolResult': {} as WithBiz<ChatToolResultBody>,
  'chat:retrying': {} as WithBiz<ChatRetryingBody>,
  'chat:interaction': {} as WithBiz<InteractionPayload>,
  'chat:interaction-responded': {} as WithBiz<InteractionPayload>,
  'chat:final': {} as WithBiz<ChatFinalBody>,
  'chat:error': {} as WithBiz<ChatErrorBody>,

  // --- agent 运行态 ---
  'agent:run-start': {} as WithBiz<AgentRunStartBody>,
  'agent:run-end': {} as WithBiz<AgentRunEndBody>,
  'agent:run-error': {} as WithBiz<ChatErrorBody>,
  'agent:skill-triggered': {} as WithBiz<AgentSkillTriggeredBody>,
  'agent:turn-start': {} as WithBiz<AgentTurnBody>,
  'agent:turn-end': {} as WithBiz<AgentTurnBody>,
  'agent:context-overflow': {} as WithBiz<ChatErrorBody>,

  // --- 生命周期 ---
  'connect:challenge': {} as { nonce: string; ts: number },
  'agent:created': {} as { agentId: string; agent?: Agent },
  'agent:updated': {} as { agentId: string; agent?: Agent },
  'agent:deleted': {} as { agentId: string },
  'agent:list': {} as { agents: Agent[] },
  'session:created': {} as { sessionKey: string; agentId: string },
  'session:reset': {} as { sessionKey: string; agentId: string },
  'session:deleted': {} as { sessionKey: string; agentId: string },

  // --- 通知 ---
  'notice:info': {} as { sessionKey: string; runId?: string; text: string },
  'notice:compact': {} as {
    sessionKey: string
    runId: string
    firstKeptId?: string
    summaryChars?: number
    droppedMessages?: number
  },
  'notice:warning': {} as { sessionKey: string; text?: string; delta?: string },
  'notice:error': {} as { sessionKey: string; text?: string; error?: string },
  'system:tick': {} as { ts: number },
  'system:shutdown': {} as { reason: string; restartExpectedMs: number | null },

  // --- 心跳 ---
  'heartbeat:updated': {} as { agentId: string; status: HeartbeatTaskStatus },
  'heartbeat:triggered': {} as { agentId: string; status: HeartbeatTaskStatus },
  'heartbeat:created': {} as { agentId: string; status: HeartbeatTaskStatus },
  'heartbeat:deleted': {} as { agentId: string },

  // --- 模型 ---
  'models:list': {} as { models: AIModelConfig[]; defaultModelId: string | null },
  'config:saved': {} as { path: string }
}

// ============== 3. 类型派生 ==============

export type EventPayloadMap = { [K in keyof typeof EVENT_REGISTRY]: (typeof EVENT_REGISTRY)[K] }
export type GatewayAction = keyof EventPayloadMap
export const GATEWAY_EVENTS = Object.keys(EVENT_REGISTRY) as GatewayAction[]

/** 辨别联合体 (Tagged Union) */
export type TaggedEvent = { [A in GatewayAction]: { type: A } & EventPayloadMap[A] }[GatewayAction]
export type EventOf<A extends GatewayAction> = { type: A } & EventPayloadMap[A]

/** 自动提取 Chat 类动作 */
export type ChatAction = Extract<
  GatewayAction,
  | `chat:${string}`
  | `agent:run-${string}`
  | `agent:turn-${string}`
  | `agent:skill-${string}`
  | 'agent:context-overflow'
>

// ============== 4. 精确载荷组合 (Discriminated Union) ==============

/**
 * ChatPayload: 基于 state 的辨别联合。
 * 每一项都只包含该 state 下合法的字段 + BizContext + ChatTrack。
 */
export type ChatPayload = {
  [A in ChatAction]: { state: A } & ChatTrack & EventPayloadMap[A]
}[ChatAction]

/**
 * 辅助类型：全量可选的 ChatPayload 视图 (用于 Broadcaster 等物理层转换)
 */
export type ChatPayloadFlat = Partial<
  BizContext &
    ChatTrack &
    ChatMessageBody &
    ChatDeltaBody &
    ChatFinalBody &
    ChatErrorBody &
    ChatRetryingBody &
    ChatToolResultBody &
    AgentRunStartBody &
    AgentRunEndBody &
    AgentSkillTriggeredBody &
    AgentTurnBody &
    InteractionPayload &
    ToolCallPayload
> & { type: string; state: ChatAction }

/** 其余聚合载荷 */
export type AgentEventPayload = Extract<
  TaggedEvent,
  { type: `agent:${string}` } | { type: `session:${string}` }
>
export type NoticePayload = Extract<TaggedEvent, { type: `notice:${string}` }>
export type HeartbeatEventPayload = Extract<TaggedEvent, { type: `heartbeat:${string}` }>
export type ModelsPayload = Extract<TaggedEvent, { type: 'models:list' }>

export type GatewayPayload =
  | ChatPayload
  | AgentEventPayload
  | HeartbeatEventPayload
  | NoticePayload
  | ModelsPayload
  | EventOf<'system:tick'>
  | EventOf<'system:shutdown'>

// ============== 5. 命名空间分类订阅支持 ==============

export type GatewayCategory =
  | 'chat'
  | 'agent'
  | 'notice'
  | 'session'
  | 'heartbeat'
  | 'system'
  | 'models'
  | 'config'

export type CategoryPayloadMap = {
  chat: ChatPayload
  agent: AgentEventPayload
  notice: NoticePayload
  session: Extract<AgentEventPayload, { type: `session:${string}` }>
  heartbeat: HeartbeatEventPayload
  system: EventOf<'system:tick'> | EventOf<'system:shutdown'>
}

export type ActionOrCategory = GatewayAction | GatewayCategory

/**
 * 推导 Payload：如果是精确 Action 则返回对应 PayloadMap 项，
 * 如果是 Category 则返回该分类的聚合 Payload。
 */
export type PayloadOf<T extends ActionOrCategory> = T extends GatewayAction
  ? EventPayloadMap[T]
  : T extends keyof CategoryPayloadMap
    ? CategoryPayloadMap[T]
    : unknown

// ============== 6. 客户端配置 & 工具 ==============

export interface GatewayClientOptions {
  url: string
  token?: string
  autoReconnect?: boolean
  onEvent?: (evt: import('../gateway').EventFrame) => void
  onConnect?: (hello: HelloOk) => void
  onClose?: (code: number, reason: string) => void
  onGap?: (gap: { expected: number; received: number }) => void
}

export type EventPayload<E extends GatewayAction> = EventPayloadMap[E]
export type TickPayload = EventPayloadMap['system:tick']
export type ShutdownPayload = EventPayloadMap['system:shutdown']
