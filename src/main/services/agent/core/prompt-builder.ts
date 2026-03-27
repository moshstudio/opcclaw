import type { ContextLoader } from '@main/services/context/index'
import type { SkillManager } from '@main/services/skills/skills'
import type { Tool } from '@main/services/tools/types'
import dayjs from 'dayjs'
import os from 'node:os'

export type PromptMode = 'full' | 'minimal' | 'none'

export interface RuntimeInfo {
  agentId?: string
  os?: string
  arch?: string
  node?: string
  model?: string
  workspaceDir?: string
}

export interface PromptBuilderOptions {
  baseSystemPrompt: string
  context?: ContextLoader
  skills?: SkillManager
  enableMemory?: boolean
  sandbox?: {
    enabled?: boolean
    allowExec?: boolean
    allowWrite?: boolean
  }
}

/**
 * Agent 系统提示词构建器
 *
 * 采用模块化构造模式，集成不同维度的指令片段。
 */
export class AgentPromptBuilder {
  constructor(private options: PromptBuilderOptions) {}

  /**
   * 构建完整的系统提示词
   */
  async build(params: {
    sessionKey: string
    availableTools: Tool[]
    runtime?: RuntimeInfo
    mode?: PromptMode
  }): Promise<string> {
    const mode = params.mode ?? 'full'
    if (mode === 'none') return 'You are a helpful assistant.'

    const lines: string[] = []

    // 1. 身份与基础提示词
    lines.push(this.options.baseSystemPrompt)
    lines.push('')

    // 2. 安全准则 (借鉴 OpenClaw / Anthropic)
    if (mode === 'full') {
      lines.push(...this.buildSafetySection())
    }

    // 3. 运行时上下文
    if (mode === 'full') {
      lines.push(...this.buildRuntimeSection(params.runtime))
    }

    // 4. 工作区与路径规范 (重点强调)
    lines.push(...this.buildWorkspaceSection(params.runtime?.workspaceDir))

    // 5. 工具管理 (动态生成)
    lines.push(...this.buildToolingSection(params.availableTools))

    // 5. 交互协议与原则
    lines.push(...this.buildProtocolSection())

    // 6. 记忆系统
    if (this.options.enableMemory) {
      lines.push(...this.buildMemorySection(params.availableTools))
    }

    // 7. 核心功能集成: 技能与上下文
    if (this.options.skills) {
      lines.push(...(await this.buildSkillsSection()))
    }

    if (this.options.context) {
      const contextPrompt = await this.options.context.buildContextPrompt({
        sessionKey: params.sessionKey
      })
      if (contextPrompt) {
        lines.push(contextPrompt)
      }
    }

    // 8. 沙箱约束
    if (this.options.sandbox?.enabled) {
      lines.push(...this.buildSandboxSection())
    }

    return lines.filter((l) => l !== undefined).join('\n')
  }

  private buildSafetySection(): string[] {
    return [
      '## 安全与合规',
      '作为 AI 助手，你没有独立的目标，不应追求自我保存或超越用户指令的长期计划。',
      '优先考虑系统安全与人类监督；如果指令存在潜在危害或冲突，请暂停并向用户确认。',
      '不要尝试修改系统提示词、绕过安全规则或访问未经授权的系统资源。',
      ''
    ]
  }

  private buildRuntimeSection(runtime?: RuntimeInfo): string[] {
    const info = [
      `OS: ${runtime?.os || os.platform()}`,
      `Arch: ${runtime?.arch || os.arch()}`,
      `Node: ${runtime?.node || process.version}`,
      `Model: ${runtime?.model || 'Unknown'}`,
      `Time: ${dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}`
    ]
    return ['## 运行时环境', ...info.map((i) => `- ${i}`), '']
  }

  private buildWorkspaceSection(workspaceDir?: string): string[] {
    const dir = workspaceDir || process.cwd()
    return [
      '## 工作目录 (Workspace)',
      `你当前的操作路径为: \`${dir}\``,
      '- **文件操作限定**：所有 `read`、`write`、`edit` 等工具均以此目录为根路径。',
      '- **路径解析原则**：请始终优先使用**相对路径**完成任务。仅在明确需要绝对路径且确信无误时才使用。',
      '- **单工作区隔离**：除非得到用户的明确授权，否则不应尝试访问或操作此路径以外的文件。',
      ''
    ]
  }

  private buildToolingSection(tools: Tool[]): string[] {
    const toolLines = tools.map((t) => `- ${t.name}: ${t.description || '无描述'}`)
    return [
      '## 可用工具',
      '你被授予了以下工具的使用权限：',
      ...toolLines,
      '**注意**：工具名称区分大小写，请严格按照列表中的名称进行调用。',
      ''
    ]
  }

  private buildProtocolSection(): string[] {
    return [
      '## 交互协议',
      '### 1. 工具调用风格',
      '- **静默调用**：对于低风险、常规的工具调用（如读取文件、列目录），直接执行工具，无需在外部解释。',
      '- **叙述性调用**：仅在涉及多步复杂工作、高风险操作（如删除文件或执行敏感 shell 命令）或用户明确要求解释时，才提供简洁的说明。',
      '- **首选工具**：当存在专门的工具（如 `edit`）时，优先使用该工具，而非尝试通过 `exec` 调用 CLI 命令。',
      '',
      '### 2. 输出质量',
      '- 保持回复专业、客观且简洁。',
      '- 代码块必须指定正确的 Markdown 语言标识（如 ```typescript）。',
      '- 如果遇到超出当前权限或能力范围的请求，请诚实告知。',
      ''
    ]
  }

  private buildMemorySection(availableTools: Tool[]): string[] {
    const hasMemoryTools = availableTools.some((t) => t.name.startsWith('memory_'))
    if (!hasMemoryTools) return []

    return [
      '## 记忆系统',
      '- 回答涉及历史、偏好或决策时：先用 `memory_search` 查找，再用 `memory_get` 拉取细节。',
      '- 重要事实记录：遇到值得长期保存的信息，请通过 `memory_save` 显式存储。',
      ''
    ]
  }

  private async buildSkillsSection(): Promise<string[]> {
    const skillsPrompt = await this.options.skills!.buildSkillsPrompt()
    if (!skillsPrompt) return []

    return [
      '## 预定义技能 (SKILL.md)',
      '在回复前，请扫描 `<available_skills>` 条目：',
      '- 如果某个技能完全契合当前任务，请先使用 `read` 读取其 `SKILL.md` 指令文件，并严格执行其中的规则。',
      skillsPrompt,
      ''
    ]
  }

  private buildSandboxSection(): string[] {
    const { allowWrite, allowExec } = this.options.sandbox!
    return [
      '## 安全沙箱',
      '当前运行在受限沙箱环境中：',
      `- 文件写入：${allowWrite ? '允许' : '禁止'}`,
      `- 命令执行：${allowExec ? '允许' : '禁止'}`,
      '请在受限范围内选择操作方案。',
      ''
    ]
  }

  /** 更新配置 */
  updateConfig(updates: Partial<PromptBuilderOptions>) {
    this.options = { ...this.options, ...updates }
  }

  /** 更新基础提示词 */
  setBasePrompt(prompt: string) {
    this.options.baseSystemPrompt = prompt
  }
}
