'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './alert-dialog'
import { useTranslation } from 'react-i18next'
import { ConfirmContext, ConfirmOptions } from './confirm-context'

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<ConfirmOptions>({})
  const [resolveRef, setResolveRef] = React.useState<{ resolve: (value: boolean) => void } | null>(
    null
  )

  const confirm = React.useCallback((options: ConfirmOptions) => {
    setOptions(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolveRef({ resolve })
    })
  }, [])

  const handleCancel = () => {
    setOpen(false)
    resolveRef?.resolve(false)
  }

  const handleConfirm = () => {
    setOpen(false)
    resolveRef?.resolve(true)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title || t('common.confirm') || 'Confirm'}</AlertDialogTitle>
            <AlertDialogDescription>
              {options.description || t('common.are_you_sure') || 'Are you sure?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelText || t('common.cancel') || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                options.variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {options.confirmText || t('common.confirm') || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
