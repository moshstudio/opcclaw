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
