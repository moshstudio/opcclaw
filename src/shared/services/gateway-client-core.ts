import {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type GatewayClientOptions,
  isResponseFrame,
  isEventFrame,
  REQUEST_TIMEOUT_MS,
  TICK_INTERVAL_MS
} from '../types/gateway'
import { type HelloOk, type GatewayMethod } from '../types/gateway/in'
import { newId } from '../utils/id'

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * 通用网关客户端抽象基类。
 * 事件分发：onAction 支持精确匹配（'chat:delta'）和命名空间前缀('chat')。
 */
export abstract class BaseGatewayClient {
  protected ws: WebSocket | null = null
  protected opts: GatewayClientOptions
  private pending = new Map<string, Pending>()
  private lastSeq: number | null = null
  protected closed = false
  protected backoffMs = 1000
  private static readonly MAX_BACKOFF_MS = 30_000
  private tickIntervalMs = TICK_INTERVAL_MS
  private lastTick: number | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null

  private eventListeners = new Set<(evt: EventFrame) => void>()
  private actionListeners = new Map<string, Set<(payload: unknown) => void>>()
  private onConnectListeners = new Set<(hello: HelloOk) => void>()
  private onCloseListeners = new Set<(code: number, reason: string) => void>()

  constructor(opts: GatewayClientOptions) {
    this.opts = opts
    if (opts.onEvent) this.addEventListener(opts.onEvent)
    if (opts.onConnect) this.onConnect(opts.onConnect)
  }

  public addEventListener(listener: (evt: EventFrame) => void) {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  public removeEventListener(listener: (evt: EventFrame) => void) {
    this.eventListeners.delete(listener)
  }

  /**
   * 订阅指定动作事件，类型安全。
   * 支持精确名：onAction('chat:delta', cb)
   * 支持命名空间：onAction('chat', cb) 接收所有 chat:* 事件
   */
  public onAction<A extends import('../types/gateway').ActionOrCategory>(
    action: A,
    listener: (payload: import('../types/gateway').PayloadOf<A>) => void
  ): () => void {
    if (!this.actionListeners.has(action)) {
      this.actionListeners.set(action, new Set())
    }
    const set = this.actionListeners.get(action)!
    const fn = listener as (payload: unknown) => void
    set.add(fn)
    return () => set.delete(fn)
  }

  public onConnect(listener: (hello: HelloOk) => void) {
    this.onConnectListeners.add(listener)
    return () => this.onConnectListeners.delete(listener)
  }

  public onClose(listener: (code: number, reason: string) => void) {
    this.onCloseListeners.add(listener)
    return () => this.onCloseListeners.delete(listener)
  }

  protected abstract createSocket(url: string): WebSocket | { on: unknown }

  async connect(): Promise<HelloOk> {
    this.closed = false
    return new Promise((resolve, reject) => {
      let resolved = false

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.ws?.close()
          reject(new Error('connection timeout: gateway server not responding'))
        }
      }, 5000)

      const ws = this.createSocket(this.opts.url)
      this.ws = ws as WebSocket

      const onError = (evt: unknown) => {
        const msg = (evt as { message?: string })?.message || 'Connection failed'
        if (!resolved) {
          resolved = true
          clearTimeout(connectionTimeout)
          reject(new Error(`connection failed: ${msg}`))
        }
      }

      const onMessage = (data: unknown) => {
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
          if (p.timer) clearTimeout(p.timer)
          this.pending.delete(res.id)
          if (res.ok) p.resolve(res.payload)
          else p.reject(new Error((res.error as { message?: string })?.message ?? 'request failed'))
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

          if (evt.event === 'system:tick') this.lastTick = Date.now()

          if (evt.event === 'connect:challenge') {
            const nonce = (evt.payload as { nonce: string }).nonce
            this.request<HelloOk>('connect', { token: this.opts.token, nonce })
              .then((hello) => {
                if (hello.policy?.tickIntervalMs) this.tickIntervalMs = hello.policy.tickIntervalMs
                this.backoffMs = 1000
                this.startTickWatch()
                if (!resolved) {
                  resolved = true
                  clearTimeout(connectionTimeout)
                  resolve(hello)
                }
                this.onConnectListeners.forEach((l) => l(hello))
              })
              .catch((err) => {
                if (!resolved) {
                  resolved = true
                  clearTimeout(connectionTimeout)
                  reject(err)
                }
              })
            return
          }

          this.eventListeners.forEach((l) => l(evt))
          // 精确动作分发
          this.actionListeners.get(evt.event)?.forEach((l) => l(evt.payload))
          // 命名空间前缀分发（'chat' 接收所有 chat:* 事件）
          const ns = evt.event.split(':')[0]
          if (ns !== evt.event) {
            this.actionListeners.get(ns)?.forEach((l) => l(evt.payload))
          }
        }
      }

      const onClose = (code: number, reason: string) => {
        this.ws = null
        this.stopTickWatch()
        this.flushPendingErrors(new Error(`connection closed (${code})`))
        if (!resolved) {
          resolved = true
          clearTimeout(connectionTimeout)
          reject(new Error(`connection closed before handshake (code: ${code})`))
        }
        this.onCloseListeners.forEach((l) => l(code, reason))
        this.opts.onClose?.(code, reason)
        this.scheduleReconnect()
      }

      if (typeof (ws as { on?: unknown }).on === 'function') {
        const nodeWs = ws as { on: (e: string, cb: (...a: unknown[]) => void) => void }
        nodeWs.on('error', onError)
        nodeWs.on('message', (d) => onMessage(d))
        nodeWs.on('close', (code, reason) => onClose(Number(code), String(reason)))
      } else {
        const browserWs = ws as WebSocket
        browserWs.onerror = onError
        browserWs.onmessage = (ev: MessageEvent) => onMessage(ev.data)
        browserWs.onclose = (ev: CloseEvent) => onClose(ev.code, ev.reason)
      }
    })
  }

  async request<T = unknown>(method: GatewayMethod, params?: unknown): Promise<T> {
    if (!this.ws || !this.isSocketOpen()) throw new Error('not connected')
    const id = newId()
    const frame: RequestFrame = { type: 'req', id, method, params }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject, timer })
      ;(this.ws as { send: (d: string) => void }).send(JSON.stringify(frame))
    })
  }

  private isSocketOpen() {
    return this.ws != null && (this.ws as WebSocket).readyState === 1
  }

  close(): void {
    this.closed = true
    this.stopTickWatch()
    this.ws?.close()
    this.flushPendingErrors(new Error('client closed'))
  }

  private scheduleReconnect() {
    if (this.closed || this.opts.autoReconnect === false) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 2, BaseGatewayClient.MAX_BACKOFF_MS)
    setTimeout(() => {
      if (!this.closed) this.connect().catch(() => {})
    }, delay)
  }

  private startTickWatch() {
    this.stopTickWatch()
    this.lastTick = Date.now()
    const interval = Math.max(this.tickIntervalMs, 1000)
    this.tickTimer = setInterval(() => {
      if (this.closed || !this.lastTick) return
      if (Date.now() - this.lastTick > this.tickIntervalMs * 2) this.ws?.close(4000, 'tick timeout')
    }, interval)
  }

  private stopTickWatch() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private flushPendingErrors(err: Error) {
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }
}
