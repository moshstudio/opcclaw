/**
 * Agent 相关通用类型定义 (Shared)
 */

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

export interface ContentBlock {
  /** 类型 */
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'subagent'
  /** 文本内容 (type=text 或 type=thinking 时) */
  text?: string
  /** 思考签名 (type=thinking 时用于记录原始字段名，如 reasoning_content) */
  thinking_signature?: string
  /** 工具调用 ID (type=tool_use 时由 API 生成) */
  id?: string
  /** 工具名称 (type=tool_use 时) */
  name?: string
  /** 工具输入参数 (type=tool_use 时) */
  input?: Record<string, unknown>
  /** 关联的工具调用 ID (type=tool_result 时) */
  tool_use_id?: string
  /** 工具执行结果 (type=tool_result 时) */
  content?: string
  /** 子代理信息 (type=subagent 时) */
  subagent?: SubagentInfo
}

/**
 * Usage 统计结构
 */
export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

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
 * 消息结构
 * 与 Anthropic API 的 MessageParam 兼容
 */
export interface Message {
  /** 消息唯一 ID */
  id?: string
  /** 角色: user 或 assistant */
  role: 'user' | 'assistant' | 'system' | 'compaction'
  /** 内容: 可以是纯文本，也可以是多个内容块（包含工具调用） */
  content: string | ContentBlock[]
  /** 时间戳: 用于排序和调试 */
  timestamp: number | string
  /** 所属的任务 ID (同一个任务内的多次迭代共享 ID) */
  runId?: string
  /** Token 消耗和成本统计 (仅 assistant 角色) */
  usage?: Usage
  /** 整个会话过程的总消耗 (在 agent_end 时由后端累计返回) */
  totalUsage?: Usage
  /** 性能指标 (仅 agent_end 时) */
  performance?: AgentPerformance
  /** 最后一个处理过的 Chunk ID (用于去重) */
  lastChunkId?: string
}

/**
 * AI 对话输出状态机状态枚举
 */
export type ChatStatus =
  | 'idle'
  | 'waiting' // 请求已发送，尚无任何回应
  | 'thinking' // 大脑思考中 (Thought/Reasoning)
  | 'planning' // 正在规划下一步或多步任务
  | 'streaming' // 正在输出正文或工具参数
  | 'tool_calling' // 正在生成工具调用
  | 'tool_executing' // 正在执行工具
  | 'retrying' // 发生重试
  | 'completed' // 已完成（本次运行结束）
  | 'error' // 发生错误
  | 'aborted' // 用户手动中止
