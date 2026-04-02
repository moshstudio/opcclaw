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
import { cn } from '@renderer/lib/utils'
import {
  ConfirmContext,
  ConfirmOptions,
  ConfirmResult,
  ConfirmService,
  InteractionOptions,
  InteractionResult
} from './confirm-context'
import { Switch } from './switch'
import { HelpCircle, AlertCircle, Info } from 'lucide-react'

type DialogState =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (v: ConfirmResult) => void }
  | { type: 'interact'; options: InteractionOptions; resolve: (v: InteractionResult) => void }
  | null

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState>(null)
  const [remember, setRemember] = React.useState(false)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<ConfirmResult>((resolve) => {
      setState({ type: 'confirm', options, resolve })
    })
  }, [])

  const interact = React.useCallback((options: InteractionOptions) => {
    setRemember(false)
    return new Promise<InteractionResult>((resolve) => {
      setState({ type: 'interact', options, resolve })
    })
  }, [])

  const close = React.useCallback(() => {
    if (!state) return
    if (state.type === 'confirm') {
      state.resolve({ confirmed: false })
    } else {
      state.resolve({ result: [], remember: false })
    }
    setState(null)
  }, [state])

  React.useEffect(() => {
    ConfirmService._set(confirm, interact, close)
  }, [confirm, interact, close])

  const isOpen = state !== null

  return (
    <ConfirmContext.Provider value={{ confirm, interact, close }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent className="max-w-[400px] border border-border bg-card p-6 shadow-xl rounded-xl gap-0">
          {state?.type === 'confirm' ? (
            <ConfirmDialogContent
              options={state.options}
              onConfirm={() => {
                state.resolve({ confirmed: true })
                setState(null)
              }}
              onCancel={() => {
                state.resolve({ confirmed: false })
                setState(null)
              }}
            />
          ) : state?.type === 'interact' ? (
            <InteractionDialogContent
              options={state.options}
              remember={remember}
              setRemember={setRemember}
              onSelect={(opt) => {
                state.resolve({ result: [opt], remember })
                setState(null)
              }}
              onCancel={() => {
                state.resolve({ result: [], remember: false })
                setState(null)
              }}
            />
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

/**
 * 基础确认对话框组件 - 用于二元选择 (Confirm/Cancel)
 */
interface ConfirmDialogContentProps {
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialogContent({ options, onConfirm, onCancel }: ConfirmDialogContentProps) {
  const { t } = useTranslation()
  return (
    <>
      <AlertDialogHeader className="flex-row items-start gap-3 space-y-0 pb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted/50 border border-border mt-0.5 shrink-0">
          {options.variant === 'destructive' ? (
            <AlertCircle className="w-5 h-5 text-destructive" />
          ) : (
            <Info className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <AlertDialogTitle className="text-lg font-bold leading-none truncate">
            {options.title || t('common.confirm')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {options.description || t('common.are_you_sure')}
          </AlertDialogDescription>
        </div>
      </AlertDialogHeader>

      <AlertDialogFooter className="flex-row sm:flex-row justify-end gap-3 px-0">
        <AlertDialogCancel
          onClick={onCancel}
          className="h-10 px-4 text-xs font-bold border border-border/50 hover:bg-muted transition-all"
        >
          {options.cancelText || t('common.cancel')}
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          variant={options.variant === 'destructive' ? 'destructive' : 'default'}
          className={cn(
            'h-10 px-4 text-xs font-bold transition-all shadow-md',
            options.variant !== 'destructive' &&
              'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {options.confirmText || t('common.confirm')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

/**
 * 交互对话框组件 - 用于多选项选择 (List interaction)
 */
interface InteractionDialogContentProps {
  options: InteractionOptions
  remember: boolean
  setRemember: (v: boolean) => void
  onSelect: (opt: string) => void
  onCancel: () => void
}

function InteractionDialogContent({
  options,
  remember,
  setRemember,
  onSelect,
  onCancel
}: InteractionDialogContentProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <AlertDialogHeader className="flex-row items-start gap-3 space-y-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 mt-0.5 shrink-0">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <AlertDialogTitle className="text-lg font-bold leading-none truncate">
            {options.title || t('common.interaction')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {options.description || t('common.choose_an_option')}
          </AlertDialogDescription>
        </div>
      </AlertDialogHeader>

      {options.showRemember && (
        <div
          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 group transition-colors cursor-pointer"
          onClick={() => setRemember(!remember)}
        >
          <label className="text-xs font-semibold text-muted-foreground cursor-pointer select-none">
            {t('common.remember_choice')}
          </label>
          <Switch checked={remember} onCheckedChange={setRemember} className="scale-90" />
        </div>
      )}

      <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
        {options.options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="w-full h-11 px-4 text-xs font-bold border border-border/50 bg-secondary/20 hover:bg-secondary/40 active:scale-[0.98] transition-all text-left rounded-lg group flex items-center justify-between"
          >
            <span className="truncate">{opt}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>

      {options.cancelText && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <AlertDialogCancel
            onClick={onCancel}
            variant="ghost"
            className="w-full h-10 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all shadow-none"
          >
            {options.cancelText}
          </AlertDialogCancel>
        </div>
      )}
    </div>
  )
}
