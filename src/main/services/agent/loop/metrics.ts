import type { Usage } from '@mariozechner/pi-ai'
import type { AgentPerformance } from '../agent-events'

export class MetricsTracker {
  // --- 全局（整个运行生命周期） ---
  public accumulatedUsage: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }

  public startTime: number = Date.now()
  private globalFirstTokenTime?: number
  public totalToolCalls: number = 0

  // --- 轮次（当前 LLM 调用轮次） ---
  private turnStartTime: number = Date.now()
  private turnFirstTokenTime?: number

  /**
   * 开始一个新的轮次计数（通常在 LLM 请求发送前调用）
   */
  public startTurn(): void {
    this.turnStartTime = Date.now()
    this.turnFirstTokenTime = undefined
  }

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

  /**
   * 当收到第一个 Token 时调用
   */
  public onFirstToken(): void {
    const now = Date.now()
    if (this.globalFirstTokenTime === undefined) {
      this.globalFirstTokenTime = now
    }
    if (this.turnFirstTokenTime === undefined) {
      this.turnFirstTokenTime = now
    }
  }

  public recordToolCall(): void {
    this.totalToolCalls++
  }

  /**
   * 获取当前轮次的性能指标
   * @param turnOutput 当前轮次生成的 output tokens
   */
  public getTurnPerformance(turnOutput: number = 0): AgentPerformance {
    const now = Date.now()
    const durationMs = now - this.turnStartTime
    return {
      totalDurationMs: durationMs,
      firstTokenLatencyMs: this.turnFirstTokenTime
        ? this.turnFirstTokenTime - this.turnStartTime
        : undefined,
      throughput: turnOutput > 0 ? (turnOutput / durationMs) * 1000 : undefined
    }
  }

  /**
   * 获取整个运行过程的累积性能指标
   */
  public getPerformance(): AgentPerformance {
    const totalDurationMs = Date.now() - this.startTime
    return {
      totalDurationMs,
      firstTokenLatencyMs: this.globalFirstTokenTime
        ? this.globalFirstTokenTime - this.startTime
        : undefined,
      throughput:
        this.accumulatedUsage.output > 0
          ? (this.accumulatedUsage.output / totalDurationMs) * 1000
          : undefined
    }
  }
}
