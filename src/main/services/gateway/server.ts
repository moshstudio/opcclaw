/**
 * Gateway 服务端
 *
 * 对齐 OpenClaw:
 * - server.impl.ts → startGatewayServer() 启动流程
 * - server/ws-connection.ts → WebSocket 连接处理 + challenge 握手
 * - server-broadcast.ts → createGatewayBroadcaster() Pub/Sub
 * - server-methods.ts → handleGatewayRequest() 方法路由
 * - server-maintenance.ts → tick 定时器
 * - server-close.ts → 优雅关闭
 *
 * 核心模式:
 * 1. Challenge-Response 握手
 * 2. 方法路由: RequestFrame.method → handlers[method]
 * 3. Pub/Sub 广播: broadcast(event, payload) → seq 递增 → 背压控制
 * 4. 心跳: 30s tick → 慢消费者检测
 */

import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { AgentRegistry } from '@main/services/agent/registry'
import {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  isRequestFrame,
  ErrorCodes,
  errorShape,
  newId,
  TICK_INTERVAL_MS,
  HANDSHAKE_TIMEOUT_MS
} from './protocol.js'
import { handlers, type GwClient, type HandlerContext } from './handlers/index.js'
import { Broadcaster, createBroadcastFn } from './broadcaster.js'

// ============== 类型 ==============

export type GatewayServerOptions = {
  port?: number
  token?: string
  registry: AgentRegistry
}

export type GatewayServer = {
  close: (opts?: { restartExpectedMs?: number }) => void
  port: number
}

// ============== 广播器（对齐 openclaw server-broadcast.ts） ==============

/**
 * 对齐 openclaw server-broadcast.ts:
 * - seq 全局递增
 * - dropIfSlow: 非关键事件（tick、delta）跳过慢消费者而非断开
 * - 强制关闭: 关键事件时，慢消费者直接断开防止内存泄漏
 */

// ============== 启动服务 ==============

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  const port = opts.port ?? 18789
  const clients = new Set<GwClient>()
  const nonces = new Map<string, string>()
  const broadcast = createBroadcastFn(clients)
  const startedAt = Date.now()

  const broadcaster = new Broadcaster(broadcast)

  const ctx: HandlerContext = {
    registry: opts.registry,
    broadcast,
    broadcaster,
    clients,
    token: opts.token,
    nonces,
    startedAt
  }

  // HTTP 服务（对齐 openclaw server-http.ts createGatewayHttpServer）
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ service: 'mini-gateway', uptimeMs: Date.now() - startedAt }))
  })

  // WebSocket 服务（对齐 openclaw: new WebSocketServer + attachGatewayUpgradeHandler）
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (socket) => {
    setupConnectionHandler(socket, ctx)
  })

  // Tick 定时器（对齐 openclaw server-maintenance.ts: 30s tick 广播，可丢弃）
  const tickTimer = setInterval(() => {
    broadcaster.tick(Date.now())
  }, TICK_INTERVAL_MS)

  // 监听
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(port, () => resolve())
  })

  // 优雅关闭（对齐 openclaw server-close.ts: createGatewayCloseHandler）
  const close = (opts?: { restartExpectedMs?: number }) => {
    broadcaster.shutdown('server closing', opts?.restartExpectedMs ?? null)
    clearInterval(tickTimer)
    for (const c of clients) {
      try {
        c.socket.close(1012, 'service restart')
      } catch {
        console.warn('socket close failed')
      }
    }
    clients.clear()
    wss.close()
    httpServer.close()
  }

  return { close, port }
}

/**
 * 设置新的 WebSocket 连接 (对齐 openclaw ws-connection.ts)
 */
function setupConnectionHandler(socket: WebSocket, ctx: HandlerContext) {
  const connId = newId()
  const client: GwClient = { id: connId, socket: socket as any, authed: false }
  ctx.clients.add(client)

  console.log(`[GW-CONN] Client connected: ${connId}`)

  // 1. 发送 challenge (握手挑战)
  const nonce = newId()
  ctx.nonces.set(connId, nonce)
  send(socket, {
    type: 'event',
    event: 'connect.challenge',
    payload: { nonce, ts: Date.now() },
    seq: 0
  })

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
    console.log(`[GW-IN] ${req.method} id=${req.id}`, req.params || '')

    // 安全检查：未认证时仅允许 connect
    if (!client.authed && req.method !== 'connect') {
      respond(
        socket,
        req.id,
        false,
        undefined,
        errorShape(ErrorCodes.UNAUTHORIZED, 'not authenticated')
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
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`)
      )
      return
    }

    try {
      const result = await handler(req.params, client, ctx)
      respond(socket, req.id, result.ok, result.payload, result.error)
      if (req.method === 'connect' && result.ok) {
        clearTimeout(handshakeTimer)
      }
    } catch (err) {
      respond(socket, req.id, false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)))
    }
  })

  // 4. 连接清理逻辑
  const cleanup = (code?: number, reason?: string) => {
    clearTimeout(handshakeTimer)
    if (ctx.clients.has(client)) {
      const info = code ? `(code: ${code}${reason ? `, reason: ${reason}` : ''})` : ''
      console.log(`[GW-DISCONN] Client left: ${connId} ${info}`)
      ctx.clients.delete(client)
      ctx.nonces.delete(connId)
    }
  }

  socket.on('close', (code, reason) => cleanup(code, String(reason)))
  socket.on('error', (err) => {
    console.error(`[GW-ERR] Client socket error: ${connId}`, err)
    cleanup()
  })
}

// ============== 帮助函数 ==============

function send(socket: WebSocket, frame: EventFrame | ResponseFrame): void {
  if (socket.readyState === WebSocket.OPEN) {
    // if (frame.type === 'res') {
    //   console.log(`[GW-OUT] RES: id=${frame.id} ok=${frame.ok}`)
    // } else if (frame.event !== 'tick') {
    //   console.log(`[GW-OUT] EVENT: event=${frame.event}`)
    // }
    const data = JSON.stringify(frame)
    socket.send(data)
  }
}

function respond(
  socket: WebSocket,
  id: string,
  ok: boolean,
  payload?: unknown,
  error?: import('./protocol.js').ErrorShape
): void {
  send(socket, { type: 'res', id, ok, payload, error })
}
