/**
 * Agent 事件类型定义
 *
 * 对应 OpenClaw:
 * - pi-agent-core/types.d.ts → AgentEvent 判别联合类型
 * - pi-ai/utils/event-stream.js → EventStream<T, R> 泛型事件流
 */

import { EventStream, type Usage } from '@mariozechner/pi-ai'
import type { Message, AgentPerformance } from '@shared/types/agent'

export type { Message, AgentPerformance }

// ============== 事件类型（判别联合） ==============

/**
 * Agent 事件类型
 *
 * 对应 pi-agent-core AgentEvent，适配 mini 的 Message 类型:
 * - 核心生命周期: agent_start → agent_end / agent_error
 * - 轮次: turn_start → turn_end
 * - 消息: message_start → message_delta* → message_end
 * - 工具: tool_execution_start → tool_execution_end / tool_skipped
 */
export type MiniAgentEvent =
  // 核心生命周期
  | { type: 'agent_start'; runId: string; sessionKey: string; agentId: string; model: string }
  | {
      type: 'agent_end'
      runId: string
      messages: Message[]
      usage?: Usage
      performance?: AgentPerformance
    }
  | { type: 'agent_error'; runId: string; error: string }

  // 轮次
  | { type: 'turn_start'; turn: number }
  | { type: 'turn_end'; turn: number }

  // 消息
  | { type: 'user_message'; message: Message }
  | { type: 'message_start'; message: Message }
  | { type: 'message_delta'; delta: string }
  | { type: 'message_end'; message: Message; text: string; usage?: Usage }

  // 思考
  | { type: 'thinking_delta'; delta: string }

  // 工具执行
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_execution_end'
      toolCallId: string
      toolName: string
      result: string
      isError: boolean
    }
  | { type: 'tool_skipped'; toolCallId: string; toolName: string }

  // mini 特有事件
  | { type: 'steering'; pendingCount: number }
  | { type: 'compaction'; summaryChars: number; droppedMessages: number }
  | { type: 'context_overflow_compact'; error: string }
  | { type: 'retry'; attempt: number; delay: number; error: string }
  | {
      type: 'subagent_summary'
      childSessionKey: string
      label?: string
      task: string
      summary: string
    }
  | { type: 'subagent_error'; childSessionKey: string; label?: string; task: string; error: string }
  | { type: 'session_deleted'; sessionKey: string }
  | { type: 'session_reset'; sessionKey: string }
  | { type: 'session_created'; sessionKey: string; agentId: string }
  | { type: 'agent_created'; agentId: string }
  | { type: 'agent_updated'; agentId: string }
  | { type: 'agent_deleted'; agentId: string }
  | { type: 'bootstrap_saved'; path: string }

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
