import {
  GATEWAY_EVENTS_DOC,
  GATEWAY_METHODS_DOC,
  GATEWAY_COMMON_TYPES_DOC
} from '@shared/metadata/events'

/**
 * 渲染网关对接文档 HTML
 */
export function renderGatewayDoc(port: number): string {
  const highlightJson = (json: any) => {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2)
    }
    return json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match: string) => {
          let cls = 'number'
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'key'
            } else {
              cls = 'string'
            }
          } else if (/true|false/.test(match)) {
            cls = 'boolean'
          } else if (/null/.test(match)) {
            cls = 'null'
          }
          return `<span class="json-${cls}">${match}</span>`
        }
      )
  }

  const renderSection = (title: string, id: string, icon: string) => `
    <h2 id="${id}" class="section-title">
      <span class="icon">${icon}</span>
      ${title}
    </h2>
  `

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpcClaw Gateway API Reference</title>
  <style>
    :root {
      --bg: #09090b;
      --sidebar-bg: #030303;
      --card-bg: #18181b;
      --border: #27272a;
      --text-main: #fafafa;
      --text-dim: #a1a1aa;
      --primary: #6366f1;
      --secondary: #10b981;
      --accent: #8b5cf6;
      --code-bg: #0c0c0e;
    }

    /* 现代滚动条优化 */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; border: 2px solid var(--bg); }
    ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }

    * { box-sizing: border-box; scroll-behavior: smooth; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.6;
      margin: 0;
      display: flex;
    }

    /* 侧边栏 */
    aside {
      width: 280px;
      height: 100vh;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      position: fixed;
      padding: 32px 20px;
      overflow-y: auto;
      z-index: 100;
    }

    .logo {
      font-size: 1.25rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 40px;
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo::before { content: '◈'; font-size: 1.5rem; }

    nav ul { list-style: none; padding: 0; margin: 0; }
    nav .nav-group { margin-bottom: 24px; }
    nav .nav-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 12px; font-weight: 600; padding-left: 12px;}
    nav a {
      display: block;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.85rem;
      padding: 6px 12px;
      border-radius: 6px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin-bottom: 2px;
      border-left: 2px solid transparent;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    nav a:hover { color: var(--text-main); background: #ffffff0a; }
    nav a.active {
      color: var(--primary);
      background: #6366f115;
      font-weight: 600;
      border-left-color: var(--primary);
    }

    /* 主内容区 */
    main {
      margin-left: 280px;
      flex: 1;
      padding: 48px 64px;
      max-width: 1200px;
    }

    header { margin-bottom: 64px; }
    h1 { font-size: 3rem; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.02em; }
    .version-tag { background: var(--primary); color: white; font-size: 0.75rem; padding: 4px 12px; border-radius: 999px; margin-left: 12px; vertical-align: middle; }
    header p { font-size: 1.1rem; color: var(--text-dim); max-width: 600px; }

    .section-title {
      font-size: 1.5rem;
      margin: 64px 0 32px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .section-title .icon { background: var(--border); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 1rem; }

    /* 卡片设计 */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      margin-bottom: 24px;
      overflow: hidden;
      transition: border-color 0.3s;
    }
    .card:hover { border-color: #ffffff20; }
    .card-header {
      padding: 16px 24px;
      background: #ffffff05;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-body { padding: 24px; }

    .method-badge { font-family: monospace; font-weight: 700; color: var(--secondary); background: #10b98115; border: 1px solid #10b98130; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem; }
    .event-badge { font-family: monospace; font-weight: 700; color: var(--accent); background: #8b5cf615; border: 1px solid #8b5cf630; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem; }

    .desc { font-size: 0.95rem; color: var(--text-dim); margin-bottom: 20px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; display: block; letter-spacing: 0.05em; }

    /* 代码高亮 */
    pre {
      background: var(--code-bg);
      padding: 20px;
      border-radius: 12px;
      margin: 0;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
      border: 1px solid var(--border);
      overflow-x: auto;
    }
    .json-key { color: #818cf8; }
    .json-string { color: #34d399; }
    .json-number { color: #fbbf24; }
    .json-boolean { color: #f472b6; }
    .json-null { color: #94a3b8; }

    /* 参数表格 */
    .params-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .params-table th { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-dim); font-size: 0.75rem; }
    .params-table td { padding: 12px; border-bottom: 1px solid var(--border); }
    .params-name { font-family: monospace; color: var(--primary); font-weight: 600; }
    .params-type { font-family: monospace; font-size: 0.8rem; color: #94a3b8; }
    .optional { opacity: 0.5; font-style: italic; margin-left: 4px; }

    ol.flow { padding-left: 20px; }
    ol.flow li { margin-bottom: 12px; color: var(--text-dim); }
    ol.flow li strong { color: var(--text-main); }

    footer { margin-top: 100px; padding-top: 40px; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.8rem; text-align: center; }

    @media (max-width: 1024px) {
      aside { display: none; }
      main { margin-left: 0; padding: 24px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <aside>
    <a href="#" class="logo">猫爪Gateway</a>
    <nav>
      <div class="nav-group">
        <div class="nav-label">开始</div>
        <ul>
          <li><a href="#overview">协议概览</a></li>
          <li><a href="#handshake">握手流程</a></li>
          <li><a href="#frames">数据帧格式</a></li>
          <li><a href="#common-types">通用数据结构</a></li>
        </ul>
      </div>
      <div class="nav-group">
        <div class="nav-label">请求方法 (C &rarr; S)</div>
        <ul>
          ${GATEWAY_METHODS_DOC.map((m) => `<li><a href="#method-${m.method.replace(/:/g, '-')}" title="${m.description}">${m.method}</a></li>`).join('')}
        </ul>
      </div>
      <div class="nav-group">
        <div class="nav-label">推送事件 (S &rarr; C)</div>
        <ul>
          ${GATEWAY_EVENTS_DOC.map((e) => `<li><a href="#event-${e.type.replace(/:/g, '-')}" title="${e.description}">${e.type}</a></li>`).join('')}
        </ul>
      </div>
    </nav>
  </aside>

  <main>
    <header>
      <h1>网关对接文档 <span class="version-tag">v1.2.0</span></h1>
      <p>面向第三方开发者与 UI 终端的实时通信协议规范。采用 WebSocket BEM (Business Event Model) 架构。</p>
    </header>

    <section id="overview">
      ${renderSection('协议概览', 'intro', '🚀')}
      <div class="card">
        <div class="card-body">
          <p class="desc">网关服务运行在本地 <strong>${port}</strong> 端口。所有通信均通过 JSON 格式进行，支持双向实时推送。</p>
          <div class="grid">
            <div>
              <span class="label">连接地址</span>
              <pre>ws://127.0.0.1:${port}</pre>
            </div>
            <div>
              <span class="label">心跳机制</span>
              <p style="font-size: 0.85rem; color: var(--text-dim);">服务端每 1s 推送一次 <code>system:tick</code>。客户端无需发送 Ping 包，但需维持连接活性。</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="handshake">
      ${renderSection('握手与鉴权', 'auth', '🔑')}
      <div class="card" style="border-style: dashed;">
        <div class="card-body">
          <ol class="flow">
            <li><strong>建立连接</strong>: 连接成功后，服务端立即推送 <code>connect:challenge</code> 包含一个随机 <code>nonce</code>。</li>
            <li><strong>身份校验</strong>: 客户端需在 5s 内发送 <code>connect</code> 请求，携带 <code>token</code> (见设置) 和 <code>nonce</code>。</li>
            <li><strong>成功响应</strong>: 服务端校验通过后返回响应告知成功，否则将断开连接。</li>
          </ol>
        </div>
      </div>
    </section>

    <section id="frames">
      ${renderSection('数据帧格式', 'format', '📦')}
      <div class="grid">
        <div class="card">
          <div class="card-header"><span class="label" style="margin:0">Request (请求帧)</span></div>
          <div class="card-body">
            <pre>${highlightJson({ type: 'req', id: 'uuid', method: '...', params: {} })}</pre>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="label" style="margin:0">Response (响应帧)</span></div>
          <div class="card-body">
            <pre>${highlightJson({ type: 'res', id: 'uuid', ok: true, payload: {} })}</pre>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="label" style="margin:0">Event (事件帧 / 双向推送)</span></div>
        <div class="card-body">
          <pre>${highlightJson({ type: 'event', event: '...', payload: {}, seq: 123 })}</pre>
        </div>
      </div>
    </section>

    <section id="common-types">
      ${renderSection('通用数据结构', 'api-common', '🧩')}
      <div class="grid">
        ${GATEWAY_COMMON_TYPES_DOC.map(
          (t) => `
        <div class="card">
          <div class="card-header">
            <span class="method-badge" style="color:var(--text-main); background:transparent; border:none; border-bottom: 2px solid var(--primary); border-radius:0; padding:0;">${t.name}</span>
          </div>
          <div class="card-body">
            <div class="desc" style="font-size: 0.85rem; margin-bottom: 12px;">${t.description}</div>
            <pre style="padding: 12px; font-size: 0.75rem;">${highlightJson(t.model)}</pre>
          </div>
        </div>
        `
        ).join('')}
      </div>
    </section>

    <section id="methods">
      ${renderSection('请求方法列表', 'api-methods', '📡')}
      ${GATEWAY_METHODS_DOC.map(
        (m) => `
      <div class="card" id="method-${m.method.replace(/:/g, '-')}">
        <div class="card-header">
          <span class="method-badge">${m.method}</span>
          <span class="label" style="margin:0; color: var(--primary)">${m.category.toUpperCase()}</span>
        </div>
        <div class="card-body">
          <div class="desc">${m.description}</div>
          <div class="grid">
            <div>
              <span class="label">参数 (Params)</span>
              ${
                Array.isArray(m.params)
                  ? `
                <table class="params-table">
                  <thead><tr><th>参数名</th><th>类型</th><th>说明</th></tr></thead>
                  <tbody>
                    ${m.params
                      .map(
                        (p) => `
                    <tr>
                      <td class="params-name">${p.name}${p.optional ? '<span class="optional">?</span>' : ''}</td>
                      <td class="params-type">${p.type}</td>
                      <td>${p.description}</td>
                    </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              `
                  : `<pre>${m.params}</pre>`
              }
            </div>
            <div>
              <span class="label">预期返回 (Result / Payload)</span>
              <pre>${highlightJson(m.result)}</pre>
            </div>
          </div>
        </div>
      </div>
      `
      ).join('')}
    </section>

    <section id="events">
      ${renderSection('推送事件列表', 'api-events', '🔔')}
      ${GATEWAY_EVENTS_DOC.map(
        (ev) => `
      <div class="card" id="event-${ev.type.replace(/:/g, '-')}">
        <div class="card-header">
          <span class="event-badge">${ev.type}</span>
          <span class="label" style="margin:0; color: var(--accent)">${ev.channel.toUpperCase()}</span>
        </div>
        <div class="card-body">
          <div class="desc">${ev.description}</div>
          <div>
            <span class="label">数据负载 (Payload Structure)</span>
            <pre>${highlightJson(ev.payload)}</pre>
          </div>
        </div>
      </div>
      `
      ).join('')}
    </section>

    <footer>
      &copy; 2026 OpcClaw Project. 所有 API 随版本动态更新。
    </footer>
  </main>

  <script>
    // --- Scroll Spy & Smooth Navigation ---
    const navLinks = document.querySelectorAll('nav a');
    const sections = Array.from(document.querySelectorAll('section, .card[id]'));
    let isManualScrolling = false;

    // 观察者配置：当元素距离顶部 150px 时点亮
    const observerOptions = {
      root: null,
      rootMargin: '-10% 0px -85% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      if (isManualScrolling) return;

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          if (id) {
            navLinks.forEach(link => {
              link.classList.toggle('active', link.getAttribute('href') === '#' + id);
            });
          }
        }
      });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));

    // 点击平滑滚动与状态锁定
    navLinks.forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          isManualScrolling = true;

          // 更新 UI
          navLinks.forEach(a => a.classList.remove('active'));
          this.classList.add('active');

          // 获取目标偏移量
          const offsetTop = targetElement.offsetTop - 30;
          window.scrollTo({ top: offsetTop, behavior: 'smooth' });

          // 1秒后解除手动滚动锁定，让观察者接管
          setTimeout(() => { isManualScrolling = false; }, 800);
        }
      });
    });

    // 初始化：点亮第一个
    if (navLinks.length > 0) navLinks[0].classList.add('active');
  </script>
</body>
</html>
  `
}
