import {
  buildBootstrapContextFiles,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  DEFAULT_HEARTBEAT_FILENAME,
  type BootstrapFile,
  type ContextFile
} from './bootstrap'
import { isSubagentSessionKey } from '../session/session-key'
import type { HeartbeatTaskStatus } from '@shared/types/gateway'
import dayjs from 'dayjs'

export class ContextLoader {
  private workspaceDir: string
  private maxChars?: number
  private warn?: (message: string) => void
  private getHeartbeatStatus?: () => HeartbeatTaskStatus | undefined

  constructor(
    workspaceDir: string,
    opts?: {
      maxChars?: number
      warn?: (message: string) => void
      getHeartbeatStatus?: () => HeartbeatTaskStatus | undefined
    }
  ) {
    this.workspaceDir = workspaceDir
    this.maxChars = opts?.maxChars
    this.warn = opts?.warn
    this.getHeartbeatStatus = opts?.getHeartbeatStatus
  }

  /**
   * 加载并过滤 Bootstrap 文件
   */
  async loadBootstrapFiles(params?: { sessionKey?: string }): Promise<BootstrapFile[]> {
    const files = await loadWorkspaceBootstrapFiles(this.workspaceDir)
    return filterBootstrapFilesForSession(files, params?.sessionKey)
  }

  /**
   * 构建系统提示的上下文部分（Project Context）
   */
  async buildContextPrompt(params?: { sessionKey?: string }): Promise<string> {
    const files = await this.loadBootstrapFiles(params)
    const contextFiles = buildBootstrapContextFiles(files, {
      maxChars: this.maxChars,
      warn: this.warn
    })
    if (contextFiles.length === 0) return ''

    const isSubagent = params?.sessionKey && isSubagentSessionKey(params.sessionKey)
    const lines: string[] = ['', '## 工作区内核文件 (Agent Core Files)']

    // 极致精简版提示词
    lines.push('## 系统内核 (Agent Core)')
    lines.push('**原则**：行为/规则/偏好修改文件；事实/知识存入 Memory。内容极简。')

    if (isSubagent) {
      lines.push('- **AGENTS.md**: 规范/标准。', '- **TOOLS.md**: 工具/API 指南。')
    } else {
      lines.push(
        '- **IDENTITY/SOUL.md**: 身份/性格。例：“叫我[姓名]” -> 修改此文件。',
        '- **USER.md**: 用户画像/偏好。',
        '- **AGENTS.md**: 全局规范。',
        '- **TOOLS.md**: 工具/API 最佳实践。',
        '- **HEARTBEAT.md**: 动态定时任务。'
      )
    }

    lines.push(
      '',
      '**原则**：内容极简。身份/行为/任务/工具变更须同步更新文件；事实知识/新闻务必存入 Memory。'
    )

    lines.push('', '注：[MISSING] 表示文件未创建，可根据需要直接调用工具创建并开始记录。', '')

    for (const file of contextFiles) {
      let content = file.content

      if (file.path === DEFAULT_HEARTBEAT_FILENAME) {
        if (content.startsWith('[MISSING]') || !this.isHeartbeatEffectivelyNotEmpty(content)) {
          continue
        }

        // 注入实时状态 (精炼版)
        if (this.getHeartbeatStatus) {
          const s = this.getHeartbeatStatus()
          if (s) {
            content =
              `> **Heartbeat Status**: ${s.enabled ? 'Enabled' : 'Disabled'} | Interval: ${Math.round(s.intervalMs / 60000)}m | ` +
              `Active: ${s.activeHours.start}-${s.activeHours.end} | ` +
              `Next: ${s.nextDueMs > 0 ? dayjs(s.nextDueMs).format('HH:mm:ss') : 'N/A'}\n\n` +
              content
          }
        }
      }

      lines.push(`## ${file.path}`, '', content, '')
    }

    return lines.join('\n')
  }

  /**
   * 检查 HEARTBEAT.md 内容是否包含实质性任务
   */
  private isHeartbeatEffectivelyNotEmpty(content: string): boolean {
    return content.split('\n').some((line) => {
      const t = line.trim()
      return (
        t &&
        !/^#+(\s|$)/.test(t) && // 排除标题
        !/^<!--.*-->$/.test(t) && // 排除 HTML 注释
        !/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(t) // 排除空任务项
      )
    })
  }

  /**
   * 检查 HEARTBEAT.md 是否有待办任务
   */
  async hasHeartbeatTasks(): Promise<boolean> {
    const files = await loadWorkspaceBootstrapFiles(this.workspaceDir)
    const heartbeat = files.find((f) => f.name === DEFAULT_HEARTBEAT_FILENAME)
    return !!heartbeat?.content && this.isHeartbeatEffectivelyNotEmpty(heartbeat.content)
  }
}

export type { ContextFile }
