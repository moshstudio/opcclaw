import { spawnSync, spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export type RuntimeEnv = 'node' | 'python'

export interface EnvInfo {
  exists: boolean
  version?: string
  command?: string
  path?: string
}

export interface InstallResult {
  success: boolean
  logs: string
  error?: string
}

const TIMEOUTS = {
  PROBE: 3000,
  INSTALL: 10 * 60 * 1000,
  POLL_INTERVAL: 2000,
  LOCK_EXPIRY: 5 * 60 * 1000
}

/**
 * 商业级环境管理服务 (Commercial Runtime Environment Service)
 */
export class EnvironmentService {
  private static instance: EnvironmentService

  public static getInstance(): EnvironmentService {
    if (!EnvironmentService.instance) {
      EnvironmentService.instance = new EnvironmentService()
    }
    return EnvironmentService.instance
  }

  private get isWin(): boolean {
    return process.platform === 'win32'
  }

  private get scriptBaseDir(): string {
    // 商业级路径解析：自动识别开发环境与生产环境负载
    const devPath = path.join(process.cwd(), 'resources', 'runtime')
    const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'runtime')

    // 如果处于生产环境 (打包后)，强制检查解压目录
    if (app.isPackaged) {
      if (fs.existsSync(prodPath)) return prodPath
      // 容错处理：如果 extraResources 方式打包，脚本会在 resourcesPath 直接挂载
      const altProdPath = path.join(process.resourcesPath, 'runtime')
      if (fs.existsSync(altProdPath)) return altProdPath
    }

    // 开发环境兜底
    if (fs.existsSync(devPath)) return devPath

    // 历史路径兼容 (迁移期间)
    const legacyPath = path.join(process.cwd(), 'scripts', 'runtime')
    return fs.existsSync(legacyPath) ? legacyPath : devPath
  }

  private get tempDir(): string {
    return process.env.TEMP || (this.isWin ? 'C:\\Windows\\Temp' : '/tmp')
  }

  /**
   * 健全探测环境状态
   */
  public getInfo(env: RuntimeEnv): EnvInfo {
    if (this.isWin) {
      this.refreshProcessPath()
    }

    const candidates = env === 'node' ? ['node', 'nodejs'] : ['python', 'python3']

    for (const cmd of candidates) {
      const info = this.probeCommand(cmd, env)
      if (info.exists) return info
    }

    return { exists: false }
  }

  private probeCommand(cmd: string, env: RuntimeEnv): EnvInfo {
    try {
      let resolvedPath: string | null = null

      if (this.isWin) {
        // 关键修复：使用 -All 获取所有候选，并显式排除微软商店的假镜像 (WindowsApps)
        // 这样即便商店镜像在 PATH 前面，我们也能找到后面真正的安装路径
        const loc = this.exec('powershell.exe', [
          '-NoProfile',
          '-Command',
          `$p = (Get-Command ${cmd} -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*WindowsApps*' } | Select-Object -First 1).Source; if ($p) { $p }`
        ])
        if (loc) {
          resolvedPath = loc.trim()
        } else {
          // 如果强制排除后没找到，尝试直接探测 C:\Python310 (Choco 默认路径) 作为最后兜底
          const defaultChocoPath = 'C:\\Python310\\python.exe'
          if (env === 'python' && fs.existsSync(defaultChocoPath)) {
            resolvedPath = defaultChocoPath
          }
        }
      }

      // 如果找到了绝对路径，优先使用绝对路径探测版本，避免别名干扰
      const probeTarget = resolvedPath || cmd
      const versionRaw = this.exec(probeTarget, ['--version'], TIMEOUTS.PROBE)
      if (!versionRaw) return { exists: false }

      const version = versionRaw.replace(/^[a-zA-Z\s]+/, '').trim()
      if (env === 'python' && !version.startsWith('3.')) return { exists: false }

      // 确定最终返回的二进制路径
      const finalPath =
        resolvedPath ||
        this.exec(this.isWin ? 'where.exe' : 'which', [cmd])
          ?.split('\n')[0]
          ?.trim()

      return { exists: true, version, command: cmd, path: finalPath }
    } catch {
      return { exists: false }
    }
  }

  private exec(cmd: string, args: string[], timeout?: number): string | null {
    try {
      const res = spawnSync(cmd, args, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout,
        shell: this.isWin
      })
      return res.status === 0 ? res.stdout.trim() : null
    } catch {
      return null
    }
  }

  public refreshProcessPath(): void {
    if (!this.isWin) return

    const freshPath = this.exec('powershell.exe', [
      '-NoProfile',
      '-Command',
      '[Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")'
    ])
    if (freshPath) {
      process.env.PATH = freshPath.replace(/\0/g, '')
    }
  }

  public check(env: RuntimeEnv): boolean {
    return this.getInfo(env).exists
  }

  public async install(
    env: RuntimeEnv,
    onProgress?: (log: string) => void
  ): Promise<InstallResult> {
    console.info(`[EnvironmentService] Installing ${env}...`)
    const { logPath, lockPath } = this.preparePaths(env)

    if (this.isLockActive(lockPath)) {
      throw new Error(`${env} 安装仍在运行中`)
    }

    const setup = this.getInstallConfig(env, logPath, lockPath)
    if (!setup) return { success: false, logs: '未找到安装配置' }

    this.runProcess(setup.command, setup.args)
    const startTime = Date.now()

    try {
      while (Date.now() - startTime < TIMEOUTS.INSTALL) {
        await new Promise((r) => setTimeout(r, TIMEOUTS.POLL_INTERVAL))

        const status = this.checkLockStatus(lockPath)
        const currentLogs = this.readLog(logPath)
        if (onProgress) onProgress(currentLogs)

        if (status === '1') {
          this.refreshProcessPath()
          return { success: true, logs: currentLogs }
        }
        if (status === '2') {
          return { success: false, logs: currentLogs, error: '安装脚本执行异常' }
        }

        if (this.getInfo(env).exists) return { success: true, logs: currentLogs }
      }
      return { success: false, logs: this.readLog(logPath), error: '安装超时' }
    } catch (err: any) {
      return { success: false, logs: this.readLog(logPath), error: err.message || '未知错误' }
    } finally {
      this.cleanup(logPath, lockPath)
    }
  }

  private isLockActive(lockPath: string): boolean {
    try {
      if (!fs.existsSync(lockPath)) return false

      const stats = fs.statSync(lockPath)
      const diff = Date.now() - stats.mtimeMs

      if (diff > TIMEOUTS.LOCK_EXPIRY) {
        console.warn(
          `[EnvironmentService] Detected stale lock file (>5min), cleaning up: ${lockPath}`
        )
        fs.rmSync(lockPath, { force: true })
        return false
      }

      return fs.readFileSync(lockPath, 'utf-8').trim() === '0'
    } catch {
      return false
    }
  }

  private checkLockStatus(lockPath: string): string | null {
    if (!fs.existsSync(lockPath)) return null
    try {
      return fs.readFileSync(lockPath, 'utf-8').trim()
    } catch {
      return null
    }
  }

  private preparePaths(env: RuntimeEnv): { logPath: string; lockPath: string } {
    const timestamp = Date.now()
    const logPath = path.join(this.tempDir, `install-${env}-${timestamp}.log`)
    const lockPath = path.join(this.tempDir, `install-${env}.lock`)

    try {
      const files = fs.readdirSync(this.tempDir)
      files
        .filter((f) => f.startsWith(`install-${env}-`) && f.endsWith('.log'))
        .forEach((f) => {
          try {
            fs.rmSync(path.join(this.tempDir, f), { force: true })
          } catch {
            /* 忽略单个文件清理失败 */
          }
        })
    } catch {
      /* 忽略目录读取失败 */
    }

    return { logPath, lockPath }
  }

  private cleanup(logPath: string, lockPath: string): void {
    const paths = [logPath, lockPath]
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) fs.rmSync(p, { force: true })
      } catch {
        /* 继续清理下一个 */
      }
    }
  }

  private getInstallConfig(env: RuntimeEnv, logPath: string, lockPath: string) {
    const scriptExt = this.isWin ? 'ps1' : 'sh'
    const scriptPath = path.join(this.scriptBaseDir, `install-${env}.${scriptExt}`)
    if (!fs.existsSync(scriptPath)) return null

    if (this.isWin) {
      const escLog = logPath.replace(/\\/g, '\\\\')
      const escLock = lockPath.replace(/\\/g, '\\\\')
      const command = `& { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}' -LockPath '${escLock}' *>&1 | Tee-Object -FilePath '${escLog}' }`

      return {
        command: 'powershell.exe',
        args: [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","${command}" -Verb RunAs -Wait`
        ]
      }
    }

    try {
      fs.chmodSync(scriptPath, '755')
    } catch {
      /* 可能已经在只读文件系统或权限不足 */
    }
    return { command: 'sh', args: [scriptPath, '-l', lockPath] }
  }

  private runProcess(command: string, args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { shell: false, stdio: 'ignore', windowsHide: false })
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
  }

  private readLog(logPath: string): string {
    try {
      if (!fs.existsSync(logPath)) return '(无日志)'
      return fs.readFileSync(logPath, 'utf-8').replace(/\0/g, '').trim()
    } catch {
      return '(日志不可读)'
    }
  }
}
