import type { Context as PiContext, Model } from '@mariozechner/pi-ai'
import type { Message } from '@main/services/session/session'
import type { Tool } from '@main/services/tools/types'
import { pruneContextMessages } from '@main/services/context/index'
import { convertMessagesToPi } from '../message-convert'

export interface PrepareContextParams {
  currentMessages: Message[]
  compactionSummary: Message | undefined
  systemPrompt: string
  contextTokens: number
  toolsForRun: Tool[]
  modelDef: Model<any>
}

export interface ContextResult {
  piContext: PiContext
  prunedCount: number
}

/**
 * 准备 LLM 上下文
 *
 * 包含：
 * 1. 裁剪超出窗口的消息
 * 2. 注入 Compaction Summary (如果有)
 * 3. 转换消息格式为 pi-ai
 */
export function prepareContext(params: PrepareContextParams): ContextResult {
  const { currentMessages, compactionSummary, systemPrompt, contextTokens, toolsForRun, modelDef } =
    params

  const prevCount = currentMessages.length
  const pruneResult = pruneContextMessages({
    messages: currentMessages,
    contextWindowTokens: contextTokens
  })

  let messagesForModel = pruneResult.messages
  if (compactionSummary) {
    messagesForModel = [compactionSummary, ...messagesForModel]
  }

  const piMessages = convertMessagesToPi(messagesForModel, modelDef)
  const piContext: PiContext = {
    systemPrompt,
    messages: piMessages,
    tools: toolsForRun.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as any
    }))
  }

  return {
    piContext,
    prunedCount: prevCount - pruneResult.messages.length
  }
}
