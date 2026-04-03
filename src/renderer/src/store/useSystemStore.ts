import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@renderer/i18n'

interface SystemState {
  lastTick: number
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error'
  isShuttingDown: boolean
  shutdownReason: string | null
  restartExpectedMs: number | null

  initialized: boolean
  isInitializing: boolean

  handleConnect: () => void
  handleDisconnect: () => void
  handleTick: (payload: any) => void
  handleShutdown: (payload: any) => void
  handleError: (err: Error) => void
  setInitializing: (val: boolean) => void

  init: () => void
}

export const useSystemStore = create<SystemState>((set) => ({
  lastTick: Date.now(),
  status: 'disconnected',
  isShuttingDown: false,
  shutdownReason: null,
  restartExpectedMs: null,
  initialized: false,
  isInitializing: true,

  // --- External Handlers (Called by GatewaySync) ---
  setInitializing: (val: boolean) => {
    set({ isInitializing: val })
  },
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
      shutdownReason: payload.reason || i18n.t('common.system_shutdown_desc'),
      restartExpectedMs: payload.restartExpectedMs
    })

    toast.error(i18n.t('common.system_shutdown'), {
      description: payload.reason || i18n.t('common.system_shutdown_desc'),
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
