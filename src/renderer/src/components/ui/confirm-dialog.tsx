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
import { ConfirmContext, ConfirmOptions, ConfirmService, ConfirmResult } from './confirm-context'
import { Switch } from './switch'

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [remember, setRemember] = React.useState(false)
  const [options, setOptions] = React.useState<ConfirmOptions>({})
  const [resolveRef, setResolveRef] = React.useState<{
    resolve: (value: ConfirmResult) => void
  } | null>(null)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    setOptions(options)
    setRemember(false)
    setOpen(true)
    return new Promise<ConfirmResult>((resolve) => {
      setResolveRef({ resolve })
    })
  }, [])

  const handleCancel = () => {
    setOpen(false)
    resolveRef?.resolve({ confirmed: false, remember: false })
  }

  const handleConfirm = () => {
    setOpen(false)
    resolveRef?.resolve({ confirmed: true, remember })
  }

  React.useEffect(() => {
    ConfirmService._set(confirm)
  }, [confirm])

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

          {options.showRemember && (
            <div className="flex items-center space-x-2 py-2">
              <Switch id="remember-choice" checked={remember} onCheckedChange={setRemember} />
              <label
                htmlFor="remember-choice"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {t('common.remember_choice')}
              </label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelText || t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                options.variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {options.confirmText || t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
