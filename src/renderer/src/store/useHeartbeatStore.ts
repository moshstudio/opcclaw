import { create } from 'zustand'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { useAgentStore } from './useAgentStore'
import { HeartbeatEventPayload, HeartbeatTaskStatus, HeartbeatLog } from '@shared/types/gateway'
export type { HeartbeatLog }

export interface HeartbeatTask {
  agentId: string
  agentName: string
  status: HeartbeatTaskStatus
}

interface HeartbeatState {
  heartbeatTasks: HeartbeatTask[]

  // Actions
  fetchHeartbeatTasks: () => Promise<void>
  handleHeartbeatEvent: (payload: HeartbeatEventPayload) => void
  updateHeartbeatConfig: (params: {
    agentId: string
    enabled?: boolean
    intervalMs?: number
    activeHours?: { start: string; end: string }
  }) => Promise<void>
  triggerHeartbeat: (agentId: string) => Promise<{ status: string; reason?: string }>
  saveHeartbeatFile: (agentId: string, content: string) => Promise<void>
  deleteHeartbeatFile: (agentId: string) => Promise<void>
  fetchHeartbeatFile: (agentId: string) => Promise<string>
  heartbeatLogs: HeartbeatLog[]
  heartbeatLogsHasMore: boolean
  heartbeatLogsLoading: boolean
  heartbeatLogsTotal: number

  fetchHeartbeatLogs: (options?: {
    agentId?: string
    limit?: number
    offset?: number
    append?: boolean
  }) => Promise<void>
}

export const useHeartbeatStore = create<HeartbeatState>((set, get) => ({
  heartbeatTasks: [],
  heartbeatLogs: [],
  heartbeatLogsHasMore: false,
  heartbeatLogsLoading: false,
  heartbeatLogsTotal: 0,

  fetchHeartbeatTasks: async () => {
    try {
      const res = await getGatewayClient().request<{ tasks: HeartbeatTask[] }>('heartbeat:list', {})
      set({ heartbeatTasks: res.tasks || [] })
    } catch (err) {
      console.error('[HeartbeatStore] Failed to fetch tasks:', err)
    }
  },

  handleHeartbeatEvent: (payload: HeartbeatEventPayload) => {
    const { type, agentId, status } = payload

    set((state) => {
      // 1. 查找现有任务索引并克隆任务列表 (遵循不可变更新原则)
      const existingIdx = state.heartbeatTasks.findIndex((t) => t.agentId === agentId)
      const tasks = [...state.heartbeatTasks]

      // 2. 处理删除事件：从列表中移除该任务
      if (type === 'heartbeat:deleted') {
        return { heartbeatTasks: tasks.filter((t) => t.agentId !== agentId) }
      }

      // 3. 处理状态更新 (核心：isRunning 状态变更会由此同步到 UI)
      if (status) {
        if (existingIdx > -1) {
          // 更新现有条目：合并新的状态 (触发按钮金色特效或恢复原样)
          tasks[existingIdx] = {
            ...tasks[existingIdx],
            status: { ...tasks[existingIdx].status, ...status }
          }
        } else if (type === 'heartbeat:created' || type === 'heartbeat:updated') {
          // 自动发现：如果后端创建了新任务文件而前端还不在列表中，则新增一条
          const agent = useAgentStore.getState().agents.find((a) => a.id === agentId)
          tasks.push({
            agentId,
            agentName: agent?.config.name || agentId,
            status: status
          })
        }
      }

      return { heartbeatTasks: tasks }
    })
  },

  updateHeartbeatConfig: async (params) => {
    try {
      await getGatewayClient().request('heartbeat:update', params)
    } catch (err) {
      console.error('[HeartbeatStore] Update failed:', err)
      // 失败时重新拉取以确保状态同步
      await get().fetchHeartbeatTasks()
      throw err
    }
  },

  triggerHeartbeat: async (agentId) => {
    try {
      const res = await getGatewayClient().request<{
        result: { status: string; reason?: string }
      }>('heartbeat:trigger', { agentId })
      return res.result
    } catch (err) {
      console.error('[HeartbeatStore] Trigger failed:', err)
      throw err
    }
  },

  saveHeartbeatFile: async (agentId, content) => {
    try {
      await getGatewayClient().request('heartbeat:save-file', { agentId, content })
      // 广播会自动通过 handleHeartbeatEvent 更新任务列表状态
    } catch (err) {
      console.error('[HeartbeatStore] Save file failed:', err)
      throw err
    }
  },

  deleteHeartbeatFile: async (agentId) => {
    try {
      await getGatewayClient().request('heartbeat:delete-file', { agentId })
      // 广播会自动处理列表移除
    } catch (err) {
      console.error('[HeartbeatStore] Delete file failed:', err)
      throw err
    }
  },

  fetchHeartbeatFile: async (agentId) => {
    try {
      const res = await getGatewayClient().request<{ content: string }>('heartbeat:get-file', {
        agentId
      })
      return res.content || ''
    } catch (err) {
      console.error('[HeartbeatStore] Fetch file failed:', err)
      return ''
    }
  },

  fetchHeartbeatLogs: async (options) => {
    const { agentId, limit = 50, offset = 0, append = false } = options || {}

    set({ heartbeatLogsLoading: true })
    try {
      const res = await getGatewayClient().request<{
        logs: HeartbeatLog[]
        total: number
        hasMore: boolean
      }>('heartbeat:logs', { agentId, limit, offset })

      set((state) => ({
        heartbeatLogs: append ? [...state.heartbeatLogs, ...(res.logs || [])] : res.logs || [],
        heartbeatLogsTotal: res.total || 0,
        heartbeatLogsHasMore: res.hasMore || false,
        heartbeatLogsLoading: false
      }))
    } catch (err) {
      console.error('[HeartbeatStore] Fetch logs failed:', err)
      set({ heartbeatLogsLoading: false })
    }
  }
}))
