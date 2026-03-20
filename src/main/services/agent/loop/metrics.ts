import type { Usage } from '@mariozechner/pi-ai'
import type { AgentPerformance } from '../agent-events'

export class MetricsTracker {
  public accumulatedUsage: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }

  public startTime: number = Date.now()
  public firstTokenTime?: number
  public totalToolCalls: number = 0

  public recordUsage(turnUsage: Usage | undefined): void {
    if (!turnUsage) return

    this.accumulatedUsage.input += turnUsage.input
    this.accumulatedUsage.output += turnUsage.output
    this.accumulatedUsage.cacheRead += turnUsage.cacheRead
    this.accumulatedUsage.cacheWrite += turnUsage.cacheWrite
    this.accumulatedUsage.totalTokens += turnUsage.totalTokens
    this.accumulatedUsage.cost.input += turnUsage.cost.input
    this.accumulatedUsage.cost.output += turnUsage.cost.output
    this.accumulatedUsage.cost.cacheRead += turnUsage.cost.cacheRead
    this.accumulatedUsage.cost.cacheWrite += turnUsage.cost.cacheWrite
    this.accumulatedUsage.cost.total += turnUsage.cost.total
  }

  public onFirstToken(): void {
    if (this.firstTokenTime === undefined) {
      this.firstTokenTime = Date.now()
    }
  }

  public recordToolCall(): void {
    this.totalToolCalls++
  }

  public getPerformance(): AgentPerformance {
    const totalDurationMs = Date.now() - this.startTime
    return {
      totalDurationMs,
      firstTokenLatencyMs: this.firstTokenTime ? this.firstTokenTime - this.startTime : undefined,
      throughput:
        this.accumulatedUsage.output > 0
          ? (this.accumulatedUsage.output / totalDurationMs) * 1000
          : undefined
    }
  }
}
