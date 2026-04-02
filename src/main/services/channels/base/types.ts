/**
 * 频道基类通用类型定义
 */

/** 频道通用配置选项 */
export interface BaseChannelOptions {
  gatewayUrl?: string
  gatewayToken?: string
  defaultAgentId?: string
  agentBindings?: Record<string, string>
  onBindingChange?: (bindings: Record<string, string>) => void
}

/** 任务队列项目 */
export interface QueueTask {
  type: 'text' | 'text-fix' | 'interaction' | 'interaction-responded' | 'run-end' | 'error'
  text?: string
  payload?: any // ChatPayloadFlat
}

/** 运行时的响应状态 (通用) */
export interface CommonRun {
  chatId: string | number
  threadId?: number
  channelMessageId?: string | number // 平台侧消息 ID (物理存活的消息气泡)
  agentRunId?: string // 网关侧整体运行 ID (对应整个 Agent 响应过程)

  accumulatedText: string // 已累积的全文 (整个 Run 的合并内容)
  taskQueue: QueueTask[] // 任务队列

  lastUpdateAt: number // 上次物理更新时间 (用于节流)
  lastSentText: string // 上次发送给平台的原始文本 (检测变更)
  lastSentDecoratedText: string // 上次发送的修饰后文本 (如含光标)

  lang?: string
  isUpdating: boolean // 是否正在消费队列
  isFinal: boolean // 会话是否已结束
  isSending?: boolean // 是否正在发送初始消息 (加锁)
}

/** 会话上下文记录 */
export interface CommonSessionContext {
  chatId: string | number
  lang?: string
}

/** 交互消息记录 */
export interface InteractionRecord {
  chatId: string | number
  messageId: string | number
  options?: string[]
}

/** 智能体配置结构 */
export interface AgentConfig {
  name: string
  [key: string]: unknown
}

/** 智能体基础定义 */
export interface Agent {
  id: string
  config: AgentConfig
}

/** 智能体列表响应 */
export interface AgentListResponse {
  agents: Agent[]
}

/** 网关健康检查响应 */
export interface HealthResponse {
  uptimeMs: number
  clients: number
}
