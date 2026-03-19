import type { Usage } from '@mariozechner/pi-ai'
import type { AgentPerformance } from './agent'

/**
 * 运行级用量记录 (明细)
 */
export interface RunUsageRecord {
  runId: string
  sessionKey: string
  agentId: string
  model: string
  timestamp: number
  usage: Usage
  performance: AgentPerformance
}

/**
 * 会话/全局 汇总统计 (报表)
 */
export interface UsageStats {
  messageCount: number
  runCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCost: number
  avgThroughput: number
  avgLatencyMs: number
  errorCount: number
}
