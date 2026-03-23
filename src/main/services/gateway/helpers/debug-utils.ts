/**
 * Gateway 调试辅助工具
 */

/**
 * 格式化网关调试数据
 * 针对 tick 等高频数据进行简写，其他数据完整展示
 */
export function formatGatewayDebugData(data: any): string {
  try {
    const frame = typeof data === 'string' ? JSON.parse(data) : data

    // 1. 处理事件帧 (event)
    if (frame?.type === 'event' || frame?.event) {
      const eventName = frame.event || frame.type
      if (eventName === 'system:tick' || eventName === 'tick') {
        const ts = frame.payload?.ts || frame.ts
        const seq = frame.seq !== undefined ? ` seq=${frame.seq}` : ''
        return `[Tick${seq} ts=${ts}]`
      }
    }

    // 2. 处理请求帧 (req)
    if (frame?.method) {
      return `[REQ] ${frame.method} id=${frame.id} params=${JSON.stringify(frame.params)}`
    }

    // 3. 处理响应帧 (res)
    if (frame?.type === 'res') {
      return `[RES] id=${frame.id} ok=${frame.ok}${frame.error ? ` err=${JSON.stringify(frame.error)}` : ` payload=${JSON.stringify(frame.payload)}`}`
    }

    // 兜底：完整 JSON
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return String(data)
  }
}
