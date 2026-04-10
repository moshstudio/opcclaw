import fs from 'node:fs'
import path from 'node:path'

/**
 * 通用的持久化键值对缓存工具
 */
export class PersistentCache<T> {
  private cache: Map<string, T> = new Map()
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(content)
        for (const key in data) {
          this.cache.set(key, data[key])
        }
      }
    } catch (err) {
      console.error(`Failed to load cache from ${this.filePath}:`, err)
    }
  }

  public save(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const data: Record<string, T> = {}
      this.cache.forEach((value, key) => {
        data[key] = value
      })
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error(`Failed to save cache to ${this.filePath}:`, err)
    }
  }

  public get(key: string): T | undefined {
    return this.cache.get(key)
  }

  public set(key: string, value: T): void {
    this.cache.set(key, value)
  }

  public has(key: string): boolean {
    return this.cache.has(key)
  }

  public delete(key: string): void {
    this.cache.delete(key)
  }

  public clear(): void {
    this.cache.clear()
  }

  public getAll(): Map<string, T> {
    return new Map(this.cache)
  }
}
