/**
 * 工具系统类型定义
 *
 * 对应 OpenClaw 源码: src/tools/ 目录
 *
 * 核心设计:
 *
 * 1. 什么是"工具"？
 *    - 工具是 Agent 与外部世界交互的接口
 *    - LLM 本身只能生成文本，通过工具可以读写文件、执行命令等
 *    - Anthropic 称之为 "Tool Use"，OpenAI 称之为 "Function Calling"
 *
 * 2. 为什么用 JSON Schema 定义工具输入？
 *    - JSON Schema 是标准格式，LLM 能理解并生成符合 schema 的参数
 *    - Anthropic API 要求 inputSchema 必须是 JSON Schema 格式
 *    - 这样 LLM 知道每个参数的类型、是否必填、描述等
 *
 * 3. 工具执行流程:
 *    ```
 *    User: "读取 src/index.ts 文件"
 *         ↓
 *    LLM 返回 Assistant 消息: { content: [ { type: "toolCall", name: "read", arguments: { file_path: "src/index.ts" } } ] }
 *         ↓
 *    Agent 执行: readTool.execute({ file_path: "src/index.ts" }, ctx)
 *         ↓
 *    Agent 返回 ToolResult 消息: { role: "toolResult", content: [ { type: "text", text: "文件内容..." } ] }
 *         ↓
 *    LLM 继续生成最终回复
 *    ```
 */

import { ToolContext, Tool } from '@shared/types/agent'
export type { ToolContext, Tool }

// ============== 工具调用记录 ==============

/**
 * 工具调用记录
 * LLM 返回的 toolCall 块解析后的结构
 */
export interface ToolCallRecord {
  /** 调用 ID: 用于关联 toolResult */
  id: string
  /** 工具名称 */
  name: string
  /** 调用参数 */
  arguments: Record<string, unknown>
}

/**
 * 工具执行结果
 * 返回给 LLM 的 toolResult 块预览
 */
export interface ToolResultPreview {
  /** 关联的工具调用 ID */
  toolCallId: string
  /** 工具名称 */
  toolName: string
  /** 执行结果内容 */
  content: string
  /** 是否是错误 */
  isError?: boolean
}
