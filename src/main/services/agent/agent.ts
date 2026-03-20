import path from 'node:path'
import { newShortId } from '@shared/utils/id.js'
import type { Tool, ToolContext } from '@main/services/tools/types.js'
import { builtinTools } from '@main/services/tools/builtin'
import { wrapToolWithAbortSignal } from '@main/services/tools/abort'
import {
  SessionManager,
  type Message,
  type ContentBlock,
  COMPACTION_SUMMARY_PREFIX
} from '@main/services/session/session'
import { MemoryManager } from '@main/services/memory/memory'
import { ContextLoader, DEFAULT_CONTEXT_WINDOW_TOKENS } from '@main/services/context/index.js'
import {
  CONTEXT_WINDOW_HARD_MIN_TOKENS,
  CONTEXT_WINDOW_WARN_BELOW_TOKENS,
  evaluateContextWindowGuard,
  resolveContextWindowInfo
} from './context-window-guard.js'
import { SkillManager } from '@main/services/skills/skills'
import { HeartbeatManager, type HeartbeatResult } from '@main/services/heartbeat/heartbeat'
import { normalizeAgentId, resolveSessionKey } from '@main/services/session/session-key'
import {
  enqueueInLane,
  resolveGlobalLane,
  resolveSessionLane,
  setLaneConcurrency
} from './command-queue.js'
import { filterToolsByPolicy, type ToolPolicy } from './tool-policy.js'
import type { MiniAgentEvent } from './agent-events.js'
import { runAgentLoop } from './agent-loop.js'
import { UsageManager } from '@main/services/usage/usage-manager.js'
import type { Model, StreamFunction, ThinkingLevel } from '@mariozechner/pi-ai'
import { streamSimple, getModel, getEnvApiKey } from '@mariozechner/pi-ai'
import { ConfigService } from '@main/services/config/config-service.js'

// 导入核心服务
import { AgentStateManager } from './core/state-manager.js'
import { AgentPromptBuilder } from './core/prompt-builder.js'
import { SubagentService } from './core/subagent-service.js'
import { AgentContextManager } from './core/context-manager.js'
import { AgentSessionService } from './core/session-service.js'

// ============== 类型定义 ==============

export interface AgentConfig {
  apiKey?: string
  provider?: string
  model?: string
  baseUrl?: string
  headers?: Record<string, string | null>
  streamFn?: StreamFunction
  modelDef?: Model<any>
  agentId?: string
  systemPrompt?: string
  tools?: Tool[]
  toolPolicy?: ToolPolicy
  sandbox?: {
    enabled?: boolean
    allowExec?: boolean
    allowWrite?: boolean
  }
  temperature?: number
  reasoning?: ThinkingLevel
  maxTurns?: number
  sessionDir?: string
  workspaceDir?: string
  memoryDir?: string
  usageDir?: string
  enableMemory?: boolean
  enableContext?: boolean
  enableSkills?: boolean
  enableHeartbeat?: boolean
  heartbeatInterval?: number
  contextTokens?: number
  maxTokens?: number
  maxConcurrentRuns?: number
  supportsVision?: boolean
}

export interface RunResult {
  runId?: string
  text: string
  turns: number
  toolCalls: number
  skillTriggered?: string
  memoriesUsed?: number
}

const DEFAULT_SYSTEM_PROMPT = `你是一个编程助手 Agent。

## 可用工具
- read: 读取文件内容
- write: 写入文件
- edit: 编辑文件 (字符串替换)
- exec: 执行 shell 命令
- list: 列出目录
- grep: 搜索文件内容

## 原则
1. 修改代码前必须先读取文件
2. 使用 edit 进行 small 范围修改
3. 保持简洁，不要过度解释
4. 遇到错误时分析原因并重试

## 输出格式
- 简洁的语言
- 代码使用 markdown 格式`

// ============== Agent 核心类 ==============

/**
 * Agent 核心类
 *
 * 采用 Orchestrator 模式，集成并调度多个核心子服务：
 * - StateManager: 任务状态与中断管理
 * - SessionService: 会话业务逻辑
 * - PromptBuilder: 提示词工程
 * - ContextManager: 上下文裁剪与窗口保护
 * - SubagentService: 子智能体生命周期
 */
export class Agent {
  public streamFn: StreamFunction
  public usage: UsageManager
  private modelDef?: Model<any>
  private apiKey?: string
  private temperature?: number
  private reasoning?: ThinkingLevel
  private agentId: string
  private tools: Tool[]
  private maxTurns: number
  private workspaceDir: string
  private toolPolicy?: ToolPolicy
  private contextTokens: number
  private maxTokens?: number
  private sandbox?: {
    enabled: boolean
    allowExec: boolean
    allowWrite: boolean
  }

  // 组件及服务
  private sessions: SessionManager
  private memory: MemoryManager
  private context: ContextLoader
  private skills: SkillManager
  private heartbeat: HeartbeatManager

  private stateManager: AgentStateManager
  private promptBuilder: AgentPromptBuilder
  private subagentService: SubagentService
  private contextManager: AgentContextManager
  private sessionService: AgentSessionService

  private enableMemory: boolean
  private enableContext: boolean
  private enableSkills: boolean

  private listeners = new Set<(event: MiniAgentEvent) => void>()

  constructor(config: AgentConfig) {
    const provider = config.provider ?? 'anthropic'
    const modelId =
      config.model ?? (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : undefined)

    this.resolveModelDefinition(config, provider, modelId)

    this.streamFn = config.streamFn ?? streamSimple
    this.agentId = normalizeAgentId(config.agentId ?? 'main')
    this.tools = config.tools ?? builtinTools
    this.maxTurns = config.maxTurns ?? 20
    this.maxTokens = config.maxTokens
    this.workspaceDir = config.workspaceDir ?? process.cwd()
    this.apiKey = config.apiKey ?? getEnvApiKey(provider)
    this.temperature = config.temperature
    this.reasoning = config.reasoning ?? 'medium'
    this.toolPolicy = config.toolPolicy
    this.contextTokens = Math.max(
      1,
      Math.floor(config.contextTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS)
    )
    this.sandbox = {
      enabled: config.sandbox?.enabled ?? false,
      allowExec: config.sandbox?.allowExec ?? false,
      allowWrite: config.sandbox?.allowWrite ?? true
    }

    // 初始化基础组件
    const agentDataDir = ConfigService.getInstance().getAgentDir(this.agentId)
    this.sessions = new SessionManager(config.sessionDir ?? path.join(agentDataDir, 'sessions'))
    this.memory = new MemoryManager(config.memoryDir ?? path.join(agentDataDir, 'memory'))
    this.context = new ContextLoader(this.workspaceDir)
    this.skills = new SkillManager(this.workspaceDir)
    this.heartbeat = new HeartbeatManager(this.workspaceDir, {
      intervalMs: config.heartbeatInterval
    })
    this.usage = new UsageManager(config.usageDir ?? path.join(agentDataDir, 'usage'))

    // 功能开关
    this.enableMemory = config.enableMemory ?? true
    this.enableContext = config.enableContext ?? true
    this.enableSkills = config.enableSkills ?? true

    // 初始化解耦的核心服务
    const emit = (e: MiniAgentEvent) => this.emit(e)

    this.stateManager = new AgentStateManager(this.sessions)
    this.sessionService = new AgentSessionService({
      agentId: this.agentId,
      sessionManager: this.sessions,
      emit
    })
    this.promptBuilder = new AgentPromptBuilder({
      baseSystemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      context: this.enableContext ? this.context : undefined,
      skills: this.enableSkills ? this.skills : undefined,
      enableMemory: this.enableMemory,
      sandbox: this.sandbox
    })
    this.contextManager = new AgentContextManager({
      sessionManager: this.sessions,
      contextTokens: this.contextTokens,
      modelDef: this.modelDef,
      apiKey: this.apiKey,
      emit
    })
    this.subagentService = new SubagentService(
      this.agentId,
      this.sessions,
      (sk, msg) => this.run(sk, msg),
      emit,
      (sk, txt) => this.stateManager.steer(sk, txt),
      (parentSk) => {
        if (!this.stateManager.isSessionActive(parentSk)) {
          this.run(parentSk).catch((err) => console.error(`[Agent] Subagent auto-run fail:`, err))
        }
      }
    )

    setLaneConcurrency(resolveGlobalLane(), config.maxConcurrentRuns ?? 4)
  }

  // ============== 公共 API (委托模式) ==============

  public subscribe(fn: (event: MiniAgentEvent) => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  public async createSession() {
    return this.sessionService.create()
  }
  public async reset(sessionKey: string) {
    await this.sessions.reset(sessionKey)
    this.emit({ type: 'session:reset', sessionKey })
  }

  public async deleteSession(sessionKey: string) {
    await this.sessions.delete(sessionKey)
    this.emit({ type: 'session:deleted', sessionKey })
  }
  public async getHistory(id: string) {
    return this.sessionService.getHistory(id)
  }
  public async listSessions() {
    return this.sessionService.list()
  }

  public abort(runId?: string) {
    this.stateManager.abort(runId)
  }
  public abortSession(sessionKey: string) {
    this.stateManager.abortSession(sessionKey)
  }
  public steer(sessionKey: string, text: string) {
    this.stateManager.steer(sessionKey, text)
  }
  public isSessionActive(sessionKey: string) {
    return this.stateManager.isSessionActive(sessionKey)
  }

  async run(sessionIdOrKey: string, userMessage?: string | ContentBlock[]): Promise<RunResult> {
    if (!this.modelDef || !this.apiKey) {
      this.refreshModelConfig()
      if (!this.modelDef || !this.apiKey) {
        throw new Error('未检测到可用的 AI 模型配置。请前往“设置 -> AI 模型库”添加模型。')
      }
    }

    const sessionKey = resolveSessionKey({
      agentId: this.agentId,
      sessionId: sessionIdOrKey,
      sessionKey: sessionIdOrKey
    })
    const sessionLane = resolveSessionLane(sessionKey)
    const globalLane = resolveGlobalLane()

    return enqueueInLane(sessionLane, () =>
      enqueueInLane(globalLane, async () => {
        const runId = newShortId(6)
        const signal = this.stateManager.startRun(sessionKey, runId)

        if (userMessage) {
          const m: Message = {
            id: `msg_${newShortId(8)}`,
            role: 'user',
            content: userMessage,
            timestamp: Date.now()
          }
          await this.sessions.append(sessionKey, m)
          this.emit({ type: 'chat:user-message', runId, sessionKey, message: m })
        }

        this.emit({
          type: 'agent:run-start',
          runId,
          sessionKey,
          agentId: this.agentId,
          model: this.modelDef?.id || 'none'
        })

        let agentFinished = false
        let loopError: string | undefined

        try {
          this.checkContextWindow()

          const history = await this.sessions.load(sessionKey)
          const currentMessages = [...history]

          let skillTriggered: string | undefined
          const processedMessage = await this.interceptSkills(userMessage)
          if (processedMessage !== userMessage) {
            skillTriggered = 'matched'
            const userMsg: Message = {
              role: 'user',
              content: processedMessage || '',
              timestamp: Date.now(),
              runId
            }
            await this.sessions.append(sessionKey, userMsg)
            this.emit({ type: 'chat:user-message', runId, message: userMsg, sessionKey })
            currentMessages.push(userMsg)
          }

          const compactionParams = { messages: currentMessages, sessionKey, runId }
          const { summaryMessage, pruned } = await this.contextManager.prepareMessages(compactionParams)

          const isSummaryMessage = (m: Message) =>
            typeof m.content === 'string' && m.content.startsWith(COMPACTION_SUMMARY_PREFIX)

          let activeSummary = summaryMessage
          let loopMessages = pruned.messages

          if (!activeSummary) {
            const first = pruned.messages[0]
            if (first && isSummaryMessage(first)) {
              activeSummary = first
              loopMessages = pruned.messages.slice(1)
            }
          } else {
            loopMessages = pruned.messages.filter((m) => !isSummaryMessage(m))
          }

          const availableTools = this.resolveToolsForRun()
          const systemPrompt = await this.promptBuilder.build({ sessionKey, availableTools })
          const toolsForRun = availableTools.map((t) => wrapToolWithAbortSignal(t, signal))

          let memoriesUsed = 0
          const toolCtx: ToolContext = {
            workspaceDir: this.workspaceDir,
            sessionKey,
            sessionId: sessionIdOrKey,
            agentId: this.agentId,
            memory: this.enableMemory ? this.memory : undefined,
            abortSignal: signal,
            onMemorySearch: (res) => {
              memoriesUsed += res.length
            },
            spawnSubagent: (params) =>
              this.subagentService.spawn({ ...params, parentSessionKey: sessionKey })
          }

          const stream = runAgentLoop({
            runId,
            sessionKey,
            agentId: this.agentId,
            currentMessages: loopMessages,
            compactionSummary: activeSummary,
            systemPrompt,
            toolsForRun,
            toolCtx,
            modelDef: this.modelDef!,
            streamFn: this.streamFn,
            apiKey: this.apiKey,
            temperature: this.temperature,
            reasoning: this.reasoning,
            maxTurns: this.maxTurns,
            maxTokens: this.maxTokens,
            contextTokens: this.contextTokens,
            getSteeringMessages: () => this.stateManager.drainSteering(sessionKey),
            appendMessage: (sk, msg) => this.sessions.append(sk, msg),
            prepareCompaction: (p) => this.contextManager.prepareMessages(p),
            abortSignal: signal
          })

          for await (const event of stream) {
            if (event.type === 'agent:run-end' || event.type === 'agent:run-error') {
              agentFinished = true
            }
            this.emit(event)
            if (event.type === 'agent:run-error') {
              loopError = event.error
            }
          }

          const loopResult = await stream.result()
          if (loopError) throw new Error(loopError)

          return {
            runId,
            text: loopResult.finalText,
            turns: loopResult.turns,
            toolCalls: loopResult.totalToolCalls,
            skillTriggered,
            memoriesUsed
          }
        } catch (err) {
          if (!loopError)
            this.emit({
              type: 'agent:run-error',
              runId,
              sessionKey,
              error: err instanceof Error ? err.message : String(err)
            })
          throw err
        } finally {
          if (!agentFinished) this.emit({ type: 'agent:run-end', runId, sessionKey, messages: [] })
          await this.stateManager.endRun(sessionKey, runId)
        }
      })
    )
  }

  // ============== 私有辅助方法 ==============

  private emit(event: MiniAgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error(`[Agent] Listener Error:`, err)
      }
    }
  }

  private resolveToolsForRun(): Tool[] {
    let tools = [...this.tools]
    if (!this.enableMemory) tools = tools.filter((t) => !t.name.startsWith('memory_'))
    const deny: string[] = []
    if (this.sandbox?.enabled) {
      if (!this.sandbox.allowExec) deny.push('exec')
      if (!this.sandbox.allowWrite) deny.push('write', 'edit')
    }
    let filtered = filterToolsByPolicy(tools, this.toolPolicy)
    if (deny.length > 0) filtered = filterToolsByPolicy(filtered, { deny })
    return filtered
  }

  private async interceptSkills(
    userMessage?: string | ContentBlock[]
  ): Promise<string | ContentBlock[] | undefined> {
    if (!this.enableSkills || !userMessage) return userMessage
    const text =
      typeof userMessage === 'string'
        ? userMessage
        : userMessage.map((b) => ('text' in b ? b.text : '')).join('')
    const match = await this.skills.match(text)
    if (match)
      return `Use the "${match.command.skillName}" skill for this request.\n\nUser input:\n${match.args ?? ''}`
    return userMessage
  }

  private checkContextWindow(): void {
    const info = resolveContextWindowInfo({
      contextTokens: this.contextTokens,
      defaultTokens: DEFAULT_CONTEXT_WINDOW_TOKENS
    })
    const guard = evaluateContextWindowGuard({
      info,
      warnBelowTokens: CONTEXT_WINDOW_WARN_BELOW_TOKENS,
      hardMinTokens: CONTEXT_WINDOW_HARD_MIN_TOKENS
    })
    if (guard.shouldWarn) console.warn(`[Agent] 上下文窗口偏小: ${guard.tokens} tokens.`)
    if (guard.shouldBlock)
      throw new Error(
        `上下文窗口过小 (${guard.tokens} tokens)，最低要求 ${CONTEXT_WINDOW_HARD_MIN_TOKENS} tokens。`
      )
  }

  private resolveModelDefinition(config: AgentConfig, provider: string, modelId?: string) {
    const API_FOR_PROVIDER: Record<string, string> = {
      anthropic: 'anthropic-messages',
      openai: 'openai-completions',
      google: 'google-generative-ai'
    }
    let md = config.modelDef ?? getModel(provider as any, modelId as any)
    if (!md && modelId) {
      const api = API_FOR_PROVIDER[provider]
      if (api)
        md = {
          id: modelId,
          name: modelId,
          api,
          provider,
          baseUrl: config.baseUrl ?? '',
          reasoning: true,
          input: config.supportsVision ? ['text', 'image'] : ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200_000,
          maxTokens: 8192
        }
    }
    if (config.baseUrl && md) {
      md = {
        ...md,
        baseUrl: config.baseUrl,
        headers: {
          'User-Agent': null,
          'X-Stainless-Lang': null,
          'X-Stainless-Package-Version': null,
          'X-Stainless-OS': null,
          'X-Stainless-Arch': null,
          'X-Stainless-Runtime': null,
          'X-Stainless-Runtime-Version': null,
          'anthropic-dangerous-direct-browser-access': null,
          'anthropic-beta': null,
          ...config.headers
        } as any
      }
    } else if (config.headers && md) {
      md = { ...md, headers: { ...md.headers, ...config.headers } as any }
    }
    this.modelDef = md
  }

  private refreshModelConfig(): void {
    try {
      const cs = ConfigService.getInstance()
      const app = cs.getConfig()
      const m = cs.getModel(app.defaultModelId || '')
      if (m) {
        const p = m.provider || 'anthropic'
        const apis: Record<string, string> = {
          anthropic: 'anthropic-messages',
          openai: 'openai-completions',
          google: 'google-generative-ai'
        }
        this.modelDef = {
          id: m.model || 'claude-sonnet-4.5',
          name: m.model,
          api: apis[p] || 'openai-completions',
          provider: p,
          baseUrl: m.baseUrl ?? '',
          reasoning: true,
          input: m.supportsVision ? ['text', 'image'] : ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200_000,
          maxTokens: 8192
        }
        this.apiKey = m.apiKey
        this.contextManager.updateConfig({ modelDef: this.modelDef, apiKey: this.apiKey })
      }
    } catch (err) {
      console.warn('[Agent] Runtime config refresh fail:', err)
    }
  }

  public getMemory() {
    return this.memory
  }
  public getContext() {
    return this.context
  }
  public getSkills() {
    return this.skills
  }
  public getHeartbeat() {
    return this.heartbeat
  }
  public startHeartbeat(cb?: any) {
    if (cb)
      this.heartbeat.onHeartbeat(async (o: any) => {
        cb(o.content, o.reason)
        return null
      })
    this.heartbeat.start()
  }
  public stopHeartbeat() {
    this.heartbeat.stop()
  }
  public async triggerHeartbeat() {
    return this.heartbeat.trigger()
  }
}
