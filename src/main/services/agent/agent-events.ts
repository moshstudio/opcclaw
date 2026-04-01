/**
 * 智能体内部事件定义 (Agent Internal Events)
 *
 * 核心设计：直接对齐网关动作映射表。
 * 由此产出的事件能够无缝通过 Broadcaster 转发至各物理通道。
 */

import { EventStream } from '@mariozechner/pi-ai'
import type { Message, AgentPerformance, Usage } from '@shared/types/agent'
import type { TaggedEvent } from '@shared/types/gateway'

export type { Message, AgentPerformance }

/**
 * 智能体对外暴露的所有事件总线。
 * 直接派生自网关契约，不需要注册额外类型。
 */
export type MiniAgentEvent = TaggedEvent

/**
 * Agent 运行结果摘要
 */
export interface MiniAgentResult {
  finalText: string
  turns: number
  totalToolCalls: number
  messages: Message[]
  usage: Usage
  performance: AgentPerformance
}

/**
 * 创建智能体事件流工厂
 */
export function createMiniAgentStream() {
  return new EventStream<MiniAgentEvent, MiniAgentResult>(
    (event) => event.type === 'agent:run-end' || event.type === 'agent:run-error',
    (event) => {
      if (event.type === 'agent:run-end') {
        const e = event as {
          type: 'agent:run-end'
          messages: MiniAgentResult['messages']
          usage: MiniAgentResult['usage']
          performance: MiniAgentResult['performance']
        }
        return {
          finalText: '',
          turns: 0,
          totalToolCalls: 0,
          messages: e.messages,
          usage: e.usage,
          performance: e.performance
        }
      }
      return {
        finalText: '',
        turns: 0,
        totalToolCalls: 0,
        messages: [],
        usage: {} as MiniAgentResult['usage'],
        performance: {} as MiniAgentResult['performance']
      }
    }
  )
}
