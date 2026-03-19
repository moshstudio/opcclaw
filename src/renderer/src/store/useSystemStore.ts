import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'
import { toast } from 'sonner'

interface SystemState {
  lastTick: number
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error'
  isShuttingDown: boolean
  shutdownReason: string | null
  restartExpectedMs: number | null
  
  initialized: boolean
  init: () => void

}

export const useSystemStore = create<SystemState>((set, get) => ({
  lastTick: Date.now(),
  status: 'disconnected',
  isShuttingDown: false,
  shutdownReason: null,
  restartExpectedMs: null,
  initialized: false,


  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    const client = getGatewayClient()

    // 监听连接成功
    client.onConnect(() => {
      set({ status: 'connected', isShuttingDown: false })
    })

    // 监听关闭/断开
    client.onClose(() => {
      set({ status: 'reconnecting' })
    })

    // 监听心跳
    client.onTick((payload) => {
      set({ 
        lastTick: payload.ts || Date.now(),
        status: 'connected' // 收到心跳肯定连着
      })
    })

    // 监听关机预警
    client.onShutdown((payload) => {
      set({
        isShuttingDown: true,
        shutdownReason: payload.reason || 'Server is shutting down',
        restartExpectedMs: payload.restartExpectedMs
      })
      
      toast.error('System Shutdown Warning', {
        description: payload.reason || 'The server is shutting down. Please save your work.',
        duration: 10000,
      })
    })

    // 初始连接尝试
    client.ensureConnected().catch(() => {
      set({ status: 'error' })
    })
  }
}))
