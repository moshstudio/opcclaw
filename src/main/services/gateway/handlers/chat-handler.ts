import { ErrorCodes, errorShape, ChatPayload } from '../protocol.js'
import type { MiniAgentEvent } from '@main/services/agent/agent-events'
import type { Handler } from './types.js'

/**
 * chat.send
 * 对齐 openclaw server-methods/chat.ts:
 * 1. 立即返回 { runId } (ACK)
 * 2. 异步执行 agent.run()
 * 3. agent 事件流 → broadcast("agent") + broadcast("chat" delta/final)
 */
export const handleChatSend: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string; message?: string } | undefined
  if (!p?.message) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, 'message required') }
  }

  const agentId = p.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)

  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  let sessionKey = p.sessionKey
  if (!sessionKey || sessionKey === 'main') {
    sessionKey = await agent.createSession()
  }

  // 开始新运行前，先终止该会话中可能存在的旧运行（标准行为，防止输出重叠）
  agent.abortSession(sessionKey)

  // 追踪 agent 内部的 runId（通过 agent_start 事件获取）
  let agentRunId: string | undefined

  // Delta 限流状态
  let deltaBuffer = ''
  let lastDeltaSentAt = 0
  let lastDeltaSentLen = 0 // 上次广播时 buffer 的长度，用于计算新增部分
  const DELTA_THROTTLE_MS = 150

  // Chunk Lineage Tracking
  let lastChunkId: string | undefined = undefined
  let chunkCounter = 0

  // 辅助函数：统一处理 chat 事件的分发，确保 ID 链条完整
  const emitChatState = (
    state: ChatPayload['state'],
    event?: {
      text?: string
      message?: any
      usage?: any
      performance?: any
      error?: string
      forceFullText?: boolean
    }
  ) => {
    const fullText = event?.text ?? deltaBuffer
    const text = event?.forceFullText ? fullText : fullText.slice(lastDeltaSentLen)
    if (!event?.forceFullText) {
      lastDeltaSentLen = fullText.length
    }

    // 生成当前 chunkId: runId + 序数 (确保该运行下唯一且有序)
    // 如果 agentRunId 暂无，则回退到 sessionKey
    const currentChunkId = `${agentRunId || sessionKey}_chunk_${chunkCounter++}`

    ctx.broadcaster.chat({
      agentId,
      runId: agentRunId,
      sessionKey,
      state,
      chunkId: currentChunkId,
      parentId: lastChunkId,
      text,
      message: event?.message,
      usage: event?.usage,
      performance: event?.performance,
      error: event?.error
    })

    // 更新 chain
    lastChunkId = currentChunkId
  }

  // 异步执行，不阻塞响应
  const unsub = agent.subscribe((event: MiniAgentEvent) => {
    // 捕获 agent 内部 runId，用于后续事件关联
    if (event.type === 'agent_start' && event.sessionKey === sessionKey) {
      agentRunId = event.runId
    }

    // 仅转发属于本次 run 的事件（按 sessionKey 过滤，避免并发混杂）
    const eventRunId = 'runId' in event ? (event as { runId: string }).runId : undefined
    if (eventRunId && eventRunId !== agentRunId) return

    // 桥接 agent 事件 → gateway 广播
    ctx.broadcaster.agentBridge(agentId, sessionKey, agentRunId, event)

    // 状态转换逻辑
    switch (event.type) {
      case 'message_start':
        emitChatState('start', { message: event.message })
        break

      case 'message_delta': {
        deltaBuffer += event.delta
        const now = Date.now()
        // 增量限流发送
        if (now - lastDeltaSentAt >= DELTA_THROTTLE_MS) {
          lastDeltaSentAt = now
          emitChatState('delta')
        }
        break
      }

      case 'message_end':
        // 强制刷新缓冲区并发送结束状态
        emitChatState('final', {
          text: event.text,
          message: event.message,
          usage: event.usage
        })
        break

      case 'agent_end':
        // Agent 运行彻底结束，包含累积用量和性能指标
        emitChatState('final', {
          usage: event.usage,
          performance: event.performance
        })
        break

      case 'agent_error':
        emitChatState('error', { error: event.error })
        break
    }
  })

  // 启动运行逻辑
  try {
    // 向 agent 发起主循环请求
    agent.run(sessionKey, p.message).finally(() => unsub())

    // 立即响应 ACK，包含最终确定的 sessionKey
    return { ok: true, payload: { sessionKey, sessionId: sessionKey, agentId } }
  } catch (err) {
    // 捕获启动时的同步错误
    unsub()
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, String(err))
    }
  }
}

/**
 * chat.abort
 */
export const handleChatAbort: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  agent.abortSession(sessionKey)
  return { ok: true, payload: { agentId, sessionKey } }
}

/**
 * chat.history
 */
export const handleChatHistory: Handler = async (params, _client, ctx) => {
  const p = params as { agentId?: string; sessionKey?: string } | undefined
  const agentId = p?.agentId || 'main'
  const agent = ctx.registry.getAgent(agentId)
  if (!agent) {
    return { ok: false, error: errorShape(ErrorCodes.NOT_FOUND, `agent not found: ${agentId}`) }
  }

  const sessionKey = p?.sessionKey || 'main'
  const messages = await agent.getHistory(sessionKey)
  return { ok: true, payload: { agentId, sessionKey, messages } }
}
