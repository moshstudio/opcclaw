import type { ContextLoader } from '@main/services/context/index.js'
import type { SkillManager } from '@main/services/skills/skills'
import type { Tool } from '@main/services/tools/types.js'

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
 * 将不同子系统的提示词片段组合成一份完整的指令说明。
 */
export class AgentPromptBuilder {
  constructor(private options: PromptBuilderOptions) {}

  /**
   * 构建完整的系统提示词
   */
  async build(params?: { sessionKey?: string; availableTools: Tool[] }): Promise<string> {
    let prompt = this.options.baseSystemPrompt
    const availableToolNames = new Set(params?.availableTools.map((t) => t.name) ?? [])

    // 1. 上下文
    if (this.options.context) {
      const contextPrompt = await this.options.context.buildContextPrompt({
        sessionKey: params?.sessionKey
      })
      if (contextPrompt) {
        prompt += contextPrompt
      }
    }

    // 2. 技能管理 (SKILL.md 读取指令)
    if (this.options.skills) {
      const skillsPrompt = await this.options.skills.buildSkillsPrompt()
      if (skillsPrompt) {
        prompt += '\n\n## Skills (mandatory)'
        prompt += '\nBefore replying: scan <available_skills> <description> entries.'
        prompt +=
          '\n- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.'
        prompt += '\n- If multiple could apply: choose the most specific one, then read/follow it.'
        prompt += '\n- If none clearly apply: do not read any SKILL.md.'
        prompt +=
          '\nConstraints: never read more than one skill up front; only read after selecting.'
        prompt += skillsPrompt
      }
    }

    // 3. 记忆系统交互提示词
    if (
      this.options.enableMemory &&
      (availableToolNames.has('memory_search') || availableToolNames.has('memory_save'))
    ) {
      prompt += `\n\n## 记忆\n- 回答涉及历史、偏好、决定时：先用 memory_search 查找，再用 memory_get 拉取细节\n- 遇到值得长期保存的信息（用户偏好、关键决策、重要事实）：用 memory_save 写入\n- 不要保存日常闲聊或一次性查询`
    }

    // 4. 沙箱限制说明
    if (this.options.sandbox?.enabled) {
      const writeHint = this.options.sandbox.allowWrite ? '可写' : '只读'
      const execHint = this.options.sandbox.allowExec ? '允许' : '禁止'
      prompt += `\n\n## 沙箱\n当前为沙箱模式：工作区${writeHint}，命令执行${execHint}。`
    }

    return prompt
  }

  /** 更新基础提示词 */
  setBasePrompt(prompt: string) {
    this.options.baseSystemPrompt = prompt
  }
}
