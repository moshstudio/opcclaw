import * as React from 'react'
import { InteractionResult as AgentInteractionResult } from '@shared/types/agent'

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

export interface InteractionOptions {
  title?: string
  description?: string
  options: string[]
  showRemember?: boolean
  rememberKey?: string
  cancelText?: string
}

export interface ConfirmResult {
  confirmed: boolean
}

export interface InteractionResult {
  result: AgentInteractionResult
  remember: boolean
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<ConfirmResult>
  interact: (options: InteractionOptions) => Promise<InteractionResult>
  close: () => void
}

export const ConfirmContext = React.createContext<ConfirmContextType | undefined>(undefined)

/**
 * 全局提示服务单例
 */
let globalConfirmFn: ((options: ConfirmOptions) => Promise<ConfirmResult>) | null = null
let globalInteractFn: ((options: InteractionOptions) => Promise<InteractionResult>) | null = null
let globalCloseFn: (() => void) | null = null

export const ConfirmService = {
  _set(
    confirm: typeof globalConfirmFn,
    interact: typeof globalInteractFn,
    close: typeof globalCloseFn
  ) {
    globalConfirmFn = confirm
    globalInteractFn = interact
    globalCloseFn = close
  },
  async confirm(options: ConfirmOptions): Promise<ConfirmResult> {
    if (!globalConfirmFn) {
      console.warn('[ConfirmService] confirm called before its provider was mounted.')
      return { confirmed: false }
    }
    return globalConfirmFn(options)
  },
  async interact(options: InteractionOptions): Promise<InteractionResult> {
    if (!globalInteractFn) {
      console.warn('[ConfirmService] interact called before its provider was mounted.')
      return { result: [], remember: false }
    }
    return globalInteractFn(options)
  },
  close() {
    if (globalCloseFn) {
      globalCloseFn()
    }
  }
}
