import { JsonlStore } from '../common/jsonl'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { RunUsageRecord, UsageStats } from './types'

/**
 * 用量统计管理器 (Usage Manager)
 * 职责：采集运行明细、持久化存储、提供统计分析及报表查询
 */
export class UsageManager {
  private baseDir: string
  private runsStore: JsonlStore<RunUsageRecord>
  private totalsPath: string
  private updateLock: Promise<void> = Promise.resolve()

  constructor(baseDir: string) {
    this.baseDir = baseDir
    this.runsStore = new JsonlStore(path.join(this.baseDir, 'runs.jsonl'))
    this.totalsPath = path.join(this.baseDir, 'totals.json')
  }

  /**
   * 初始化存储目录
   */
  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  /**
   * 记录单次运行的用量明细 (Run Record)
   * 并同步触发增量更新
   */
  async recordRun(record: RunUsageRecord): Promise<void> {
    await this.ensureDir()

    // 1. 追加明细到 JSONL
    await this.runsStore.append(record)

    // 2. 异步更新汇总缓存 (防止写明细被阻塞)
    this.updateTotals(record).catch((err) => {
      console.error('[UsageManager] Full totals update failed:', err)
    })
  }

  /**
   * 获取统计报表
   * 核心优化：全局查询直接走 totals.json (O(1))
   */
  async getStats(sessionKey?: string): Promise<UsageStats> {
    await this.ensureDir()

    // 情况 A：按会话查询，必须扫描明细 (O(N))
    if (sessionKey) {
      return this.scanAndAggregate({ sessionKey })
    }

    // 情况 B：全局查询，优先读汇总缓存 (O(1))
    try {
      const totalsContent = await fs.readFile(this.totalsPath, 'utf8')
      const totals = JSON.parse(totalsContent) as UsageStats
      console.log(`[UsageManager] Fetched stats from cache: runs=${totals.runCount}`)
      return totals
    } catch (err: any) {
      // 如果汇总文件不存在或损坏，执行全量修复
      if (err.code !== 'ENOENT') {
        console.warn('[UsageManager] Totals cache corrupted, rebuilding...', err)
      }
      return this.rebuildTotals()
    }
  }

  /**
   * 增量更新局部汇总文件
   */
  private async updateTotals(record: RunUsageRecord): Promise<void> {
    const task = async () => {
      let totals: UsageStats
      try {
        const content = await fs.readFile(this.totalsPath, 'utf8')
        totals = JSON.parse(content)
      } catch {
        await this.rebuildTotalsInner()
        return
      }

      const count = totals.runCount || 0
      const nextCount = count + 1

      totals.runCount = nextCount
      totals.totalTokens += record.usage.totalTokens || 0
      totals.promptTokens += record.usage.input || 0
      totals.completionTokens += record.usage.output || 0
      totals.cacheReadTokens += record.usage.cacheRead || 0
      totals.cacheWriteTokens += record.usage.cacheWrite || 0
      totals.totalCost += record.usage.cost?.total || 0

      if (record.performance?.throughput) {
        totals.avgThroughput =
          ((totals.avgThroughput || 0) * count + record.performance.throughput) / nextCount
      }
      if (record.performance?.totalDurationMs) {
        totals.avgLatencyMs =
          ((totals.avgLatencyMs || 0) * count + record.performance.totalDurationMs) / nextCount
      }

      await fs.writeFile(this.totalsPath, JSON.stringify(totals, null, 2), 'utf8')
    }

    this.updateLock = this.updateLock.then(task).catch((err) => {
      console.error('[UsageManager] updateTotals failed:', err)
    })
    return this.updateLock
  }

  /**
   * 重建全量汇总信息 (内部非锁版本)
   */
  private async rebuildTotalsInner(): Promise<UsageStats> {
    const stats = await this.scanAndAggregate({})
    await fs.writeFile(this.totalsPath, JSON.stringify(stats, null, 2), 'utf8')
    console.log(`[UsageManager] Totals cache rebuilt: runs=${stats.runCount}`)
    return stats
  }

  /**
   * 重建全量汇总信息 (回滚机制 - 公开带锁)
   */
  async rebuildTotals(): Promise<UsageStats> {
    const promise = this.updateLock.then(() => this.rebuildTotalsInner())
    this.updateLock = promise.then(
      () => {},
      () => {}
    )
    return promise
  }

  /**
   * 基础扫描聚合逻辑
   */
  private async scanAndAggregate(filters: { sessionKey?: string }): Promise<UsageStats> {
    const stats: UsageStats = {
      messageCount: 0,
      runCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
      avgThroughput: 0,
      avgLatencyMs: 0,
      errorCount: 0
    }

    try {
      const records = await this.runsStore.readAll()

      let totalThroughput = 0
      let totalLatency = 0
      let count = 0

      for (const record of records) {
        try {
          if (filters.sessionKey && record.sessionKey !== filters.sessionKey) {
            continue
          }

          stats.runCount++
          stats.totalTokens += record.usage.totalTokens || 0
          stats.promptTokens += record.usage.input || 0
          stats.completionTokens += record.usage.output || 0
          stats.cacheReadTokens += record.usage.cacheRead || 0
          stats.cacheWriteTokens += record.usage.cacheWrite || 0
          stats.totalCost += record.usage.cost?.total || 0

          if (record.performance?.throughput) totalThroughput += record.performance.throughput
          if (record.performance?.totalDurationMs)
            totalLatency += record.performance.totalDurationMs

          count++
        } catch (e) {
          console.error('[UsageManager] Skip corrupted line')
        }
      }

      if (count > 0) {
        stats.avgThroughput = totalThroughput / count
        stats.avgLatencyMs = totalLatency / count
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
    }

    return stats
  }

  /**
   * 清空统计数据
   */
  async reset(): Promise<void> {
    await this.ensureDir()
    try {
      await this.runsStore.delete()
      await fs.unlink(this.totalsPath)
    } catch {
      // Ignore
    }
  }
}
