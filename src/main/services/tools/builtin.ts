/**
 * 内置工具集
 *
 * 对应 OpenClaw 源码: src/tools/ 目录 (50+ 工具)
 *
 * 这里实现了 10 个最基础的工具，覆盖了 Agent 的核心能力:
 * - read: 读取文件 (感知代码)
 * - write: 写入文件 (创建代码)
 * - edit: 编辑文件 (修改代码)
 * - exec: 执行命令 (运行测试、安装依赖等)
 * - list: 列出目录 (探索项目结构)
 * - grep: 搜索文件 (定位代码)
 * - memory_search: 记忆检索 (历史召回)
 * - memory_get: 记忆读取 (按需拉取)
 * - memory_save: 记忆写入 (长期保存)
 * - sessions_spawn: 子代理触发
 *
 * 设计原则:
 * 1. 安全第一: 所有路径都基于 workspaceDir，防止越界访问
 * 2. 有限制: 输出大小、超时时间都有上限，防止 Agent 卡住或消耗过多资源
 * 3. 返回字符串: 所有工具都返回字符串，方便 LLM 理解
 */

import fs from 'node:fs/promises'
import dayjs from 'dayjs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import type { Tool, ToolContext } from './types'
import { assertSandboxPath } from '@main/services/sandbox-paths'
import { EnvironmentService } from '@main/services/runtime/environment'
import { browserTool } from './browser'
import { ConfirmProvider } from '../agent/core/confirm-provider'
export { browserTool }
import { extractReadableContent, htmlToMarkdown, markdownToText } from './web-fetch-utils'

// ============== 辅助函数 ==============

let cachedWinShell: string | null = null

/**
 * 探测 Windows 下最佳可用的 Shell
 * 优先级: pwsh (PowerShell Core) > powershell (Windows PowerShell) > cmd.exe (Fallback)
 */
function getBestWinShell(): string {
  if (process.platform !== 'win32') return 'sh'
  if (cachedWinShell) return cachedWinShell

  // 待选方案
  const shells = ['pwsh', 'powershell', 'cmd.exe']

  for (const s of shells) {
    try {
      // 使用 spawnSync 快速静默检查命令是否存在
      // 这里的检查逻辑必须非常轻量，不能阻塞太久
      const args =
        s.includes('powershell') || s === 'pwsh' ? ['-Command', 'exit 0'] : ['/c', 'exit 0']
      const result = spawnSync(s, args, {
        stdio: 'ignore',
        timeout: 1000 // 1秒探测超时
      })

      if (result.status === 0) {
        cachedWinShell = s
        return s
      }
    } catch {
      // 忽略找不到命令的错误，尝试下一个
    }
  }

  // 终极回退
  cachedWinShell = 'cmd.exe'
  return cachedWinShell
}

/**
 * 确保路径在沙箱内并返回解析后的绝对路径
 * 封装了重复的 try-catch 及 assertSandboxPath 调用
 */
async function resolveAndVerifyPath(
  ctx: ToolContext,
  rawPath: string
): Promise<{ resolved: string; error?: string }> {
  // 允许的根目录列表：当前工作目录 + 显式允许的其他目录（如技能目录）
  const roots = [ctx.workspaceDir, ...(ctx.allowedPaths || [])]
  let lastError: string | undefined

  for (const root of roots) {
    try {
      const res = await assertSandboxPath({
        filePath: rawPath,
        cwd: ctx.workspaceDir,
        root: root
      })
      return { resolved: res.resolved }
    } catch (err) {
      lastError = (err as Error).message
      // 如果错误是"路径在根目录之外"，我们继续尝试下一个根目录
      if (lastError.includes('escapes workspace')) {
        continue
      }
      // 如果是其他错误（如存在符号链接），则立即返回错误
      return { resolved: '', error: lastError }
    }
  }

  return { resolved: '', error: lastError || `无权访问路径: ${rawPath}` }
}

// ============== 文件读取 ==============

/**
 * 读取文件工具
 *
 * 为什么限制 500 行？
 * - LLM 的上下文窗口有限（Claude 约 200K tokens）
 * - 一次返回太多内容会占用宝贵的上下文空间
 * - 大多数情况下，500 行足够理解一个文件的结构
 * - 如果需要更多，LLM 可以多次调用并指定 offset
 *
 * 为什么加行号？
 * - 方便 LLM 引用具体位置（"请修改第 42 行"）
 * - 方便 edit 工具精确定位
 */
export const readTool: Tool<{ file_path: string; limit?: number }> = {
  name: 'read',
  category: 'file',
  description: '读取本地文件内容，返回带行号的文本',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      limit: { type: 'number', description: '最大读取行数，默认 500' }
    },
    required: ['file_path']
  },
  async execute(input, ctx: ToolContext) {
    // 安全: 确保路径在 workspaceDir 内，并拒绝符号链接逃逸
    const { resolved: filePath, error } = await resolveAndVerifyPath(ctx, input.file_path)
    if (error) return `错误: ${error}`
    const limit = input.limit ?? 500

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').slice(0, limit)
      // 格式: "行号\t内容"，方便 LLM 解析
      return lines.map((line, i) => `${i + 1}\t${line}`).join('\n')
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 文件写入 ==============

/**
 * 写入文件工具
 *
 * 为什么是覆盖而不是追加？
 * - 代码文件通常需要完整替换
 * - 追加操作可以用 edit 工具实现
 * - 覆盖更符合"写入新文件"的语义
 *
 * 安全考虑:
 * - 会自动创建父目录（recursive: true）
 * - 路径基于 workspaceDir，不能写入工作区外的文件
 */
export const writeTool: Tool<{ file_path: string; content: string }> = {
  name: 'write',
  category: 'file',
  description: '写入文件，会覆盖已存在的文件',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' }
    },
    required: ['file_path', 'content']
  },
  async execute(input, ctx: ToolContext) {
    const { resolved: filePath, error } = await resolveAndVerifyPath(ctx, input.file_path)
    if (error) return `错误: ${error}`

    try {
      // 自动创建父目录
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, input.content, 'utf-8')
      return `成功写入 ${input.file_path}`
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 文件编辑 ==============

/**
 * 编辑文件工具
 *
 * 为什么用字符串替换而不是正则表达式？
 * - 字符串替换更可预测，不会有正则转义问题
 * - LLM 生成的正则表达式可能有语法错误
 * - 对于代码编辑，精确匹配比模糊匹配更安全
 *
 * 为什么用 replace() 而不是 replaceAll()？
 * - 只替换第一个匹配，更可控
 * - 如果需要全部替换，LLM 可以多次调用
 *
 * 典型使用场景:
 * - LLM 先 read 文件，看到第 42 行有问题
 * - 然后 edit 替换那一行的内容
 */
export const editTool: Tool<{
  file_path: string
  old_string: string
  new_string: string
}> = {
  name: 'edit',
  category: 'file',
  description: '编辑文件，替换指定文本（只替换第一个匹配）',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件路径' },
      old_string: { type: 'string', description: '要替换的原文本（精确匹配）' },
      new_string: { type: 'string', description: '新文本' }
    },
    required: ['file_path', 'old_string', 'new_string']
  },
  async execute(input, ctx: ToolContext) {
    const { resolved: filePath, error } = await resolveAndVerifyPath(ctx, input.file_path)
    if (error) return `错误: ${error}`

    try {
      const content = await fs.readFile(filePath, 'utf-8')

      // 检查是否存在要替换的文本
      if (!content.includes(input.old_string)) {
        return '错误: 未找到要替换的文本（请确保 old_string 与文件内容完全一致，包括空格和换行）'
      }

      // 只替换第一个匹配
      const newContent = content.replace(input.old_string, input.new_string)
      await fs.writeFile(filePath, newContent, 'utf-8')
      return `成功编辑 ${input.file_path}`
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 命令执行 ==============

/**
 * 执行命令工具
 *
 * 为什么默认超时 30 秒？
 * - 大多数命令（npm install, tsc, pytest）在 30 秒内完成
 * - 超时可以防止 Agent 因为一个卡住的命令而无限等待
 * - 如果需要更长时间，LLM 可以指定 timeout 参数
 *
 * 为什么限制输出 30KB (30000 字符)？
 * - 命令输出可能非常大（如 npm install 的日志）
 * - 太大的输出会占用 LLM 上下文，影响后续推理
 * - 30KB 足够包含错误信息和关键日志
 *
 * 为什么 maxBuffer 是 1MB？
 * - Node.js exec 默认 maxBuffer 是 1MB
 * - 我们截取前 30KB 返回给 LLM，但允许命令产生更多输出
 * - 这样可以避免因为输出过大而执行失败
 *
 * 安全考虑:
 * - cwd 设置为 workspaceDir，命令在工作区内执行
 * - 但这不能完全防止恶意命令，生产环境应该用 Docker 沙箱
 */
/**
 * 执行命令工具
 *
 * AbortSignal 集成 (对应 OpenClaw: src/agents/bash-tools.exec.ts:1465-1476):
 * - abort signal 触发时杀掉前台进程
 * - 超时仍然生效（timeout 和 abort 是独立的）
 */
export const execTool: Tool<{ command: string; timeout?: number }> = {
  name: 'exec',
  category: 'runtime',
  description: '执行 shell 命令',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令' },
      timeout: { type: 'number', description: '超时时间(ms)，默认 30000' }
    },
    required: ['command']
  },
  async execute(input, ctx: ToolContext) {
    const timeout = input.timeout ?? 30000

    try {
      const isWin = process.platform === 'win32'
      const rawCommand = input.command.trim()

      // 0. 启动前强制采样最新的系统环境变量
      const envService = EnvironmentService.getInstance()
      if (isWin) envService.refreshProcessPath()

      // 1. 环境校验与自动安装
      let envToInstall: 'node' | 'python' | null = null
      let runtimeInfo: any = null

      if (rawCommand.startsWith('node ') || rawCommand === 'node') {
        runtimeInfo = envService.getInfo('node')
        if (!runtimeInfo.exists) envToInstall = 'node'
      } else if (
        rawCommand.startsWith('python ') ||
        rawCommand.startsWith('python3 ') ||
        rawCommand === 'python' ||
        rawCommand === 'python3'
      ) {
        runtimeInfo = envService.getInfo('python')
        if (!runtimeInfo.exists) envToInstall = 'python'
      }

      if (envToInstall) {
        const confirmed = await ConfirmProvider.confirmInstallEnv(ctx, envToInstall)

        if (confirmed) {
          const result = await envService.install(envToInstall)
          if (!result.success) {
            return `错误: ${envToInstall} 环境安装失败。\n\n[安装日志]\n${result.logs}\n\n请根据日志排查问题或手动安装后重试。`
          }
          return `成功: ${envToInstall} 环境安装成功，环境变量已刷新。现在你可以重新尝试执行你的 Python 指令了。\n\n[安装日志]\n${result.logs}`
        } else {
          return `已取消执行: 用户拒绝安装 ${envToInstall} 环境。`
        }
      }

      // 2. 透明检测：Agent 是否已经提供了 shell 前缀？
      // 如果命令已经以 powershell, pwsh, cmd 开头，我们应该直接运行它，不进行二次包装
      const hasPrefix = /^(powershell|pwsh|cmd)(\.exe)?\s/i.test(rawCommand)

      let shell = ''
      let args: string[] = []

      if (hasPrefix && isWin) {
        // 情况 A: 裸命令模式（用户已处理转义）
        // 提取第一个空格前的部分作为 shell
        const firstSpaceIndex = rawCommand.indexOf(' ')
        shell = rawCommand.substring(0, firstSpaceIndex)
        // 剩余部分需要仔细处理，这里我们回退到最原始的执行方式
        // 注意：这里我们使用 cmd.exe /c 来承载用户已经拼好的 powershell 命令
        shell = 'cmd.exe'
        args = ['/c', `chcp 65001 > nul && ${rawCommand}`]
      } else {
        // 情况 B: 自动包装模式
        shell = isWin ? getBestWinShell() : 'sh'

        // 针对 WinRT 通知脚本的特殊优化：如果是通知类脚本但当前选择了 pwsh，尝试降级到 powershell.exe
        if (isWin && shell === 'pwsh' && rawCommand.includes('Windows.UI.Notifications')) {
          shell = 'powershell.exe'
        }

        const isPowerShell =
          shell === 'powershell' ||
          shell === 'pwsh' ||
          shell.endsWith('pwsh') ||
          shell.endsWith('powershell.exe')
        const isCmd = shell === 'cmd' || shell === 'cmd.exe' || shell.endsWith('cmd.exe')

        if (isPowerShell) {
          const preCommand =
            '$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8'
          // 对于极其复杂的命令，Base64 编码是终极方案，但为了通用性，这里先优化字符串注入
          args = ['-NoProfile', '-NonInteractive', '-Command', `${preCommand}; ${rawCommand}`]
        } else if (isCmd && isWin) {
          args = ['/c', `chcp 65001 > nul && ${rawCommand}`]
        } else {
          args = ['-c', rawCommand]
        }
      }

      // 0.5 准备执行环境：将检测到的运行时路径置于最优先地位
      const spawnEnv = { ...process.env }
      if (runtimeInfo?.path) {
        const binDir = path.dirname(runtimeInfo.path)
        // 查找当前进程环境中真正的 PATH 键名 (Windows 下可能是 Path 或 PATH)
        const pathKey = Object.keys(spawnEnv).find((k) => k.toLowerCase() === 'path') || 'PATH'
        const existingPath = spawnEnv[pathKey] || ''
        spawnEnv[pathKey] = `${binDir}${path.delimiter}${existingPath}`
      }

      const child = spawn(shell, args, {
        cwd: ctx.workspaceDir,
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        // 仅在明确使用 cmd.exe 时开启 verbatim
        windowsVerbatimArguments: isWin && shell === 'cmd.exe'
      })

      // AbortSignal → 杀进程
      // 对应 OpenClaw: bash-tools.exec.ts — onAbortSignal → run.kill()
      const onAbort = () => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }
      if (ctx.abortSignal?.aborted) {
        onAbort()
      } else if (ctx.abortSignal) {
        ctx.abortSignal.addEventListener('abort', onAbort, { once: true })
      }

      // 超时定时器
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }, timeout)

      /**
       * 输出积累与截断
       *
       * 对应 OpenClaw: bash-process-registry.ts → appendOutput()
       * - 上限 200KB (PI_BASH_MAX_OUTPUT_CHARS，可配)
       * - 截断策略: 保留尾部（错误信息通常在末尾）
       * - truncated 标记通知 Agent
       *
       * Mini 简化: 单缓冲 + 尾部保留，省略 8KB 分块和双缓冲
       */
      const MAX_OUTPUT_CHARS = 200_000
      let stdout = ''
      let stderr = ''
      let truncated = false
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        if (stdout.length > MAX_OUTPUT_CHARS) {
          stdout = stdout.slice(stdout.length - MAX_OUTPUT_CHARS)
          truncated = true
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > MAX_OUTPUT_CHARS) {
          stderr = stderr.slice(stderr.length - MAX_OUTPUT_CHARS)
          truncated = true
        }
      })

      const exitCode = await new Promise<number | null>((resolve) => {
        child.on('close', (code) => resolve(code))
        child.on('error', (err) => {
          // 捕获系统级错误，如命令找不到
          stderr += `\n系统错误: ${err.message}`
          resolve(null)
        })
      })

      clearTimeout(timer)
      ctx.abortSignal?.removeEventListener('abort', onAbort)

      let result = stdout
      if (stderr) result += `\n[STDERR]\n${stderr}`
      if (exitCode !== null && exitCode !== 0) {
        result += `\n[EXIT CODE] ${exitCode}`
      }
      if (truncated) {
        result += `\n[OUTPUT TRUNCATED: exceeded ${MAX_OUTPUT_CHARS} chars, kept tail]`
      }

      return result.slice(0, 30000)
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 目录列表 ==============

/**
 * 列出目录工具
 *
 * 对应 OpenClaw: pi-coding-agent/core/tools/ls.ts
 * - 只接受 path 和 limit，不接受 pattern
 * - glob 过滤是 find 工具（委托 fd）的职责，ls 保持职责单一
 * - 按字母排序，目录用 / 后缀标记
 * - 限制条目数，防止 node_modules 等大目录打爆上下文
 */
export const listTool: Tool<{ path?: string; limit?: number }> = {
  name: 'list',
  category: 'file',
  description: '列出目录内容（按字母排序，目录以 / 结尾）',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径，默认当前目录' },
      limit: { type: 'number', description: '最大条目数，默认 500' }
    }
  },
  async execute(input, ctx: ToolContext) {
    const { resolved: dirPath, error } = await resolveAndVerifyPath(ctx, input.path ?? '.')
    if (error) return `错误: ${error}`

    const limit = input.limit ?? 500

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      // 按字母排序（大小写不敏感），对齐 openclaw 的 ls 工具
      const sorted = entries
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      const lines = sorted.slice(0, limit).map((e) => (e.isDirectory() ? `${e.name}/` : e.name))

      if (sorted.length > limit) {
        lines.push(`\n[已截断，共 ${sorted.length} 项，仅显示前 ${limit} 项]`)
      }

      return lines.join('\n') || '目录为空'
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 文件搜索 ==============

/**
 * 搜索文件内容工具
 *
 * 为什么用 grep 而不是自己实现？
 * - grep 是经过几十年优化的工具，性能极好
 * - 支持正则表达式
 * - 自动输出文件名和行号
 *
 * 为什么限制文件类型？
 * - 只搜索 .ts .js .json .md 等文本文件
 * - 避免搜索二进制文件、图片等
 * - 避免搜索 node_modules 中的大量文件（grep -r 会递归）
 *
 * 为什么 head -50？
 * - 搜索结果可能有数千条
 * - 50 条足够 LLM 定位问题
 * - 如果需要更多，可以缩小搜索范围
 *
 * 为什么超时 10 秒？
 * - 搜索大项目可能很慢
 * - 10 秒足够搜索大多数项目
 * - 超时比卡住好
 */
export const grepTool: Tool<{ pattern: string; path?: string }> = {
  name: 'grep',
  category: 'file',
  description: '在文件中搜索文本（支持正则表达式）',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '搜索的正则表达式' },
      path: { type: 'string', description: '搜索路径，默认当前目录' }
    },
    required: ['pattern']
  },
  async execute(input, ctx: ToolContext) {
    const { resolved: searchPath, error } = await resolveAndVerifyPath(ctx, input.path ?? '.')
    if (error) return `错误: ${error}`

    try {
      const output = await runRipgrep({
        cwd: ctx.workspaceDir,
        pattern: input.pattern,
        searchPath,
        timeoutMs: 10000,
        limit: 100
      })
      return output || '未找到匹配'
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('ENOENT')) {
        return '错误: 未找到 ripgrep (rg) 命令。请先安装 ripgrep (例如: brew install ripgrep 或 choco install ripgrep)'
      }
      return `错误: ${message}`
    }
  }
}

async function runRipgrep(params: {
  cwd: string
  pattern: string
  searchPath: string
  timeoutMs: number
  limit: number
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['--line-number', '--color=never', '--hidden', '--no-messages']
    args.push(params.pattern, params.searchPath)

    const child = spawn('rg', args, {
      cwd: params.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) {
        return
      }
      settled = true
      fn()
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      settle(() => reject(new Error('rg 超时')))
    }, params.timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      // 如果报错是命令找不到，直接返回
      settle(() => reject(error))
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code && code !== 0 && code !== 1) {
        const message = stderr.trim() || `rg exited with code ${code}`
        settle(() => reject(new Error(message)))
        return
      }
      const lines = stdout.split('\n').filter((line) => line.trim())
      const limited = lines.slice(0, Math.max(1, params.limit))
      let output = limited.join('\n')
      if (lines.length > params.limit) {
        output += `\n\n[已截断，仅显示前 ${params.limit} 条匹配]`
      }
      if (output.length > 30000) {
        output = `${output.slice(0, 30000)}\n\n[输出过长已截断]`
      }
      settle(() => resolve(output))
    })
  })
}

// ============== 记忆工具 ==============

/**
 * 记忆检索工具
 *
 * 设计目标:
 * - 让 LLM 主动调用记忆检索，而不是自动注入
 * - 控制上下文体积：先搜索，再按需拉取
 */
export const memorySearchTool: Tool<{ query: string; limit?: number }> = {
  name: 'memory_search',
  category: 'memory',
  description:
    '检索长期记忆索引，返回相关记忆摘要列表。如果 query 为空字符串 ""，则按时间倒序列出最近的所有记忆。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '检索关键词或问题。传空字符串 "" 则返回最近记忆列表。'
      },
      limit: { type: 'number', description: '返回数量上限，默认 5' }
    },
    required: ['query']
  },
  async execute(input, ctx: ToolContext) {
    const memory = ctx.memory
    if (!memory) {
      return '记忆系统未启用'
    }
    const results = await memory.search(input.query, input.limit ?? 5)
    ctx.onMemorySearch?.(results)
    if (results.length === 0) {
      return '未找到相关记忆'
    }

    const header = input.query === '' ? '### 最近记忆列表\n' : `### 检索结果: "${input.query}"\n`
    const lines = results.map(
      (r, i) =>
        `${i + 1}. [${r.entry.id}] score=${r.score.toFixed(2)} source=${r.entry.source}\n   ${r.snippet}`
    )
    return header + lines.join('\n')
  }
}

/**
 * 记忆读取工具
 *
 * 用于在 memory_search 后精确拉取某条记忆全文。
 */
export const memoryGetTool: Tool<{ id: string }> = {
  name: 'memory_get',
  category: 'memory',
  description: '按 ID 读取一条记忆的完整内容',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '记忆 ID（来自 memory_search）' }
    },
    required: ['id']
  },
  async execute(input, ctx: ToolContext) {
    const memory = ctx.memory
    if (!memory) {
      return '记忆系统未启用'
    }
    const entry = await memory.getById(input.id)
    if (!entry) {
      return `未找到记忆: ${input.id}`
    }
    return `[${entry.id}] ${entry.content}`
  }
}

// ============== 记忆写入工具 ==============

/**
 * 记忆写入工具
 *
 * 对应 OpenClaw 设计:
 * - OpenClaw 没有专用 memory_save 工具，LLM 用 write 工具写入 memory/YYYY-MM-DD.md
 * - mini 的 memory 系统是 JSON 索引（非文件系统），所以用专用工具替代
 * - 核心思想一致: LLM 自主决定什么值得记住，而非系统自动保存每轮对话
 *
 * 参见 OpenClaw: src/auto-reply/reply/memory-flush.ts
 * - 仅在 session 接近 compaction 时触发 memory flush turn
 * - LLM 收到 flush prompt 后自行决定写入哪些 durable facts
 * - 如果没什么值得保存的，LLM 回复 NO_REPLY
 */
export const memorySaveTool: Tool<{
  content: string
}> = {
  name: 'memory_save',
  category: 'memory',
  description:
    '将重要信息写入长期记忆（仅当信息值得长期保存时使用：用户偏好、关键决策、重要待办等）',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '要保存的内容' }
    },
    required: ['content']
  },
  async execute(input, ctx: ToolContext) {
    const memory = ctx.memory
    if (!memory) {
      return '记忆系统未启用'
    }
    const id = await memory.add(input.content, 'memory')
    return `已保存到长期记忆: ${id}`
  }
}

/**
 * 记忆删除工具
 */
export const memoryDeleteTool: Tool<{ id: string }> = {
  name: 'memory_delete',
  category: 'memory',
  description: '按 ID 删除一条长期记忆。仅当记忆已过时或错误时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要删除的记忆 ID' }
    },
    required: ['id']
  },
  async execute(input, ctx: ToolContext) {
    const memory = ctx.memory
    if (!memory) {
      return '记忆系统未启用'
    }
    const success = await memory.delete(input.id)
    return success ? `已成功删除记忆: ${input.id}` : `错误: 未找到 ID 为 ${input.id} 的记忆`
  }
}

// ============== 子代理工具 ==============

/**
 * 子代理触发工具（最小版）
 *
 * 设计目标:
 * - 允许主代理将任务拆到后台子代理
 * - 子代理完成后由系统回传摘要（事件流）
 */
export const sessionsSpawnTool: Tool<{
  task: string
  label?: string
  cleanup?: 'keep' | 'delete'
}> = {
  name: 'sessions_spawn',
  category: 'session',
  description: '启动子代理执行后台任务，并回传摘要',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '子代理任务描述' },
      label: { type: 'string', description: '可选标签' },
      cleanup: { type: 'string', description: '完成后是否清理会话: keep|delete' }
    },
    required: ['task']
  },
  async execute(input, ctx: ToolContext) {
    if (!ctx.spawnSubagent) {
      return '子代理系统未启用'
    }
    const result = await ctx.spawnSubagent({
      task: input.task,
      label: input.label,
      cleanup: input.cleanup
    })
    return `子代理已启动: runId=${result.runId} sessionKey=${result.sessionKey}`
  }
}

// ============== 网络获取工具 ==============

/**
 * 网页内容获取工具
 *
 * 设计目标:
 * - 快速获取网页正文，避免繁重的浏览器自动化
 * - 自动转换为 Markdown 格式，适合 LLM 阅读
 * - 支持 Readability 算法提取核心内容
 *
 * 优化点:
 * 1. 采用多级回退机制 (Readability -> HTML Cleanup -> Raw Text)
 * 2. 限制返回长度 (默认 20k 字符)，保护 Token 消耗
 * 3. 简单的 SSRF 基础防御
 */
export const webFetchTool: Tool<{
  url: string
  extract_mode?: 'markdown' | 'text'
  max_chars?: number
}> = {
  name: 'web_fetch',
  category: 'network',
  description: '获取指定 URL 的内容并提取为 Markdown 或纯文本',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '网页 URL (支持 http/https)' },
      extract_mode: {
        type: 'string',
        description: '提取模式: markdown (默认) 或 text',
        enum: ['markdown', 'text']
      },
      max_chars: { type: 'number', description: '最大返回字符数，默认 20000' }
    },
    required: ['url']
  },
  async execute(input, _ctx: ToolContext) {
    let url = input.url.trim()
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }

    // 1. SSRF 基础防御: 拒绝内网 IP
    try {
      const parsedUrl = new URL(url)
      const hostname = parsedUrl.hostname.toLowerCase()
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        return '错误: 处于安全考虑，禁止访问本地或内网地址'
      }
    } catch {
      return '错误: 无效的 URL 格式'
    }

    const extractMode = input.extract_mode || 'markdown'
    const maxChars = input.max_chars || 20000

    try {
      // 2. 发起请求
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return `错误: 抓取失败 (HTTP ${response.status} ${response.statusText})`
      }

      const contentType = response.headers.get('content-type') || ''

      // 处理 JSON 结果
      if (contentType.includes('application/json')) {
        const json = await response.json()
        const text = JSON.stringify(json, null, 2)
        return text.slice(0, maxChars)
      }

      // 获取文本内容
      const html = await response.text()

      // 3. 多级提取策略
      let result: { text: string; title?: string } | null = null

      // A. Readability 提取
      result = await extractReadableContent({ html, url, extractMode })

      // B. 回退: 正则提取 (如果 Readability 没抓到正文)
      if (!result || !result.text.trim()) {
        const fallback = htmlToMarkdown(html)
        if (fallback.text.trim()) {
          result = {
            text: extractMode === 'text' ? markdownToText(fallback.text) : fallback.text,
            title: fallback.title
          }
        }
      }

      // C. 终极回退: 原始文本清理 (如果是纯文本或其他非 HTML 内容)
      if (!result || !result.text.trim()) {
        const plainText = html
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        result = { text: plainText }
      }

      if (!result || !result.text.trim()) {
        return '错误: 成功抓取页面但无法提取出有意义的文本内容'
      }

      // 4. 格式化返回
      let output = ''
      if (result.title) output += `### ${result.title}\n\n`
      output += result.text

      // 截断处理
      if (output.length > maxChars) {
        output = output.slice(0, maxChars) + '\n\n...[内容过长已截断]...'
      }

      return output
    } catch (err: any) {
      if (err.name === 'AbortError') return '错误: 请求超时 (30s)'
      return `错误: 网页抓取失败: ${err.message}`
    }
  }
}

// ============== 定时任务工具 ==============

/**
 * 设置或更新定时任务
 *
 * 核心逻辑:
 * 1. 写入 HEARTBEAT.md 项目根目录
 * 2. 如果提供了间隔或启用状态，调用 ctx.heartbeat 更新
 *
 * 对应架构设计:
 * - HEARTBEAT.md 是 LLM 的上下文输入
 * - HeartbeatManager 负责调度
 */
export const scheduleTaskTool: Tool<{
  content: string
  interval_ms?: number
  active_hours?: { start: string; end: string }
  enabled?: boolean
  start_time?: string
}> = {
  name: 'schedule_task',
  category: 'runtime',
  description:
    '设置或更新定时任务。建议在调用前先使用 `read` 工具读取 `HEARTBEAT.md` 以避免内容冲突。支持设置任务内容、检查间隔和活跃时间段。',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '任务描述（Markdown 格式），将作为心跳唤醒时的上下文输入'
      },
      interval_ms: {
        type: 'number',
        description: '任务检查间隔（毫秒），例如 1800000 表示 30 分钟'
      },
      active_hours: {
        type: 'object',
        properties: {
          start: { type: 'string', description: '开始时间，格式 "HH:MM"' },
          end: { type: 'string', description: '结束时间，格式 "HH:MM"' }
        },
        description: '活跃执行时间窗，如果不填则默认为全天 (00:00-23:59)'
      },
      enabled: { type: 'boolean', description: '是否启用定时任务，默认为 true' },
      start_time: {
        type: 'string',
        description:
          '首次执行时间（ISO 8601 格式，如 "2026-03-27T10:00:00+08:00"），设置后下一次执行将以此为准'
      }
    },
    required: ['content']
  },
  async execute(input, ctx: ToolContext) {
    const heartbeatPath = 'HEARTBEAT.md'
    const { resolved: filePath, error } = await resolveAndVerifyPath(ctx, heartbeatPath)
    if (error) return `错误: ${error}`

    try {
      // 1. 写入内容
      await fs.writeFile(filePath, input.content, 'utf-8')

      // 2. 如果提供了心跳管理，同步配置
      if (ctx.heartbeat) {
        const enabled = input.enabled ?? true
        // Pass input.active_hours directly. If it's undefined or null, HeartbeatManager should handle it as "full day".
        const activeHours = input.active_hours
        const startTimeTs = input.start_time ? dayjs(input.start_time).valueOf() : undefined
        if (input.start_time && isNaN(startTimeTs as number)) {
          return `错误: 开始时间格式无效，请使用有效的 ISO 8601 字符串（建议包含时区，如 +08:00）`
        }

        ctx.heartbeat.updateConfig({
          intervalMs: input.interval_ms,
          activeHours,
          enabled,
          startTime: startTimeTs
        })
        if (enabled) {
          ctx.heartbeat.start()
        }
      }

      let res = `成功更新定时任务内容 (${heartbeatPath})`
      if (input.interval_ms) res += `，设置间隔 ${input.interval_ms}ms`
      if (input.active_hours) {
        res += `，活跃时间段 ${input.active_hours.start}-${input.active_hours.end}`
      } else {
        res += `，活跃时间段 全天`
      }
      if (input.start_time) res += `，设定开始时间 ${input.start_time}`
      if (input.enabled === false) res += `，任务已禁用`

      return res
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

/**
 * 交互确认工具
 *
 * 允许 Agent 向用户发起询问并等待反馈。
 * 支持带记忆的确认（如果用户勾选了"记住选择"）。
 */
export const confirmTool: Tool<{
  prompt: string
  options?: string[]
  remember_key?: string
}> = {
  name: 'confirm',
  category: 'runtime',
  description: '向用户发起交互确认或选择请求，并等待用户回复。',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '交互提示文案（支持中英文）' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description:
          '可选的操作按钮列表（例如 ["确定", "取消"]）。如果不填，前端通常会提供默认按钮。'
      },
      remember_key: {
        type: 'string',
        description: '持久化记忆 Key。不传则基于内容自动哈希。设置后可支持“不再询问”并自动确认。'
      }
    },
    required: ['prompt']
  },
  async execute(input, ctx: ToolContext) {
    try {
      // 1. 自动生成 Key：如果没有提供 remember_key，则对 prompt 和 options 进行哈希
      // 这样相同的询问在不同时间/Session 也能保持记忆一致性
      let finalKey = input.remember_key
      if (!finalKey) {
        const hashSeed = input.prompt + (input.options?.join(',') || '')
        finalKey = `confirm:${crypto.createHash('sha256').update(hashSeed).digest('hex').slice(0, 16)}`
      }

      // 2. 使用 ConfirmProvider 统一管理交互逻辑 (默认提供选项以保证语义一致性)
      const finalOptions =
        input.options && input.options.length > 0
          ? input.options
          : ['确认 (Confirm)', '取消 (Cancel)']

      const result = await ConfirmProvider.run(ctx, {
        key: finalKey,
        prompt: input.prompt,
        options: finalOptions
      })

      // 3. 结果解析与反馈
      return `用户选择了: ${result.join(',') || '无响应'}`
    } catch (err) {
      return `错误: ${(err as Error).message}`
    }
  }
}

// ============== 导出 ==============

/**
 * 所有内置工具
 *
 * 这 10 个工具覆盖了 Agent 的核心能力:
 * - 感知: read, list, grep
 * - 行动: write, edit, exec
 * - 记忆: memory_search, memory_get, memory_save
 * - 编排: sessions_spawn
 *
 * OpenClaw 有 50+ 工具，包括:
 * - 浏览器自动化 (Puppeteer)
 * - Git 操作
 * - 数据库查询
 * - API 调用
 * - 等等...
 *
 * 但这 10 个是最基础的，理解了这些就理解了工具系统的本质。
 */
export const builtinTools: Tool[] = [
  readTool,
  writeTool,
  editTool,
  execTool,
  listTool,
  grepTool,
  memorySearchTool,
  memoryGetTool,
  memorySaveTool,
  memoryDeleteTool,
  sessionsSpawnTool,
  scheduleTaskTool,
  webFetchTool,
  browserTool,
  confirmTool
]
