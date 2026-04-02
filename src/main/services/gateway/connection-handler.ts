/**
 * Gateway WebSocket 实体物理端口 (Port Handler)
 */

import { WebSocket } from 'ws'
import {
  type ErrorShape,
  isRequestFrame,
  ErrorCodes,
  errorShape,
  HANDSHAKE_TIMEOUT_MS
} from '@shared/types/gateway'
import { type GatewayMethod, type RequestMethodMap } from '@shared/types/gateway/in'
import { newId } from './protocol'
import { handlers, type GwClient, type HandlerContext } from './handlers/index'
import { formatGatewayDebugData } from './helpers/debug-utils'
import type { Logger } from '@main/services/common/logger'

/**
 * 设置新的 WebSocket 物理连接通道 (Entrance Port)
 */
export function setupConnectionHandler(socket: WebSocket, ctx: HandlerContext) {
  const connId = newId()
  const client: GwClient = { id: connId, socket: socket as GwClient['socket'], authed: false }
  ctx.clients.add(client)

  ctx.logger.info(`Client physical port allocated: ${connId}`)

  // 1. 发送握手挑战
  const nonce = newId()
  ctx.nonces.set(connId, nonce)

  socket.send(
    JSON.stringify({
      type: 'event',
      event: 'connect:challenge',
      payload: { nonce, ts: Date.now() },
      seq: 0
    })
  )

  const handshakeTimer = setTimeout(() => {
    if (!client.authed) {
      socket.close(4001, 'Handshake timeout')
    }
  }, HANDSHAKE_TIMEOUT_MS)

  // 2. 入口数据物理层消费
  socket.on('message', async (raw) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(raw))
    } catch {
      return
    }

    if (!isRequestFrame(parsed)) return
    const req = parsed

    ctx.logger.debug(`[GW-IN] RAW: ${formatGatewayDebugData(req)}`)

    if (!client.authed && (req.method as string) !== 'connect') {
      respond(
        socket,
        req.id,
        false,
        undefined as any,
        errorShape(ErrorCodes.UNAUTHORIZED, 'Auth required'),
        ctx.logger
      )
      return
    }

    const handler = handlers[req.method]
    if (!handler) {
      respond(
        socket,
        req.id,
        false,
        undefined as any,
        errorShape(ErrorCodes.INVALID_REQUEST, 'Method not found'),
        ctx.logger
      )
      return
    }

    try {
      const result = await handler(req.params, client, ctx)
      respond(socket, req.id, result.ok, result.payload, result.error, ctx.logger)
      if (req.method === 'connect' && result.ok) clearTimeout(handshakeTimer)
    } catch (err) {
      respond(
        socket,
        req.id,
        false,
        undefined as any,
        errorShape(ErrorCodes.UNAVAILABLE, String(err)),
        ctx.logger
      )
    }
  })

  socket.on('close', () => {
    clearTimeout(handshakeTimer)
    ctx.clients.delete(client)
    ctx.nonces.delete(connId)
  })
}

/** 统一响应出口 */
function respond<M extends GatewayMethod>(
  socket: WebSocket,
  id: string,
  ok: boolean,
  payload: RequestMethodMap[M]['result'],
  error: ErrorShape | undefined,
  logger: Logger | undefined
) {
  if (socket.readyState === WebSocket.OPEN) {
    const frame = { type: 'res', id, ok, payload, error }
    logger?.debug(`[GW-OUT] ACK: ${formatGatewayDebugData(frame as any)}`)
    socket.send(JSON.stringify(frame))
  }
}
