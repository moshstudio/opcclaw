import { GATEWAY_EVENTS_DOC } from '@shared/metadata/events'

/**
 * 渲染网关对接文档 HTML
 */
export function renderGatewayDoc(port: number): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>OpenClaw Gateway BEM Events Doc</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #e4e4e7; line-height: 1.5; padding: 40px; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 2.5rem; background: linear-gradient(90deg, #60a5fa, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }
    .desc { color: #71717a; margin-bottom: 2rem; font-size: 0.875rem; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin-bottom: 1.5rem; overflow: hidden; }
    .card-header { padding: 16px 20px; background: #27272a50; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
    .card-body { padding: 20px; }
    .badge { padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: bold; border: 1px solid rgba(255,255,255,0.1); }
    .chat { color: #60a5fa; border-color: #60a5fa20; background: #60a5fa10; }
    .agent { color: #34d399; border-color: #34d39920; background: #34d39910; }
    .type { font-family: monospace; font-size: 13px; color: #93c5fd; }
    pre { background: #000; padding: 12px; border-radius: 6px; font-size: 11px; color: #10b981; overflow-x: auto; border: 1px solid #27272a; }
    .label { font-size: 0.75rem; color: #a1a1aa; margin-bottom: 4px; display: block; }
    .grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px; }
    code { font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; border-bottom: 1px solid #27272a; padding-bottom: 1rem;">
      <div>
        <h1>网关对接文档 (BEM)</h1>
        <p style="color: #71717a; margin: 0; font-size: 0.875rem;">实时提取自后端网关分发器，包含当前版本支持的所有推送事件及协议规范。</p>
      </div>
      <div style="text-align: right;">
        <span class="badge" style="background: #3b82f620; color: #3b82f6; border-color: #3b82f630;">v1.0.0</span>
      </div>
    </div>

    <!-- 协议说明板块 -->
    <section style="margin-bottom: 4rem;">
      <h2 style="color: #60a5fa; font-size: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px;">
        <span style="background: #60a5fa; width: 4px; height: 18px; border-radius: 2px;"></span>
        1. 协议概览 & 握手流程
      </h2>
      
      <div class="card" style="border-style: dashed; background: transparent;">
        <div class="card-body">
          <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #a1a1aa;">
            <li style="margin-bottom: 12px;">
              <strong style="color: #e4e4e7;">建立连接</strong>: 客户端连接至 <code style="color: #93c5fd;">ws://127.0.0.1:${port}</code>
            </li>
            <li style="margin-bottom: 12px;">
              <strong style="color: #e4e4e7;">接收挑战 (Challenge)</strong>: 服务端主动推送 <code style="color: #34d399;">connect:challenge</code> 事件，包含一个随机 <code style="color: #34d399;">nonce</code>。
            </li>
            <li style="margin-bottom: 12px;">
              <strong style="color: #e4e4e7;">身份校验 (Auth)</strong>: 客户端需发送一次 <code style="color: #60a5fa;">connect</code> 请求，携带上述 <code style="color: #60a5fa;">nonce</code> 和设置中的 <code style="color: #60a5fa;">token</code>。
            </li>
            <li style="margin-bottom: 0;">
              <strong style="color: #e4e4e7;">握手成功</strong>: 服务端返回响应 <code style="color: #34d399;">ok: true</code>。若 5s 内未完成校验，连接将被强制断开。
            </li>
          </ol>
        </div>
      </div>

      <h2 style="color: #60a5fa; font-size: 1.25rem; margin-top: 2.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px;">
        <span style="background: #34d399; width: 4px; height: 18px; border-radius: 2px;"></span>
        2. 数据帧格式 (JSON)
      </h2>

      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 24px;">
        <div class="card">
          <div class="card-header"><span class="type">Request (客户端 → 服务端)</span></div>
          <div class="card-body">
            <pre style="margin: 0;">{
  "type": "req",
  "id": "随机ID",
  "method": "方法名",
  "params": { ... }
}</pre>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="type">Response (服务端 → 客户端)</span></div>
          <div class="card-body">
            <pre style="margin: 0;">{
  "type": "res",
  "id": "对应请求ID",
  "ok": true,
  "payload": { ... }
}</pre>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div class="card-header"><span class="type">Event (双向推送 / Server Push)</span></div>
        <div class="card-body">
          <pre style="margin: 0;">{
  "type": "event",
  "event": "事件名",
  "payload": { ... },
  "seq": 1024 // 递增序列号，用于检测丢包
}</pre>
        </div>
      </div>
    </section>

    <h2 style="color: #60a5fa; font-size: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px;">
      <span style="background: #a855f7; width: 4px; height: 18px; border-radius: 2px;"></span>
      3. 详细事件列表
    </h2>
    <p class="desc" style="margin-bottom: 1rem;">下列事件均通过上述 <strong>Event 帧</strong> 格式下发。</p>
    
    ${GATEWAY_EVENTS_DOC.map(
      (ev) => `
    <div class="card">
      <div class="card-header">
        <span class="type">${ev.type}</span>
        <span class="badge ${ev.category}">${ev.channel.toUpperCase()}</span>
      </div>
      <div class="card-body">
        <div class="grid">
          <div>
            <span class="label">描述</span>
            <div style="font-size: 0.9rem;">${ev.description}</div>
          </div>
          <div>
            <span class="label">数据负载结构 (Payload)</span>
            <pre>${JSON.stringify(ev.payload, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
    `
    ).join('')}
  </div>
</body>
</html>
  `
}
