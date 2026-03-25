import { create } from 'zustand'
import { getGatewayClient } from '@renderer/services/gateway-client'
import { useAgentStore } from './useAgentStore'
import { HeartbeatEventPayload, HeartbeatTaskStatus, HeartbeatLog } from '@shared/types/gateway'

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
  triggerHeartbeat: (agentId: string) => Promise<void>
  saveHeartbeatFile: (agentId: string, content: string) => Promise<void>
  deleteHeartbeatFile: (agentId: string) => Promise<void>
  fetchHeartbeatFile: (agentId: string) => Promise<string>
  fetchHeartbeatLogs: () => Promise<void>
  heartbeatLogs: HeartbeatLog[]
}

export const useHeartbeatStore = create<HeartbeatState>((set, get) => ({
  heartbeatTasks: [],
  heartbeatLogs: [],

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
      const existingIdx = state.heartbeatTasks.findIndex((t) => t.agentId === agentId)
      const tasks = [...state.heartbeatTasks]

      if (type === 'heartbeat:deleted') {
        return { heartbeatTasks: tasks.filter((t) => t.agentId !== agentId) }
      }

      if (status) {
        if (existingIdx > -1) {
          // 更新现有任务状态
          tasks[existingIdx] = {
            ...tasks[existingIdx],
            status: { ...tasks[existingIdx].status, ...status }
          }
        } else if (type === 'heartbeat:created' || type === 'heartbeat:updated') {
          // 新增任务 (如果之前不在列表中)
          const agent = useAgentStore.getState().agents.find((a) => a.id === agentId)
          tasks.push({
            agentId,
            agentName: agent?.config.name || agentId,
            status: status as HeartbeatTaskStatus
          })
        }
      } else if (type === 'heartbeat:triggered') {
        // 触发事件通常不带 status，可以在这里做一些视觉提示的状态更新
        if (existingIdx > -1) {
          tasks[existingIdx] = {
            ...tasks[existingIdx],
            status: { ...tasks[existingIdx].status, started: true } // 假设触发即认为是启动/活跃态
          }
        }
      }

      return { heartbeatTasks: tasks }
    })
  },

  updateHeartbeatConfig: async (params) => {
    const { agentId, ...updates } = params

    // 乐观更新：立即在 UI 上反映开关状态或间隔变化
    set((state) => ({
      heartbeatTasks: state.heartbeatTasks.map((t) =>
        t.agentId === agentId ? { ...t, status: { ...t.status, ...updates } } : t
      )
    }))

    try {
      await getGatewayClient().request('heartbeat:update', params)
    } catch (err) {
      console.error('[HeartbeatStore] Update failed:', err)
      // 失败时回滚
      await get().fetchHeartbeatTasks()
      throw err
    }
  },

  triggerHeartbeat: async (agentId) => {
    try {
      await getGatewayClient().request('heartbeat:trigger', { agentId })
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
  fetchHeartbeatLogs: async () => {
    try {
      const res = await getGatewayClient().request<{ logs: HeartbeatLog[] }>('heartbeat:logs', {})
      set({ heartbeatLogs: res.logs || [] })
    } catch (err) {
      console.error('[HeartbeatStore] Fetch logs failed:', err)
    }
  }
}))
