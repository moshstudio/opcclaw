/**
 * Agent 相关通用类型定义 (Shared)
 */

export interface ContentBlock {
  /** 类型 */
  type: 'text' | 'tool_use' | 'tool_result'
  /** 文本内容 (type=text 时) */
  text?: string
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
}

/**
 * AI 对话输出状态机状态枚举
 */
export type ChatStatus =
  | 'idle'
  | 'waiting' // 请求已发送，尚无任何回应
  | 'thinking' // 大脑思考中 (Thought/Reasoning)
  | 'streaming' // 正在输出正文或工具参数
  | 'tool_calling' // 正在生成工具调用
  | 'tool_executing' // 正在执行工具
  | 'completed' // 已完成（本次运行结束）
  | 'error' // 发生错误
  | 'aborted' // 用户手动中止
