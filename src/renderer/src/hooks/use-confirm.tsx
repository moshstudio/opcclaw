import * as React from 'react'
import { ConfirmContext } from '../components/ui/confirm-context'

export function useConfirm() {
  const context = React.useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context.confirm
}

export function useInteract() {
  const context = React.useContext(ConfirmContext)
  if (!context) {
    throw new Error('useInteract must be used within a ConfirmProvider')
  }
  return context.interact
}

export function useConfirmDialog() {
  const context = React.useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmProvider')
  }
  return context
}
