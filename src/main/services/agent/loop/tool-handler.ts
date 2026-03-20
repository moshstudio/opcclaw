import type { ContentBlock } from '@main/services/session/session'
import type { Tool, ToolContext } from '@main/services/tools/types'
import type { EventStream } from '@mariozechner/pi-ai'
import type { MiniAgentEvent, MiniAgentResult } from '../agent-events'
import type { MetricsTracker } from './metrics'

export interface ToolExecutionInput {
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * 执行工具调用批次
 */
export async function executeToolCalls(
  toolCalls: ToolExecutionInput[],
  toolsForRun: Tool[],
  toolCtx: ToolContext,
  runId: string,
  sessionKey: string,
  stream: EventStream<MiniAgentEvent, MiniAgentResult>,
  metrics: MetricsTracker
): Promise<ContentBlock[]> {
  const toolResults: ContentBlock[] = []

  for (const call of toolCalls) {
    const tool = toolsForRun.find((t) => t.name === call.name)
    let result: string
    let isError = false

    stream.push({
      type: 'chat:tool-call',
      runId,
      sessionKey,
      toolCallId: call.id,
      toolName: call.name,
      args: call.input
    })

    if (tool) {
      try {
        result = await tool.execute(call.input, toolCtx)
      } catch (err: any) {
        result = err?.message || String(err)
        isError = true
      }
    } else {
      result = `未知工具: ${call.name}`
      isError = true
    }

    stream.push({
      type: 'chat:tool-result',
      runId,
      sessionKey,
      toolCallId: call.id,
      toolName: call.name,
      result,
      isError
    })

    metrics.recordToolCall()
    toolResults.push({
      type: 'tool_result',
      tool_use_id: call.id,
      name: call.name,
      content: result
    })
  }

  return toolResults
}
