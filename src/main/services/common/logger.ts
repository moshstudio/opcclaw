import pino, { Logger as PinoLogger } from 'pino'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

// 1. 获取临时目录并确保其存在
const LOG_DIR = path.join(os.tmpdir(), 'opcclaw-logs')
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// 2. 定义 Transports
const targets: any[] = [
  // A. 持久化日志到临时目录，支持自动轮转
  {
    target: 'pino-roll',
    level: 'trace', // Transport 设为 trace，让过滤逻辑完全由主 logger 实例控制
    options: {
      file: path.join(LOG_DIR, 'app.log'),
      frequency: 'daily',
      size: '10m',
      mkdir: true,
      limit: { count: 7 }
    }
  }
]

// B. 非生产环境下输出到控制台
// 如果是开发环境（development 或未明确设置），启用 pino-pretty
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
if (isDev) {
  targets.push({
    target: 'pino-pretty',
    level: 'trace', // 同样设为 trace 以直通 debug 日志
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname'
    }
  })
}

const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: undefined
  },
  pino.transport({ targets })
)

const allLoggers = new Set<Logger>()

export function setGlobalLogLevel(level: LogLevel): void {
  baseLogger.level = level
  allLoggers.forEach((l) => l.syncLevel(level))
}

export let isSystemClosing = false
export function setSystemClosing(): void {
  isSystemClosing = true
}

export class Logger {
  private pinoInstance: PinoLogger
  private hasOverride = false

  constructor(private prefix: string = '') {
    this.pinoInstance = baseLogger.child({})
    // 显式同步一次，确保新定义的 Logger 继承当前全局日志级别
    this.syncLevel(baseLogger.level as LogLevel)
    allLoggers.add(this)
  }

  /**
   * 同步全局级别（仅在没有本地覆盖时生效）
   */
  public syncLevel(newGlobalLevel: LogLevel): void {
    if (!this.hasOverride) {
      this.pinoInstance.level = newGlobalLevel
    }
  }

  private call(method: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    if (isSystemClosing) return
    const formattedMsg = this.prefix ? `[${this.prefix}] ${message}` : message
    const hasArgs = args.length > 0

    try {
      if (method === 'error' && args[0] instanceof Error) {
        const [err, ...rest] = args
        this.pinoInstance.error({ err, args: rest }, formattedMsg)
      } else {
        const logFn = this.pinoInstance[method].bind(this.pinoInstance)
        logFn(hasArgs ? { args } : {}, formattedMsg)
      }
    } catch (e: any) {
      if (e?.message && e.message.includes('worker has exited')) {
        return
      }
      console.error('[Logger fallback]', e, formattedMsg)
    }
  }

  public debug(message: string, ...args: any[]): void {
    this.call('debug', message, ...args)
  }

  public info(message: string, ...args: any[]): void {
    this.call('info', message, ...args)
  }

  public warn(message: string, ...args: any[]): void {
    this.call('warn', message, ...args)
  }

  public error(message: string, ...args: any[]): void {
    this.call('error', message, ...args)
  }

  public child(suffix: string): Logger {
    const nextPrefix = this.prefix ? `${this.prefix}:${suffix}` : suffix
    return new Logger(nextPrefix)
  }

  public setLevel(level: LogLevel): void {
    this.hasOverride = true
    this.pinoInstance.level = level
  }

  public get level(): LogLevel {
    return this.pinoInstance.level as LogLevel
  }
}

export const defaultLogger = new Logger()
