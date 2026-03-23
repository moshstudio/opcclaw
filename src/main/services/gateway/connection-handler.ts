import { WebSocket } from 'ws'
import {
  type RequestFrame,
  isRequestFrame,
  ErrorCodes,
  errorShape,
  newId,
  HANDSHAKE_TIMEOUT_MS
} from './protocol.js'
import { handlers, type GwClient, type HandlerContext } from './handlers/index.js'
import { type EventFrame, type ResponseFrame } from './protocol.js'
import { formatGatewayDebugData } from './helpers/debug-utils.js'
import type { Logger } from '@main/services/common/logger.js'

/**
 * 设置新的 WebSocket 连接 (对齐 openclaw ws-connection.ts)
 */
export function setupConnectionHandler(socket: WebSocket, ctx: HandlerContext) {
  const connId = newId()
  const client: GwClient = { id: connId, socket: socket as any, authed: false }
  ctx.clients.add(client)

  ctx.logger.info(`Client connected: ${connId}`)

  // 1. 发送 challenge (握手挑战)
  const nonce = newId()
  ctx.nonces.set(connId, nonce)
  send(
    socket,
    {
      type: 'event',
      event: 'connect:challenge',
      payload: { nonce, ts: Date.now() },
      seq: 0
    },
    ctx.logger
  )

  // 2. 握手超时控制
  const handshakeTimer = setTimeout(() => {
    if (!client.authed) {
      socket.close(4000, 'handshake timeout')
    }
  }, HANDSHAKE_TIMEOUT_MS)

  // 3. 消息路由处理
  socket.on('message', async (raw) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(raw))
    } catch {
      return
    }

    if (!isRequestFrame(parsed)) return
    const req = parsed as RequestFrame

    if (ctx.logger.level === 'debug') {
      ctx.logger.debug(`[GW-IN] ${formatGatewayDebugData(req)}`)
    }

    // 安全检查：未认证时仅允许 connect
    if (!client.authed && req.method !== 'connect') {
      respond(
        socket,
        req.id,
        false,
        undefined,
        errorShape(ErrorCodes.UNAUTHORIZED, 'not authenticated'),
        ctx.logger
      )
      return
    }

    // RPC 方法路由
    const handler = handlers[req.method]
    if (!handler) {
      respond(
        socket,
        req.id,
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
        ctx.logger
      )
      return
    }

    try {
      const result = await handler(req.params, client, ctx)
      respond(socket, req.id, result.ok, result.payload, result.error, ctx.logger)
      if (req.method === 'connect' && result.ok) {
        clearTimeout(handshakeTimer)
      }
    } catch (err) {
      respond(
        socket,
        req.id,
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, String(err)),
        ctx.logger
      )
    }
  })

  // 4. 连接清理逻辑
  const cleanup = (code?: number, reason?: string) => {
    clearTimeout(handshakeTimer)
    if (ctx.clients.has(client)) {
      const info = code ? `(code: ${code}${reason ? `, reason: ${reason}` : ''})` : ''
      ctx.logger.info(`Client left: ${connId} ${info}`)
      ctx.clients.delete(client)
      ctx.nonces.delete(connId)
    }
  }

  socket.on('close', (code, reason) => cleanup(code, String(reason)))
  socket.on('error', (err) => {
    ctx.logger.error(`Client socket error: ${connId}`, err)
    cleanup()
  })
}

/**
 * 帮助函数：发送帧
 */
function send(
  socket: WebSocket,
  frame: EventFrame | ResponseFrame,
  logger: Logger | undefined
): void {
  if (socket.readyState === WebSocket.OPEN) {
    const data = JSON.stringify(frame)

    if (logger?.level === 'debug') {
      logger.debug(`[GW-OUT] SEND: ${formatGatewayDebugData(frame)}`)
    }

    socket.send(data)
  }
}

/**
 * 帮助函数：响应请求
 */
function respond(
  socket: WebSocket,
  id: string,
  ok: boolean,
  payload: unknown,
  error: import('./protocol.js').ErrorShape | undefined,
  logger: Logger | undefined
) {
  send(socket, { type: 'res', id, ok, payload, error } as any, logger)
}
