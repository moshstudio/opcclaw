import fs from 'node:fs/promises'
import path from 'node:path'
import type { RunUsageRecord, UsageStats } from './types.js'

/**
 * 用量统计管理器 (Usage Manager)
 * 职责：采集运行明细、持久化存储、提供统计分析及报表查询
 */
export class UsageManager {
  private baseDir: string
  private runsPath: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
    this.runsPath = path.join(this.baseDir, 'runs.jsonl')
  }

  /**
   * 初始化存储目录
   */
  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  /**
   * 记录单次运行的用量明细 (Run Record)
   * 采用 JSONL 格式追加写入，保证 O(1) 效率
   */
  async recordRun(record: RunUsageRecord): Promise<void> {
    await this.ensureDir()
    const line = JSON.stringify(record) + '\n'
    await fs.appendFile(this.runsPath, line, 'utf-8')
    
    // (可选) 这里可以更新内存中的汇总，或者实时增量写入 totals.json
    // 为保持代码解耦和实时性，我们在 getStats 时进行动态聚合，或后续再做触发式增量更新
  }

  /**
   * 获取指定会话或全局的统计报表
   * @param sessionKey 如果传空则返回全局统计
   */
  async getStats(sessionKey?: string): Promise<UsageStats> {
    await this.ensureDir()
    
    // 初始化统计结果
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
      const content = await fs.readFile(this.runsPath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      
      let totalThroughput = 0
      let totalLatency = 0
      let recordsHandled = 0

      for (const line of lines) {
        try {
          const record: RunUsageRecord = JSON.parse(line)
          
          // 如果指定了 sessionKey 且不匹配，则跳过
          if (sessionKey && record.sessionKey !== sessionKey) {
            continue
          }

          stats.runCount++
          stats.totalTokens += record.usage.totalTokens
          stats.promptTokens += record.usage.input
          stats.completionTokens += record.usage.output
          stats.cacheReadTokens += record.usage.cacheRead
          stats.cacheWriteTokens += record.usage.cacheWrite
          stats.totalCost += record.usage.cost.total
          
          if (record.performance.throughput) {
            totalThroughput += record.performance.throughput
          }
          if (record.performance.totalDurationMs) {
            totalLatency += record.performance.totalDurationMs
          }
          
          recordsHandled++
        } catch (e) {
          // 跳过损坏的行
          console.error('UsageManager: failed to parse line', e)
        }
      }

      // 计算平均值
      if (recordsHandled > 0) {
        stats.avgThroughput = totalThroughput / recordsHandled
        stats.avgLatencyMs = totalLatency / recordsHandled
      }
      
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('UsageManager: failed to read runs.jsonl', err)
      }
    }

    return stats
  }

  /**
   * 清空统计数据
   */
  async reset(): Promise<void> {
    await this.ensureDir()
    try {
      await fs.unlink(this.runsPath)
    } catch {
       // Ignore if file doesn't exist
    }
  }
}
