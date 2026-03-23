import { create } from 'zustand'
import { toast } from 'sonner'

interface SystemState {
  lastTick: number
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error'
  isShuttingDown: boolean
  shutdownReason: string | null
  restartExpectedMs: number | null

  initialized: boolean

  handleConnect: () => void
  handleDisconnect: () => void
  handleTick: (payload: any) => void
  handleShutdown: (payload: any) => void
  handleError: (err: Error) => void

  init: () => void
}

export const useSystemStore = create<SystemState>((set) => ({
  lastTick: Date.now(),
  status: 'disconnected',
  isShuttingDown: false,
  shutdownReason: null,
  restartExpectedMs: null,
  initialized: false,

  // --- External Handlers (Called by GatewaySync) ---
  handleConnect: () => {
    set({ status: 'connected', isShuttingDown: false })
  },

  handleDisconnect: () => {
    set({ status: 'reconnecting' })
  },

  handleTick: (payload: any) => {
    set({
      lastTick: payload?.ts || Date.now(),
      status: 'connected'
    })
  },

  handleShutdown: (payload: any) => {
    set({
      isShuttingDown: true,
      shutdownReason: payload.reason || 'Server is shutting down',
      restartExpectedMs: payload.restartExpectedMs
    })

    toast.error('System Shutdown Warning', {
      description: payload.reason || 'The server is shutting down. Please save your work.',
      duration: 10000
    })
  },

  handleError: () => {
    set({ status: 'error' })
  },

  init: () => {
    // 基础配置初始化 (如有逻辑)
  }
}))
