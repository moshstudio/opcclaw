import * as React from 'react'

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const ConfirmContext = React.createContext<ConfirmContextType | undefined>(undefined)

/**
 * 全局提示服务单例 (Commercial Singleton)
 * 允许在 Zustand Store 或非 React 环境中调用 UI 对话框
 */
let globalConfirmFn: ((options: ConfirmOptions) => Promise<boolean>) | null = null

export const ConfirmService = {
  _set(fn: typeof globalConfirmFn) {
    globalConfirmFn = fn
  },
  async confirm(options: ConfirmOptions): Promise<boolean> {
    if (!globalConfirmFn) {
      console.warn('[ConfirmService] confirm called before its provider was mounted.')
      return Promise.resolve(false)
    }
    return globalConfirmFn(options)
  }
}
