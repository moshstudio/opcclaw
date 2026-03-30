import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright'
import { Logger } from '../common/logger'
import { ConfigService } from '../config/config-service'
import type { Tool, ToolContext } from './types'
import { ConfirmProvider } from '../agent/core/confirm-provider'

const logger = new Logger('Browser')

// ==========================================
// 1. 类型定义与接口
// ==========================================

/**
 * 浏览器操作请求
 */
export interface ActRequest {
  kind: 'click' | 'type' | 'scroll' | 'hover'
  targetId?: string // snapshot 分配的编号，如 "button:1"
  text?: string // 元素文本或输入内容
}

/**
 * 浏览器会话方案接口
 */
export interface BrowserEngine {
  connect(sessionKey: string, ctx: ToolContext, initialUrl?: string): Promise<void>
  navigate(sessionKey: string, url: string): Promise<string>
  screenshot(sessionKey: string, savePath: string): Promise<string>
  snapshot(sessionKey: string): Promise<string>
  act(sessionKey: string, request: ActRequest): Promise<string>
  switchTab(sessionKey: string, index: number): Promise<string>
  setVisible(sessionKey: string, visible: boolean): Promise<string>
  close(sessionKey?: string): Promise<void>
}

/**
 * 会话状态，维护 Context 与当前活跃 Page
 */
interface SessionState {
  context: BrowserContext
  page: Page
}

// ==========================================
// 2. 核心逻辑工具函数
// ==========================================

/**
 * 临时绕过系统代理执行操作 (用于连接 127.0.0.1 的服务)
 */
async function withNoProxy<T>(fn: () => Promise<T>): Promise<T> {
  const backups: Record<string, string | undefined> = {}
  const proxyKeys = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy'
  ]

  for (const k of proxyKeys) {
    backups[k] = process.env[k]
    delete process.env[k]
  }

  try {
    return await fn()
  } finally {
    for (const k of proxyKeys) {
      if (backups[k] !== undefined) process.env[k] = backups[k]
    }
  }
}

/**
 * 生成页面结构快照 (文本流格式，保留语义与交互 ID)
 */
async function generateSnapshot(page: Page): Promise<string> {
  const snapshotData = await page.evaluate(() => {
    // 1. 识别并锚定所有真实可见的可交互元素
    const selectors = [
      'a',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="tab"]',
      'summary',
      '[onclick]'
    ]
    const elements = document.querySelectorAll(selectors.join(', '))
    let idCounter = 1

    elements.forEach((el) => {
      const element = el as HTMLElement
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)

      // 过滤不可见、过小或禁止交互的元素
      if (
        rect.width < 2 ||
        rect.height < 2 ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      )
        return

      const tag = element.tagName.toLowerCase()
      const role = element.getAttribute('role')
      const type = element.getAttribute('type')

      // 根据元素特征确定语义化前缀
      let prefix = tag
      if (tag === 'a' || role === 'link') prefix = 'link'
      else if (tag === 'button' || role === 'button') prefix = 'button'
      else if (tag === 'input' && type) prefix = type
      else if (['checkbox', 'radio'].includes(type || '')) prefix = type!

      element.setAttribute('data-opcclaw-id', `${prefix}:${idCounter++}`)
    })

    // 2. 深度清理 DOM，移除干扰性噪声
    const bodyClone = document.body.cloneNode(true) as HTMLElement
    const noiseSelectors = [
      'script',
      'style',
      'noscript',
      'svg',
      'canvas',
      'map',
      'link',
      'meta',
      'iframe'
    ]
    noiseSelectors.forEach((s) => bodyClone.querySelectorAll(s).forEach((n) => n.remove()))

    // 3. 递归重组节点：将交互标识嵌入文本流
    const processNode = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const id = el.getAttribute('data-opcclaw-id')

        if (id) {
          const rawText = (
            el.innerText ||
            el.getAttribute('placeholder') ||
            el.getAttribute('aria-label') ||
            ''
          ).trim()
          const cleanText = rawText.substring(0, 60).replace(/\s+/g, ' ')
          el.innerHTML = `[${id}]${cleanText}`
          el.removeAttribute('data-opcclaw-id')
          return
        }

        // 移除空节点
        if (!el.innerText.trim() && el.children.length === 0) {
          el.remove()
          return
        }

        Array.from(el.childNodes).forEach(processNode)
      }
    }
    processNode(bodyClone)

    // 4. 去重与排版美化
    return bodyClone.innerText
      .split('\n')
      .map((line) => line.trim().replace(/\s{2,}/g, ' '))
      .filter((line) => line.length > 0)
      .join('\n')
      .replace(/\n{2,}/g, '\n')
      .substring(0, 15000)
      .trim()
  })

  // 5. 组合 Tab 列表元数据
  const allPages = page.context().pages()
  const pageInfos = await Promise.all(
    allPages.map(async (p, i) => {
      const isActive = p === page
      const title = await p.title().catch(() => '...')
      const url = p.url()
      return `${isActive ? '👉' : ''}T${i}:"${title}"(${url.substring(0, 40)}${url.length > 40 ? '..' : ''})`
    })
  )

  return `### 📑Tabs\n${pageInfos.join('\n')}\n\n### 📄Page\n${snapshotData}`
}

/**
 * 智能定位元素：优先匹配 ID，其次尝试语义化文本匹配
 */
async function getSmartLocator(
  page: Page,
  targetId?: string,
  text?: string
): Promise<{ locator: Locator; method: string } | null> {
  // 1. ID 精准匹配 (Snapshot 格式如 "link:1")
  if (targetId) {
    const rawId = targetId.replace(/^\[|\]|#/g, '').trim()
    const idLocator = page.locator(`[data-opcclaw-id="${rawId}"]`)
    if ((await idLocator.count().catch(() => 0)) > 0) {
      return { locator: idLocator.first(), method: `ID: ${rawId}` }
    }

    // 数字模糊匹配 (支持只输入数字)
    const numOnly = rawId.replace(/[^0-9]/g, '')
    if (numOnly) {
      const fuzzyIdLocator = page
        .locator(`[data-opcclaw-id$=":${numOnly}"]`)
        .or(page.locator(`[data-opcclaw-id="${numOnly}"]`))
      if ((await fuzzyIdLocator.count().catch(() => 0)) > 0) {
        return { locator: fuzzyIdLocator.first(), method: `ID(数字): ${numOnly}` }
      }
    }
  }

  // 2. 语义化文本匹配
  if (text) {
    const strategies = [
      { loc: page.getByRole('button', { name: text, exact: false }), name: '按钮' },
      { loc: page.getByRole('link', { name: text, exact: false }), name: '链接' },
      { loc: page.getByPlaceholder(text), name: '占位符' },
      { loc: page.getByLabel(text), name: '标签' },
      { loc: page.getByText(text, { exact: false }), name: '文本' }
    ]

    for (const s of strategies) {
      if ((await s.loc.count().catch(() => 0)) > 0) {
        return { locator: s.loc.first(), method: `文本(${s.name}): "${text}"` }
      }
    }
  }

  return null
}

/**
 * 执行元素交互动作
 */
async function executeAct(page: Page, request: ActRequest): Promise<string> {
  if (request.kind === 'scroll') {
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(1000)
    return '✅ 滚动完毕'
  }

  const target = await getSmartLocator(page, request.targetId, request.text)
  if (!target) {
    throw new Error(`无法定位元素: ${request.targetId || ''} ${request.text || ''}`)
  }

  const { locator, method } = target
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})

  switch (request.kind) {
    case 'click':
      await locator.click({ timeout: 10000 })
      break
    case 'type':
      if (request.text === undefined) throw new Error('type 动作需提供 text')
      await locator.fill(request.text, { timeout: 10000 })
      await locator.press('Enter').catch(() => {}) // 商业级自动化的增强逻辑
      break
    case 'hover':
      await locator.hover({ timeout: 10000 })
      break
    default:
      throw new Error(`不支持的动作: ${request.kind}`)
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {})
  return `✅ 成功通过 ${method} 执行 ${request.kind}`
}

// ==========================================
// 3. 抽象引擎基类
// ==========================================

abstract class BasePlaywrightEngine implements BrowserEngine {
  protected browser: Browser | null = null
  protected sessions = new Map<string, SessionState>()

  abstract connect(sessionKey: string, ctx: ToolContext, initialUrl?: string): Promise<void>

  protected isBrowserAlive(): boolean {
    return !!this.browser && this.browser.isConnected()
  }

  protected isSessionValid(sessionKey: string): boolean {
    const session = this.sessions.get(sessionKey)
    if (!session) return false
    // 检查 Context 是否有效
    try {
      // 只要不报错且 context 存在，且浏览器还连着
      return this.isBrowserAlive() && session.context.pages() !== undefined
    } catch {
      return false
    }
  }

  protected async ensureSession(sessionKey: string): Promise<SessionState> {
    let session = this.sessions.get(sessionKey)
    if (!session) throw new Error(`会话 ${sessionKey} 尚未初始化`)

    // 1. 如果 Context 已失效，可能需要清理（这步理论上 connect 已经做了，这里是双保险）
    if (!this.isBrowserAlive()) {
      this.browser = null
      this.sessions.clear()
      throw new Error('浏览器已断开连接，请重试')
    }

    // 2. 如果原页面关闭，尝试回退或新建
    if (session.page.isClosed()) {
      const pages = session.context.pages()
      if (pages.length > 0) {
        session.page = pages[pages.length - 1]
      } else {
        // 如果 Context 还在但页面全关了，自动开一个新页
        try {
          session.page = await session.context.newPage()
        } catch (e) {
          this.sessions.delete(sessionKey)
          throw new Error('无法创建新页面，会话可能已失效')
        }
      }
    }
    return session
  }

  async navigate(sessionKey: string, url: string) {
    const { page } = await this.ensureSession(sessionKey)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    return `✅ 跳转完成: ${url}`
  }

  async screenshot(sessionKey: string, savePath: string) {
    const { page } = await this.ensureSession(sessionKey)
    await page.screenshot({ path: savePath, fullPage: true })
    return `✅ 截图已保存`
  }

  async snapshot(sessionKey: string) {
    const { page } = await this.ensureSession(sessionKey)
    return await generateSnapshot(page)
  }

  async act(sessionKey: string, request: ActRequest) {
    const { page } = await this.ensureSession(sessionKey)
    return await executeAct(page, request)
  }

  async switchTab(sessionKey: string, index: number) {
    const session = await this.ensureSession(sessionKey)
    const pages = session.context.pages()
    if (!pages[index]) throw new Error(`标签页 T${index} 不存在`)
    session.page = pages[index]
    await session.page.bringToFront().catch(() => {})
    return `✅ 已切换到标签页 T${index}: "${await session.page.title().catch(() => '...')}"`
  }

  abstract setVisible(sessionKey: string, visible: boolean): Promise<string>

  async close(sessionKey?: string) {
    if (sessionKey) {
      const session = this.sessions.get(sessionKey)
      if (session) {
        await session.context.close().catch(() => {})
        this.sessions.delete(sessionKey)
      }
    } else {
      if (this.browser) {
        await this.browser.close().catch(() => {})
        this.browser = null
      }
      this.sessions.clear()
    }
  }
}

// ==========================================
// 4. Host 模式实现 (持久化、绕过检测)
// ==========================================

class PlaywrightHostEngine extends BasePlaywrightEngine {
  private readonly port = 9222

  async connect(sessionKey: string, ctx: ToolContext, initialUrl?: string) {
    if (ctx.abortSignal?.aborted) throw new Error('操作已中止')

    // 1. 检查浏览器连接状态，若已断开则清理
    if (this.browser && !this.browser.isConnected()) {
      logger.warn('检测到 Host 浏览器已断开连接，正在重置状态...')
      this.browser = null
      this.sessions.clear()
    }

    // 2. 建立/恢复浏览器连接
    if (!this.browser) {
      let reachable = await this.isPortReady()

      if (!reachable) {
        const confirmed = await ConfirmProvider.confirmOpenHostBrowser(ctx)

        if (!confirmed) throw new Error('用户取消了 Host 浏览器启动')

        await this.launchLocalBrowser(initialUrl)
        reachable = await this.pollPort(60)
        if (!reachable) throw new Error('Host 浏览器启动超时 (端口 9222 未就绪)')
      }

      const wsUrl = await this.getWebSocketUrl()
      this.browser = await withNoProxy(() => chromium.connectOverCDP(wsUrl))
      logger.info('✅ 已成功连接到持久化 Host 浏览器')
    }

    // 3. 检查 Session 有效性
    if (this.sessions.has(sessionKey) && !this.isSessionValid(sessionKey)) {
      logger.warn(`会话 ${sessionKey} 已失效，正在移除...`)
      this.sessions.delete(sessionKey)
    }

    // 4. 创建或恢复 Session
    if (!this.sessions.has(sessionKey)) {
      const contexts = this.browser.contexts()
      const context = contexts[0] || (await this.browser.newContext())

      // 监听新页面，自动同步到当前 session
      context.on('page', (p) => {
        const s = this.sessions.get(sessionKey)
        if (s && s.context === context) s.page = p
      })

      const pages = context.pages()
      let page = pages[pages.length - 1]
      if (!page || page.isClosed()) {
        page = await context.newPage()
      }
      this.sessions.set(sessionKey, { context, page })
    }
  }

  private async isPortReady(): Promise<boolean> {
    return await withNoProxy(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, {
          signal: AbortSignal.timeout(800)
        })
        return res.status === 200
      } catch {
        return false
      }
    })
  }

  private async pollPort(maxAttempts: number): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isPortReady()) return true
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  }

  private async getWebSocketUrl(): Promise<string> {
    return await withNoProxy(async () => {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/version`)
      const data = await res.json()
      return (data.webSocketDebuggerUrl as string).replace('localhost', '127.0.0.1')
    })
  }

  private async launchLocalBrowser(initialUrl?: string) {
    const userDataDir = path.join(ConfigService.getInstance().getRootPath(), 'browser-data', 'host')
    await fs.mkdir(userDataDir, { recursive: true })

    const exePath = this.findBrowserExe()
    if (!exePath) throw new Error('未找到 Chrome 或 Edge 浏览器安装路径')

    const args = [
      `--remote-debugging-port=${this.port}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${userDataDir}`,
      '--remote-allow-origins=*',
      '--start-minimized',
      '--no-first-run',
      '--password-store=basic',
      '--disable-features=Translate,MediaRouter'
    ]
    if (initialUrl) args.push(initialUrl)

    const proc = spawn(exePath, args, { detached: true, stdio: 'ignore', shell: false })
    proc.unref()
  }

  private findBrowserExe(): string | null {
    if (process.platform !== 'win32') return null
    const paths = [
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Google\\Chrome\\Application\\chrome.exe'
      ),
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Google\\Chrome\\Application\\chrome.exe'
      ),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Microsoft\\Edge\\Application\\msedge.exe'
      )
    ]
    return paths.find((p) => existsSync(p)) || null
  }

  async setVisible(sessionKey: string, visible: boolean) {
    const { page } = await this.ensureSession(sessionKey)
    const success = await this.setWindowState(page, visible ? 'normal' : 'minimized')
    return success ? `✅ 窗口已${visible ? '还原' : '最小化'}` : `❌ 显隐操作失败`
  }

  /**
   * 内部方法：设置指定页面的窗口状态
   */
  private async setWindowState(page: Page, state: 'normal' | 'minimized'): Promise<boolean> {
    try {
      const cdp = await page.context().newCDPSession(page)
      const { windowId } = (await cdp.send('Browser.getWindowForTarget')) as { windowId: number }
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } })
      await cdp.detach()
      return true
    } catch (err) {
      logger.warn(`设置窗口状态失败 [${state}]:`, err)
      return false
    }
  }

  async navigate(sessionKey: string, url: string) {
    const res = await super.navigate(sessionKey, url)
    const { page } = await this.ensureSession(sessionKey)
    await this.checkInteractionFlow(page)
    return res
  }

  async act(sessionKey: string, request: ActRequest) {
    const res = await super.act(sessionKey, request)
    const { page } = await this.ensureSession(sessionKey)
    await this.checkInteractionFlow(page)
    return res
  }

  /**
   * 智能检测是否需要用户干预 (如登录、验证码)
   */
  private async checkInteractionFlow(page: Page) {
    const needsIntervention = await page.evaluate(() => {
      const keywords = ['登录', '验证码', 'login', 'captcha', 'signin', '人机']
      const content = document.body.innerText.toLowerCase()
      const url = location.href.toLowerCase()

      const hasKeywords = keywords.some((k) => content.includes(k) || url.includes(k))
      const hasNoProfile = !['我的', '个人', 'profile', 'logout', '退出'].some((k) =>
        content.includes(k)
      )

      return hasKeywords && hasNoProfile
    })

    if (needsIntervention) {
      logger.warn('检测到可能需要手动交互 (登录/验证)，正在唤出浏览器窗口...')
      await this.setWindowState(page, 'normal')
      await page.bringToFront().catch(() => {})
    }
  }
}

// ==========================================
// 5. Sandbox 模式实现 (轻量、隔离)
// ==========================================

class PlaywrightSandboxEngine extends BasePlaywrightEngine {
  async connect(sessionKey: string, ctx: ToolContext) {
    if (ctx.abortSignal?.aborted) throw new Error('操作已中止')

    if (this.browser && !this.browser.isConnected()) {
      this.browser = null
      this.sessions.clear()
    }

    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false })
    }

    if (this.sessions.has(sessionKey) && !this.isSessionValid(sessionKey)) {
      this.sessions.delete(sessionKey)
    }

    if (!this.sessions.has(sessionKey)) {
      const context = await this.browser.newContext()
      context.on('page', (p) => {
        const s = this.sessions.get(sessionKey)
        if (s && s.context === context) s.page = p
      })
      const page = await context.newPage()
      this.sessions.set(sessionKey, { context, page })
    }
  }

  async setVisible(sessionKey: string, visible: boolean) {
    if (visible) {
      const { page } = await this.ensureSession(sessionKey)
      await page.bringToFront().catch(() => {})
    }
    return '✅ [Sandbox] 已尝试置顶'
  }
}

// ==========================================
// 6. 工具导出定义
// ==========================================

const hostEngine = new PlaywrightHostEngine()
const sandboxEngine = new PlaywrightSandboxEngine()

export const browserTool: Tool<{
  action: 'navigate' | 'snapshot' | 'act' | 'screenshot' | 'close' | 'switch_tab' | 'show' | 'hide'
  env?: 'sandbox' | 'host'
  url?: string
  targetId?: string
  tabIndex?: number
  request?: ActRequest
}> = {
  name: 'browser',
  category: 'runtime',
  description:
    '全能浏览器自动化工具。支持 Sandbox (一次性临时环境) 和 Host (持久化账号环境) 模式。一次性操作使用 sandbox；账号相关、有后续步骤的操作使用 host。优先使用host。',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['navigate', 'snapshot', 'act', 'screenshot', 'close', 'switch_tab', 'show', 'hide']
      },
      env: {
        type: 'string',
        enum: ['sandbox', 'host'],
        description:
          '运行环境：一次性简单操作使用 sandbox；登录账号、长流程或预期有后续步骤的操作使用 host。默认 host'
      },
      url: { type: 'string', description: '跳转 URL' },
      targetId: { type: 'string', description: '操作目标 ID (见 snapshot 输出)' },
      tabIndex: { type: 'number', description: '标签页索引' },
      request: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['click', 'type', 'scroll', 'hover'] },
          text: { type: 'string', description: '输入内容或元素文本' }
        }
      }
    },
    required: ['action']
  },

  async execute(input, ctx: ToolContext) {
    const env = input.env || 'host'
    const sessionKey = ctx.sessionKey || 'default'
    const engine = env === 'host' ? hostEngine : sandboxEngine

    // 1. 建立连接
    await engine.connect(sessionKey, ctx, input.url)

    // 2. 分发执行动作
    switch (input.action) {
      case 'navigate':
        if (!input.url) throw new Error('navigate 动作需提供 url')
        return await engine.navigate(sessionKey, input.url)

      case 'snapshot':
        return await engine.snapshot(sessionKey)

      case 'act': {
        if (!input.request) throw new Error('act 动作需提供 request')
        const req: ActRequest = {
          kind: input.request.kind,
          text: input.request.text,
          targetId: input.targetId
        }
        return await engine.act(sessionKey, req)
      }

      case 'switch_tab':
        if (input.tabIndex === undefined) throw new Error('switch_tab 动作需提供 tabIndex')
        return await engine.switchTab(sessionKey, input.tabIndex)

      case 'screenshot': {
        const tempPath = path.join(ctx.workspaceDir, '.temp', `snap_${Date.now()}.png`)
        await fs.mkdir(path.dirname(tempPath), { recursive: true })
        return await engine.screenshot(sessionKey, tempPath)
      }

      case 'show':
        return await engine.setVisible(sessionKey, true)

      case 'hide':
        return await engine.setVisible(sessionKey, false)

      case 'close':
        await engine.close(sessionKey)
        return '✅ 会话已关闭'

      default:
        throw new Error(`未知动作: ${input.action}`)
    }
  }
}
