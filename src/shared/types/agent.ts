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
