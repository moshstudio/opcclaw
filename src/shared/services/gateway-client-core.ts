import {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type HelloOk,
  type GatewayClientOptions,
  type IGatewayClient,
  isResponseFrame,
  isEventFrame,
  REQUEST_TIMEOUT_MS,
  TICK_INTERVAL_MS
} from '../types/gateway'
import { newId } from '../utils/id'

// ============== 内部类型 ==============

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: any // Node.js.Timeout or number (browser)
}

/**
 * 通用网关客户端抽象逻辑
 *
 * 不依赖特定的 WebSocket 实现，需要子类提供。
 */
export abstract class BaseGatewayClient implements IGatewayClient {
  protected ws: any = null
  private pending = new Map<string, Pending>()
  private lastSeq: number | null = null
  protected opts: GatewayClientOptions
  private closed = false

  // 指数退避
  private backoffMs = 1000
  private static readonly MAX_BACKOFF_MS = 30_000

  // Tick 心跳监视
  private tickIntervalMs = TICK_INTERVAL_MS
  private lastTick: number | null = null
  private tickTimer: any = null

  constructor(opts: GatewayClientOptions) {
    this.opts = opts
  }

  /**
   * 设置事件回调
   */
  public setEventCallback(onEvent: (evt: EventFrame) => void) {
    this.opts.onEvent = onEvent
  }

  /**
   * 由子类实现具体的 WebSocket 创建逻辑
   */
  protected abstract createSocket(url: string): any

  /**
   * 连接 Gateway 并完成握手
   */
  async connect(): Promise<HelloOk> {
    this.closed = false
    return new Promise((resolve, reject) => {
      const ws = this.createSocket(this.opts.url)
      this.ws = ws
      let handshakeResolved = false

      const onError = (evt: any) => {
        const errorMsg = evt?.message || 'Connection failed'
        if (!handshakeResolved) {
          handshakeResolved = true
          reject(new Error(`connection failed: ${errorMsg}`))
        }
      }

      const onMessage = (data: any) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(data))
        } catch {
          return
        }

        if (isResponseFrame(parsed)) {
          const res = parsed as ResponseFrame
          const p = this.pending.get(res.id)
          if (!p) return
          clearTimeout(p.timer)
          this.pending.delete(res.id)
          if (res.ok) {
            p.resolve(res.payload)
          } else {
            p.reject(new Error(res.error?.message ?? 'request failed'))
          }
          return
        }

        if (isEventFrame(parsed)) {
          const evt = parsed as EventFrame
          if (typeof evt.seq === 'number' && evt.seq > 0) {
            if (this.lastSeq !== null && evt.seq > this.lastSeq + 1) {
              this.opts.onGap?.({ expected: this.lastSeq + 1, received: evt.seq })
            }
            this.lastSeq = evt.seq
          }

          if (evt.event === 'tick') {
            this.lastTick = Date.now()
          }

          if (evt.event === 'connect.challenge') {
            const nonce = (evt.payload as { nonce?: string })?.nonce
            this.request<HelloOk>('connect', { token: this.opts.token, nonce })
              .then((hello) => {
                if (hello.policy?.tickIntervalMs) {
                  this.tickIntervalMs = hello.policy.tickIntervalMs
                }
                this.backoffMs = 1000
                this.startTickWatch()
                if (!handshakeResolved) {
                  handshakeResolved = true
                  resolve(hello)
                } else {
                  this.opts.onConnect?.(hello)
                }
              })
              .catch((err) => {
                if (!handshakeResolved) {
                  handshakeResolved = true
                  reject(err)
                }
              })
            return
          }

          this.opts.onEvent?.(evt)
        }
      }

      const onClose = (code: number, reason: string) => {
        this.ws = null
        this.stopTickWatch()
        this.flushPendingErrors(new Error(`connection closed (${code})`))
        this.opts.onClose?.(code, reason)
        this.scheduleReconnect()
      }

      // 适配不同的 WebSocket 实现 (ws vs browser)
      if (typeof ws.on === 'function') {
        // ws (NodeJS)
        ws.on('error', (err: any) => onError(err))
        ws.on('message', onMessage)
        ws.on('close', (code: any, reason: any) => onClose(code, String(reason)))
      } else {
        // Browser WebSocket
        ws.onerror = (evt: any) => onError(evt)
        ws.onmessage = (ev: MessageEvent) => onMessage(ev.data)
        ws.onclose = (ev: CloseEvent) => onClose(ev.code, ev.reason)
      }
    })
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || !this.isSocketOpen()) {
      throw new Error('not connected')
    }
    const id = newId()
    const frame: RequestFrame = { type: 'req', id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer
      })

      this.ws!.send(JSON.stringify(frame))
    })
  }

  private isSocketOpen(): boolean {
    if (!this.ws) return false
    // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
    return this.ws.readyState === 1
  }

  close(): void {
    this.closed = true
    this.stopTickWatch()
    this.ws?.close()
    this.flushPendingErrors(new Error('client closed'))
  }

  private scheduleReconnect(): void {
    if (this.closed || this.opts.autoReconnect === false) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 2, BaseGatewayClient.MAX_BACKOFF_MS)
    setTimeout(() => {
      if (this.closed) return
      this.reconnect()
    }, delay)
  }

  private reconnect(): void {
    this.lastSeq = null
    this.lastTick = null
    this.connect().catch(() => {})
  }

  private startTickWatch(): void {
    this.stopTickWatch()
    this.lastTick = Date.now()
    const interval = Math.max(this.tickIntervalMs, 1000)
    this.tickTimer = setInterval(() => {
      if (this.closed || !this.lastTick) return
      const gap = Date.now() - this.lastTick
      if (gap > this.tickIntervalMs * 2) {
        this.ws?.close(4000, 'tick timeout')
      }
    }, interval)
  }

  private stopTickWatch(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private flushPendingErrors(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }
}
