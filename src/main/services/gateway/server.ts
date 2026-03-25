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
 */

import http from 'node:http'
import { WebSocketServer } from 'ws'
import type { AgentRegistry } from '@main/services/agent/registry'
import type { MiniAgentEvent } from '@main/services/agent/agent-events'
import { TICK_INTERVAL_MS } from './protocol'
import { type GwClient, type HandlerContext } from './handlers/index'
import { Broadcaster, createBroadcastFn } from './broadcaster'
import { setupConnectionHandler } from './connection-handler'
import { renderGatewayDoc } from './doc-renderer'
import { GATEWAY_EVENTS_DOC } from '@shared/metadata/events'
import { Logger, setGlobalLogLevel } from '@main/services/common/logger'
import { type GatewaySettings } from '@shared/types/config'

// ============== 类型 ==============

export type GatewayServerOptions = GatewaySettings & {
  registry: AgentRegistry
}

export type GatewayServer = {
  close: (opts?: { restartExpectedMs?: number }) => void
  port: number
}

// ============== 启动服务 ==============

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  const port = opts.port ?? 18789
  const clients = new Set<GwClient>()
  const nonces = new Map<string, string>()

  if (opts.logLevel) {
    setGlobalLogLevel(opts.logLevel)
  }
  setGlobalLogLevel('debug')

  const logger = new Logger('[Gateway]')
  const broadcast = createBroadcastFn(clients, logger)
  const startedAt = Date.now()

  const broadcaster = new Broadcaster(broadcast)

  // 注册全局智能体事件监听器，用于跨请求生命周期的自动广播
  const unsubAll = opts.registry.subscribeAll(async (_agentId: string, event: MiniAgentEvent) => {
    broadcaster.handleAgentEvent(event)
  })

  const ctx: HandlerContext = {
    registry: opts.registry,
    broadcast,
    broadcaster,
    clients,
    token: opts.token,
    nonces,
    startedAt,
    logger
  }

  // HTTP 服务（对齐 openclaw server-http.ts createGatewayHttpServer）
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const isJson =
      url.searchParams.get('format') === 'json' || req.headers.accept?.includes('application/json')

    if (url.pathname === '/events-doc') {
      if (isJson) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ events: GATEWAY_EVENTS_DOC }, null, 2))
        return
      }

      // 渲染美观的 HTML 文档
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderGatewayDoc(port))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ service: 'mini-gateway', uptimeMs: Date.now() - startedAt }))
  })

  // WebSocket 服务
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (socket) => {
    setupConnectionHandler(socket, ctx)
  })

  // Tick 定时器
  const tickTimer = setInterval(() => {
    broadcaster.dispatch({ type: 'system:tick', ts: Date.now() })
  }, TICK_INTERVAL_MS)

  // 监听
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', (err) => {
      logger.error('HTTP Server Error:', err)
      reject(err)
    })
    httpServer.listen(port, () => {
      logger.info(`Gateway server started on port ${port}`)
      resolve()
    })
  })

  // 优雅关闭
  const close = (opts?: { restartExpectedMs?: number }) => {
    broadcaster.dispatch({
      type: 'system:shutdown',
      reason: 'server closing',
      restartExpectedMs: opts?.restartExpectedMs ?? null
    })
    clearInterval(tickTimer)
    unsubAll()
    for (const c of clients) {
      try {
        c.socket.close(1012, 'service restart')
      } catch {
        // ignore
      }
    }
    clients.clear()
    wss.close()
    httpServer.close()
  }

  return { close, port }
}
