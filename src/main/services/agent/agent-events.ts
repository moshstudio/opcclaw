/**
 * Agent 事件类型定义
 *
 * 对应 OpenClaw:
 * - pi-agent-core/types.d.ts → AgentEvent 判别联合类型
 * - pi-ai/utils/event-stream.js → EventStream<T, R> 泛型事件流
 */

import { EventStream, type Usage } from '@mariozechner/pi-ai'
import { type Message, type AgentPerformance, type ContentBlock } from '@shared/types/agent'

export type { Message, AgentPerformance }

// ============== 事件类型（判别联合） ==============

/**
 * Agent 事件类型 (已完全对齐 Gateway 驼峰命名协议)
 */
export type MiniAgentEvent =
  // 核心生命周期
  | { type: 'agent:run-start'; runId: string; sessionKey: string; agentId: string; model: string }
  | {
      type: 'agent:run-end'
      runId: string
      sessionKey: string
      messages: Message[]
      usage?: Usage
      performance?: AgentPerformance
    }
  | { type: 'agent:run-error'; runId: string; sessionKey: string; error: string }

  // 轮次
  | { type: 'agent:turn-start'; runId: string; sessionKey: string; turn: number }
  | { type: 'agent:turn-end'; runId: string; sessionKey: string; turn: number }

  // 消息 (Chat 频道相关，对齐 ChatPayload.state)
  | { type: 'chat:userMessage'; runId: string; sessionKey: string; message: Message }
  | { type: 'chat:start'; runId: string; sessionKey: string; message: Message }
  | { type: 'chat:delta'; runId: string; sessionKey: string; delta: string }
  | {
      type: 'chat:final'
      runId: string
      sessionKey: string
      message: Message
      text: string
      usage?: Usage
      performance?: AgentPerformance
    }

  // 思考
  | {
      type: 'chat:thinking'
      runId: string
      sessionKey: string
      delta: string
    }

  // 工具执行
  | {
      type: 'chat:toolCall'
      runId: string
      sessionKey: string
      toolCallId: string
      toolName: string
      arguments: Record<string, unknown>
    }
  | {
      type: 'chat:toolResult'
      runId: string
      sessionKey: string
      toolCallId: string
      toolName: string
      content: ContentBlock[] // 对应 pi-ai 的 ToolResultMessage.content
      isError: boolean
    }

  // 业务状态
  | {
      type: 'chat:notice'
      runId: string
      sessionKey: string
      text?: string
      summaryChars?: number
      droppedMessages?: number
      firstKeptEntryId?: string
    }
  | { type: 'agent:context-overflow'; runId: string; sessionKey: string; error: string }
  | {
      type: 'chat:retrying'
      runId: string
      sessionKey: string
      attempt: number
      delay: number
      error: string
    }
  // 管理事件
  | { type: 'session:deleted'; sessionKey: string }
  | { type: 'session:reset'; sessionKey: string }
  | { type: 'session:created'; sessionKey: string; agentId: string }
  | { type: 'agent:created'; agentId: string }
  | { type: 'agent:updated'; agentId: string }
  | { type: 'agent:deleted'; agentId: string }
  | { type: 'config:saved'; path: string }

// ============== 结果类型 ==============

/**
 * EventStream 的最终结果
 */
export interface MiniAgentResult {
  finalText: string
  turns: number
  totalToolCalls: number
  messages: Message[]
  usage?: Usage
  performance?: AgentPerformance
}

// ============== 工厂函数 ==============

/**
 * 创建 Agent 事件流
 */
export function createMiniAgentStream(): EventStream<MiniAgentEvent, MiniAgentResult> {
  return new EventStream<MiniAgentEvent, MiniAgentResult>(
    () => false,
    () => ({ finalText: '', turns: 0, totalToolCalls: 0, messages: [] })
  )
}
