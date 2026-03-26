import {
  UserMessage as PiUserMessage,
  AssistantMessage as PiAssistantMessage,
  ToolResultMessage as PiToolResultMessage,
  Usage,
  TextContent,
  ThinkingContent,
  ToolCall,
  ImageContent,
  StopReason,
  ThinkingLevel,
  StreamFunction,
  Model,
  Api
} from '@mariozechner/pi-ai'

export type { Usage, StopReason, ThinkingLevel, StreamFunction, Model, Api }

export type MemorySource = 'memory' | 'sessions'
export const DEFAULT_MAX_CONCURRENT_RUNS = 1 // 锁定并发数为 1

/**
 * 记忆条目 (Shared)
 */
export interface MemoryEntry {
  id: string
  content: string
  source: MemorySource
  path?: string
  hash: string
  createdAt: number
}

/**
 * 记忆搜索结果 (Shared)
 */
export interface MemorySearchResult {
  entry: MemoryEntry
  score: number
  snippet: string
}

/**
 * 工具执行上下文接口 (主进程运行时注入)
 */
export interface ToolContext {
  workspaceDir: string
  sessionKey: string
  sessionId?: string
  agentId?: string
  memory?: {
    search: (query: string, limit?: number) => Promise<MemorySearchResult[]>
    getById: (id: string) => Promise<MemoryEntry | null>
    add: (content: string, source?: MemorySource, filePath?: string) => Promise<string>
    delete: (id: string) => Promise<boolean>
  }
  onMemorySearch?: (results: MemorySearchResult[]) => void
  spawnSubagent?: (params: {
    task: string
    label?: string
    cleanup?: 'keep' | 'delete'
  }) => Promise<{ runId: string; sessionKey: string }>
  heartbeat?: {
    updateConfig: (config: {
      intervalMs?: number
      enabled?: boolean
      activeHours?: { start: string; end: string }
    }) => void
    start: () => void
    stop: () => void
    trigger: () => Promise<any>
  }
  confirm?: (prompt: string, options?: string[]) => Promise<boolean>
  abortSignal?: AbortSignal
}

/**
 * 核心工具接口
 */
export interface Tool<TInput = any> {
  name: string
  description: string
  category: 'file' | 'runtime' | 'network' | 'memory' | 'session'
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (input: TInput, ctx: ToolContext) => Promise<string>
}

/**
 * Agent 相关通用类型定义 (Shared)
 */

export interface AgentConfig {
  // --- 核心标识与描述 ---
  agentId?: string
  name: string
  description?: string
  isPinned?: boolean

  // --- 模型与 API 配置 ---
  apiKey?: string
  provider?: string
  model?: string
  baseUrl?: string
  headers?: Record<string, string | null>
  temperature?: number
  reasoning?: ThinkingLevel
  maxTurns?: number
  maxTokens?: number
  contextTokens?: number

  // --- 运行时对象 (主要用于主进程) ---
  streamFn?: StreamFunction
  modelDef?: Model<Api>
  tools?: Tool<any>[]

  // --- 提示词与策略 ---
  systemPrompt?: string
  toolPolicy?: {
    allow?: string[]
    deny?: string[]
  }
  sandbox?: {
    enabled?: boolean
    allowExec?: boolean
    allowWrite?: boolean
  }

  // --- 功能开关 ---
  enableMemory?: boolean
  enableContext?: boolean
  enableSkills?: boolean
  enableHeartbeat?: boolean
  heartbeatInterval?: number
  supportsVision?: boolean

  // --- 目录与路径配置 ---
  workspaceDir?: string
  sessionDir?: string
  memoryDir?: string
  usageDir?: string
  heartbeatDir?: string

  // --- 并发与限制 ---
  maxConcurrentRuns?: number
}

export interface RunResult {
  runId?: string
  text: string
  turns: number
  toolCalls: number
  skillTriggered?: string
  memoriesUsed?: number
}

export interface Agent {
  id: string
  config: AgentConfig
}

export interface SubagentInfo {
  /** 任务详情 */
  task: string
  /** 运行状态 */
  status: 'running' | 'success' | 'error'
  /** 摘要 (成功时) */
  summary?: string
  /** 错误信息 (失败时) */
  error?: string
  /** 自定义标签 */
  label?: string
  /** 子代理 Agent ID */
  agentId?: string
  /** 子代理运行 ID */
  runId?: string
  /** 子代理会话 Key */
  childSessionKey?: string
}

/** 分辨率联合类型的内容块定义 */
export type AgentTextBlock = TextContent
export type AgentThinkingBlock = ThinkingContent
export type AgentToolCallBlock = ToolCall
export type AgentToolResultBlock = {
  type: 'toolResult'
  toolCallId: string
  toolName: string
  content: (AgentTextBlock | ImageContent)[] // 明确类型，对应 pi-ai 的 ToolResultMessage.content
  isError: boolean
}
export type AgentSubagentBlock = { type: 'subagent'; subagent: SubagentInfo }

export type ContentBlock =
  | AgentTextBlock
  | AgentThinkingBlock
  | AgentToolCallBlock
  | AgentToolResultBlock
  | AgentSubagentBlock
  | ImageContent

/**
 * AgentPerformance 性能指标
 */
export interface AgentPerformance {
  totalDurationMs: number
  generationDurationMs?: number
  throughput?: number
  firstTokenLatencyMs?: number
}

/**
 * 消息本地扩展元数据 (Shared Metadata)
 */
export interface LocalMetadata {
  id?: string
  runId?: string
  timestamp: number | string // 扩展兼容 string 格式
  usage?: Usage // 覆盖为可选 (流式响应中可能为空)
  performance?: AgentPerformance
}

/**
 * 消息扩展工具类型
 * T: pi-ai 原始消息类型
 * C: 覆盖后的 content 类型
 */
type ExtendMessage<T, C> = Omit<T, 'content' | 'timestamp' | 'usage'> &
  LocalMetadata & {
    content: C
  }

export type UserMessage = ExtendMessage<PiUserMessage, string | ContentBlock[]>

export type AssistantMessage = ExtendMessage<PiAssistantMessage, ContentBlock[]> & {
  lastChunkId?: string
}

export type ToolResultMessage = ExtendMessage<PiToolResultMessage, ContentBlock[]>

export type Message = UserMessage | AssistantMessage | ToolResultMessage

/**
 * AI 对话输出状态机状态枚举
 */
export type ChatStatus =
  | 'idle'
  | 'waiting' // 请求已发送，尚无任何回应
  | 'thinking' // 大脑思考中 (Thought/Reasoning)
  | 'streaming' // 正在输出正文或工具参数
  | 'toolCalling' // 正在生成工具调用
  | 'toolExecuting' // 正在执行工具
  | 'retrying' // 发生重试
  | 'completed' // 已完成（本次运行结束）
  | 'error' // 发生错误
  | 'aborted' // 用户手动中止
