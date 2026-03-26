import { spawnSync, spawn } from 'node:child_process'
import { shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export type RuntimeEnv = 'node' | 'python'

export interface EnvInfo {
  exists: boolean
  version?: string
  command?: string
  path?: string
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

  /**
   * 健全检测环境状态 (兼容任意 Python 3.x 版本)
   */
  public getInfo(env: RuntimeEnv): EnvInfo {
    const candidates = env === 'node' ? ['node', 'nodejs'] : ['python', 'python3']
    for (const cmd of candidates) {
      try {
        const result = spawnSync(cmd, ['--version'], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 2000 // 探测防卡死
        })
        if (result.status === 0 && result.stdout) {
          const version = result.stdout.trim().replace(/^[a-zA-Z\s]+/, '')

          // 基础有效性判断：如果是 Python，至少要是 3.x 开启的版本
          if (env === 'python' && !version.startsWith('3.')) {
            continue
          }

          const which = process.platform === 'win32' ? 'where' : 'which'
          const locRes = spawnSync(which, [cmd], { encoding: 'utf-8' })
          const binaryPath = locRes.stdout?.split('\n')[0]?.trim()
          console.log('find binary:', binaryPath);


          // return { exists: true, version, command: cmd, path: binaryPath }
        }
      } catch {
        continue
      }
    }

    // Windows 特色：深度扫描安装目录 (不再死磕 Python311)
    if (process.platform === 'win32' && env === 'python') {
      const scanRoots = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
        process.env.ProgramFiles || 'C:\\Program Files',
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      ]

      for (const root of scanRoots) {
        if (!fs.existsSync(root)) continue
        try {
          const files = fs.readdirSync(root)
          // 查找形如 Python38, Python311, Python312 的目录
          const pyDir = files.find((f) => f.toLowerCase().startsWith('python3'))
          if (pyDir) {
            const fullPath = path.join(root, pyDir)
            console.log('find full path:', fullPath);

            // return { exists: true, version: `Detected in ${pyDir}`, path: fullPath }
          }
        } catch {
          continue
        }
      }
    }

    return { exists: false }
  }

  public check(env: RuntimeEnv): boolean {
    return this.getInfo(env).exists
  }

  /**
   * 提权安装方案：支持一键安装最新稳定版
   */
  public async install(env: RuntimeEnv, onProgress?: (log: string) => void): Promise<boolean> {
    console.info(`[EnvironmentService] Running elevated installation for ${env}...`)

    const isWin = process.platform === 'win32'
    const isMac = process.platform === 'darwin'

    // --- Windows 策略 ---
    if (isWin) {
      if (this.hasCommand('winget')) {
        // winget 会默认安装对应的最新稳定版包
        const pkgId = env === 'node' ? 'OpenJS.NodeJS' : 'Python.Python.3'
        const psCommand = `Start-Process winget -ArgumentList "install -e --id ${pkgId} --accept-source-agreements --accept-package-agreements" -Verb RunAs -Wait`
        return this.runInstall('powershell', ['-Command', psCommand], onProgress)
      }
      await shell.openExternal(
        env === 'node' ? 'https://nodejs.org/' : 'https://www.python.org/downloads/windows/'
      )
      return false
    }

    // --- macOS 策略 ---
    if (isMac) {
      if (this.hasCommand('brew')) {
        const pkg = env === 'node' ? 'node' : 'python'
        const brewCmd = `brew install ${pkg}`
        return this.runInstall('sh', ['-c', brewCmd], onProgress)
      }
      await shell.openExternal(
        env === 'node' ? 'https://nodejs.org/' : 'https://www.python.org/downloads/macos/'
      )
      return false
    }

    // --- Linux 策略 ---
    if (process.platform === 'linux') {
      const pkg = env === 'node' ? 'nodejs' : 'python3'
      if (this.hasCommand('apt-get')) {
        return this.runInstall('pkexec', ['apt-get', 'install', '-y', pkg], onProgress)
      }
    }

    return false
  }

  private hasCommand(cmd: string): boolean {
    try {
      const check = process.platform === 'win32' ? 'where' : 'which'
      return spawnSync(check, [cmd]).status === 0
    } catch {
      return false
    }
  }

  private runInstall(
    command: string,
    args: string[],
    onProgress?: (log: string) => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { shell: true, stdio: 'pipe' })
      child.stdout?.on('data', (data) => onProgress?.(data.toString()))
      child.stderr?.on('data', (data) => onProgress?.(data.toString()))
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
  }
}
