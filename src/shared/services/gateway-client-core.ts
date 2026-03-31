import {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type HelloOk,
  type GatewayClientOptions,
  type IGatewayClient,
  type GatewayMethod,
  type GatewayEvent,
  type GatewayAction,
  type AgentEventPayload,
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
  timer: ReturnType<typeof setTimeout> | number | null
}

/**
 * 通用网关客户端抽象逻辑
 *
 * 采用双层事件分发模型：
 * 1. 频道分流 (Channel): 对应基础通信信道，如 'chat', 'agent', 'models'。
 * 2. 动作分流 (Action): 为 BEM 模型提供业务二次分发，如 'agent:created', 'session:reset'。
 */
export abstract class BaseGatewayClient implements IGatewayClient {
  protected ws: WebSocket | any = null
  private pending = new Map<string, Pending>()
  private lastSeq: number | null = null
  protected opts: GatewayClientOptions
  private closed = false
  private onCloseListeners = new Set<(code: number, reason: string) => void>()

  /** 频道监听器：按 GatewayEvent 顶层路由，各频道负载类型互异 */
  private channelListeners = new Map<string, Set<(payload: unknown) => void>>()

  /** 动作监听器：按 Action 名业务二次分流，通常归属于 'agent' 或 'models' 频道 */
  private actionListeners = new Map<string, Set<(payload: unknown) => void>>()

  // 指数退避
  private backoffMs = 1000
  private static readonly MAX_BACKOFF_MS = 30_000

  // Tick 心跳监视
  private tickIntervalMs = TICK_INTERVAL_MS
  private lastTick: number | null = null
  private tickTimer: ReturnType<typeof setInterval> | number | null = null

  constructor(opts: GatewayClientOptions) {
    this.opts = opts
    if (opts.onEvent) this.addEventListener(opts.onEvent)
    if (opts.onConnect) this.onConnect(opts.onConnect)
  }

  private eventListeners = new Set<(evt: EventFrame) => void>()
  private onConnectListeners = new Set<(hello: HelloOk) => void>()

  public addEventListener(listener: (evt: EventFrame) => void) {
    this.eventListeners.add(listener)
    return () => this.removeEventListener(listener)
  }

  /**
   * 监听指定频道的事件 (Channel level, e.g. 'chat', 'agent')
   *
   * @param event 频道名称 (如 'chat')
   * @param listener 负载处理器，点击 payload 自动推断类型
   * @returns 取消监听函数
   */
  public onChannel<K extends GatewayEvent>(
    event: K,
    listener: (payload: Extract<EventFrame, { event: K }>['payload']) => void
  ) {
    if (!this.channelListeners.has(event)) {
      this.channelListeners.set(event, new Set())
    }
    const listeners = this.channelListeners.get(event)!
    const unknownListener = listener as (payload: unknown) => void
    listeners.add(unknownListener)
    return () => listeners.delete(unknownListener)
  }

  /**
   * 监听指定业务动作的事件 (Action level, e.g. 'agent:created')
   * 自动从对应的频道负载推断业务逻辑。
   *
   * @param action 动作标识 (namespace:action 风格)
   * @param listener 负载处理器 (如果是自定义动作，可通过泛型扩展类型)
   * @returns 取消监听函数
   */
  public onAction<T = unknown>(
    action: GatewayAction | (string & {}),
    listener: (payload: T) => void
  ) {
    if (!this.actionListeners.has(action)) {
      this.actionListeners.set(action, new Set())
    }
    const listeners = this.actionListeners.get(action)!
    const unknownListener = listener as (payload: unknown) => void
    listeners.add(unknownListener)
    return () => listeners.delete(unknownListener)
  }

  /**
   * 移除事件监听
   */
  public removeEventListener(listener: (evt: EventFrame) => void) {
    this.eventListeners.delete(listener)
  }

  /**
   * 添加连接成功监听
   */
  public onConnect(listener: (hello: HelloOk) => void) {
    this.onConnectListeners.add(listener)
    return () => this.onConnectListeners.delete(listener)
  }

  /**
   * 添加连接关闭监听
   */
  public onClose(listener: (code: number, reason: string) => void) {
    this.onCloseListeners.add(listener)
    return () => this.onCloseListeners.delete(listener)
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
      let handshakeResolved = false

      // 设置连接超时保护 (5秒)
      const connectionTimeout = setTimeout(() => {
        if (!handshakeResolved) {
          handshakeResolved = true
          this.ws?.close()
          reject(new Error('connection timeout: gateway server not responding'))
        }
      }, 5000)

      const ws = this.createSocket(this.opts.url)
      this.ws = ws

      const onError = (evt: { message?: string } | any) => {
        const errorMsg = evt?.message || 'Connection failed'
        if (!handshakeResolved) {
          handshakeResolved = true
          clearTimeout(connectionTimeout)
          reject(new Error(`connection failed: ${errorMsg}`))
        }
      }

      const onMessage = (data: string | Buffer | ArrayBuffer | any) => {
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
          if (p.timer) clearTimeout(p.timer as ReturnType<typeof setTimeout>)
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

          if (evt.event === 'system:tick') {
            this.lastTick = Date.now()
          }

          if (evt.event === 'connect:challenge') {
            const nonce = (evt.payload as { nonce: string; ts: number }).nonce
            this.request<HelloOk>('connect' as GatewayMethod, { token: this.opts.token, nonce })
              .then((hello) => {
                if (hello.policy?.tickIntervalMs) {
                  this.tickIntervalMs = hello.policy.tickIntervalMs
                }
                this.backoffMs = 1000
                this.startTickWatch()
                if (!handshakeResolved) {
                  handshakeResolved = true
                  clearTimeout(connectionTimeout)
                  resolve(hello)
                }
                this.onConnectListeners.forEach((l) => l(hello))
              })
              .catch((err) => {
                if (!handshakeResolved) {
                  handshakeResolved = true
                  clearTimeout(connectionTimeout)
                  reject(err)
                }
              })
            return
          }

          this.eventListeners.forEach((l) => l(evt))

          // --- 优化：统一分发逻辑 ---
          // 1. 频道分发
          this.channelListeners.get(evt.event)?.forEach((l) => l(evt.payload))

          // 2. 动作分发 (针对 payload 中带有 type 的事件)
          const payload = evt.payload as AgentEventPayload
          if (payload && typeof payload.type === 'string') {
            this.actionListeners.get(payload.type)?.forEach((l) => l(payload))
          }
        }
      }

      const onClose = (code: number, reason: string) => {
        this.ws = null
        this.stopTickWatch()
        this.flushPendingErrors(new Error(`connection closed (${code})`))

        // 关键修复：如果在握手阶段就关闭了，必须 reject 掉 promise
        if (!handshakeResolved) {
          handshakeResolved = true
          clearTimeout(connectionTimeout)
          reject(new Error(`connection closed before handshake (code: ${code})`))
        }

        this.onCloseListeners.forEach((l) => l(code, reason))
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

  async request<T = unknown>(method: GatewayMethod, params?: unknown): Promise<T> {
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
      clearInterval(this.tickTimer as ReturnType<typeof setInterval>)
      this.tickTimer = null
    }
  }

  private flushPendingErrors(err: Error): void {
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer as ReturnType<typeof setTimeout>)
      p.reject(err)
    }
    this.pending.clear()
  }
}
