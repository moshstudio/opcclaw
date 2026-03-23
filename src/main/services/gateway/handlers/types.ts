import { timingSafeEqual } from 'node:crypto'
import type { AgentRegistry } from '@main/services/agent/registry'
import { Broadcaster, type BroadcastFn } from '../broadcaster.js'
import { type ErrorShape } from '../protocol.js'

export type GwClient = {
  id: string
  socket: {
    send: (data: string) => void
    close: (code?: number, reason?: string) => void
    bufferedAmount: number
  }
  authed: boolean
}

import { type Logger } from '@main/services/common/logger.js'

export type HandlerContext = {
  registry: AgentRegistry
  broadcast: BroadcastFn
  broadcaster: Broadcaster
  clients: Set<GwClient>
  token?: string
  nonces: Map<string, string>
  startedAt: number
  logger: Logger
}

export type HandlerResult = { ok: boolean; payload?: unknown; error?: ErrorShape }

export type Handler = (
  params: unknown,
  client: GwClient,
  ctx: HandlerContext
) => Promise<HandlerResult>

/** 防计时攻击的字符串比较 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
