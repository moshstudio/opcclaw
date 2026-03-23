import type { ToolResultMessage, ToolCall } from '@mariozechner/pi-ai'

import type { Tool, ToolContext } from '@main/services/tools/types'
import type { EventStream } from '@mariozechner/pi-ai'
import type { MiniAgentEvent, MiniAgentResult } from '../agent-events'
import type { MetricsTracker } from './metrics'

/**
 * 执行工具调用批次
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  toolsForRun: Tool[],
  toolCtx: ToolContext,
  runId: string,
  sessionKey: string,
  stream: EventStream<MiniAgentEvent, MiniAgentResult>,
  metrics: MetricsTracker
): Promise<ToolResultMessage[]> {
  const toolResults: ToolResultMessage[] = []

  for (const call of toolCalls) {
    const tool = toolsForRun.find((t) => t.name === call.name)
    let result: string
    let isError = false

    if (tool) {
      try {
        result = await tool.execute(call.arguments, toolCtx)
      } catch (err: any) {
        result = err?.message || String(err)
        isError = true
      }
    } else {
      result = `未知工具: ${call.name}`
      isError = true
    }

    stream.push({
      type: 'chat:toolResult',
      runId,
      sessionKey,
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text: result }],
      isError
    })

    metrics.recordToolCall()
    toolResults.push({
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text: result }],
      isError,
      timestamp: Date.now()
    })
  }

  return toolResults
}
