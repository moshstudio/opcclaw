import fs from 'node:fs/promises'
import {
  existsSync,
  readFileSync,
  createReadStream,
  openSync,
  fstatSync,
  readSync,
  closeSync
} from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

/**
 * 通用 JSONL 存储处理器 (JsonlStore)
 *
 * 增强型：支持高效的正向/反向流式分页读取。
 */
export class JsonlStore<T> {
  constructor(private readonly filePath: string) {}

  /**
   * 追加一条记录 (O(1))
   */
  async append(entry: T): Promise<void> {
    const dir = path.dirname(this.filePath)
    await fs.mkdir(dir, { recursive: true })
    const line = JSON.stringify(entry) + '\n'
    await fs.appendFile(this.filePath, line, 'utf-8')
  }

  /**
   * 分页读取记录 (商用级高性能实现)
   * 如果 reverse 为 true，则使用从文件末尾向前的指针读取，性能极高。
   */
  async read(options?: { limit?: number; offset?: number; reverse?: boolean }): Promise<{
    items: T[]
    total: number
    hasMore: boolean
  }> {
    const reverse = options?.reverse !== false
    const limit = options?.limit || 100
    const offset = options?.offset || 0

    if (!reverse) {
      // 正向读取 (可以用流实现，但暂时用简单全量)
      return this.readForward(offset, limit)
    }

    // 高性能反向分页读取
    return this.readBackward(offset, limit)
  }

  /**
   * 反向从文件末尾读取 (真正利用了 JSONL 的优势)
   * 优势：无论文件多大，读取最新数据的速度都是常数级的 O(limit + offset)
   */
  private async readBackward(
    offset: number,
    limit: number
  ): Promise<{
    items: T[]
    total: number
    hasMore: boolean
  }> {
    if (!existsSync(this.filePath)) {
      return { items: [], total: 0, hasMore: false }
    }

    let fd: number | null = null
    try {
      fd = openSync(this.filePath, 'r')
      const stats = fstatSync(fd)
      const fileSize = stats.size
      const bufferSize = 16 * 1024 // 16KB 块
      const buffer = Buffer.alloc(bufferSize)

      let currentPos = fileSize
      let linesCollected: string[] = []
      let skipCount = offset
      let takeCount = limit
      let leftover = ''

      // 估算总行数 (这步仍然需要读取全量或维护索引，如果不强制要求 total，可以只读满足 limit 的部分)
      // 为了精确的 total，简单场景下我们仍然需要一次全扫描，或者通过独立元数据存储行数。
      // 为保持简单，我们先专注于高效拿取数据。

      while (currentPos > 0 && takeCount > 0) {
        const readLength = Math.min(currentPos, bufferSize)
        currentPos -= readLength

        readSync(fd, buffer, 0, readLength, currentPos)
        const chunk = buffer.toString('utf8', 0, readLength) + leftover
        const lines = chunk.split('\n')

        // chunk 顶部的行可能是不完整的 (因为 split 到了文件一半)，留到下次循环处理
        leftover = lines.shift() || ''

        // 此时 lines 中是完整的行，但注意：由于我们是反向读取块，
        // 同一 chunk 内的 lines 是正向的。
        // 所以我们从 lines 的后面开始拿最新行。
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim()
          if (!line) continue

          if (skipCount > 0) {
            skipCount--
            continue
          }

          if (takeCount > 0) {
            try {
              linesCollected.push(line)
              takeCount--
            } catch {
              // ignore
            }
          } else {
            break
          }
        }
      }

      // 处理最后（文件最开头）的剩余部分
      if (takeCount > 0 && leftover.trim()) {
        if (skipCount <= 0) {
          linesCollected.push(leftover.trim())
        }
      }

      const items = linesCollected.map((l) => JSON.parse(l) as T)

      // 注意：目前为了完全满足 total，仍需要额外读取。
      // 商用逻辑通常会把 "total" 维护在元数据中或者返回一个 hasMore 标志位。
      const hasMore =
        currentPos > 0 || (takeCount === 0 && (skipCount > 0 || linesCollected.length === limit))

      return {
        items,
        total: items.length, // 实际上在分页场景下，返回 total 往往需要 scan，或者由外部管理
        hasMore
      }
    } catch (err) {
      console.error(`[JsonlStore] Backward read error:`, err)
      return { items: [], total: 0, hasMore: false }
    } finally {
      if (fd !== null) closeSync(fd)
    }
  }

  private async readForward(
    offset: number,
    limit: number
  ): Promise<{
    items: T[]
    total: number
    hasMore: boolean
  }> {
    // 渐进式流读取实现
    let totalCount = 0

    // 这里可以使用现有的 readStream 实现，为了代码紧凑先简单全量实现兼容
    const res = await this._readAllInternal()
    totalCount = res.length
    const sliced = res.slice(offset, offset + limit)
    return {
      items: sliced,
      total: totalCount,
      hasMore: offset + limit < totalCount
    }
  }

  private async _readAllInternal(): Promise<T[]> {
    if (!existsSync(this.filePath)) return []
    const content = await fs.readFile(this.filePath, 'utf-8')
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as T
        } catch {
          return null as any
        }
      })
      .filter((item) => item !== null)
  }

  /**
   * 一次性全量读取
   */
  async readAll(): Promise<T[]> {
    return this._readAllInternal()
  }

  /**
   * 同步读取 (仅限初始化小量数据)
   */
  readAllSync(): T[] {
    try {
      if (!existsSync(this.filePath)) return []
      const content = readFileSync(this.filePath, 'utf-8')
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as T
          } catch {
            return null as any
          }
        })
        .filter((item) => item !== null)
    } catch {
      return []
    }
  }

  /**
   * 全量写回 (用于文件重写、排序或截断)
   */
  async writeAll(items: T[]): Promise<void> {
    const dir = path.dirname(this.filePath)
    await fs.mkdir(dir, { recursive: true })
    const content = items.map((item) => JSON.stringify(item)).join('\n') + '\n'
    await fs.writeFile(this.filePath, content, 'utf-8')
  }

  /**
   * 截断文件，仅保留最近的 N 条记录
   */
  async truncate(keepCount: number): Promise<void> {
    const all = await this.readAll()
    if (all.length <= keepCount) return
    const kept = all.slice(-keepCount)
    await this.writeAll(kept)
  }

  /**
   * 删除文件
   */
  async delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath)
    } catch {
      // ignore
    }
  }

  exists(): boolean {
    return existsSync(this.filePath)
  }

  /**
   * 高效读取第一行 (通常为 Header)
   */
  async readFirstLine(): Promise<T | null> {
    if (!existsSync(this.filePath)) return null

    const fileStream = createReadStream(this.filePath)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    try {
      for await (const line of rl) {
        if (line.trim()) {
          return JSON.parse(line) as T
        }
      }
      return null
    } catch {
      return null
    } finally {
      rl.close()
      fileStream.destroy()
    }
  }
}
