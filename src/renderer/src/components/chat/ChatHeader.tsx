import React, { useRef, useEffect } from 'react'
import {
  ChevronDown,
  History,
  MessageSquare,
  Trash2,
  Plus,
  RotateCcw,
  PanelRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { Agent } from '@shared/types/agent'

interface ChatHeaderProps {
  activeAgent: Agent | undefined
  activeAgentId: string | null
  isTyping: boolean
  chatStatus: string
  getStatusDisplay: () => string
  isSessionsOpen: boolean
  setIsSessionsOpen: (open: boolean) => void
  activeAgentSessions: string[]
  currentSessionKey: string
  switchSession: (agentId: string, sessionKey: string) => void
  deleteSession: (agentId: string, sessionKey: string) => void
  newSession: (agentId: string) => void
  resetSession: (agentId: string) => void
  isLoadingSessions: Record<string, boolean>
  toggleSettings: () => void
  settingsVisible: boolean
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeAgent,
  activeAgentId,
  isTyping,
  chatStatus,
  getStatusDisplay,
  isSessionsOpen,
  setIsSessionsOpen,
  activeAgentSessions,
  currentSessionKey,
  switchSession,
  deleteSession,
  newSession,
  resetSession,
  isLoadingSessions,
  toggleSettings,
  settingsVisible
}) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSessionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [setIsSessionsOpen])

  return (
    <header className="h-16 border-b flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-50 font-bold">
      <div className="flex items-center gap-4">
        <div className="flex flex-col text-left relative" ref={dropdownRef}>
          <h3 className="text-sm font-bold uppercase tracking-tight">
            {activeAgent?.config?.name || activeAgentId || t('common.app_name')}
          </h3>
          <button
            onClick={() => setIsSessionsOpen(!isSessionsOpen)}
            className="flex items-center gap-1.5 hover:bg-muted/50 px-1.5 py-0.5 -ml-1.5 rounded-md transition-colors group"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all duration-300',
                isTyping
                  ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.4)]'
                  : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]',
                chatStatus === 'thinking' && 'bg-purple-500 shadow-purple-500/50',
                chatStatus === 'tool_executing' && 'bg-blue-500 shadow-blue-500/50',
                chatStatus === 'error' && 'bg-destructive'
              )}
            />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1 group-hover:text-foreground/80">
              {getStatusDisplay()}
              {!isTyping && (
                <ChevronDown
                  className={cn(
                    'w-3 h-3 transition-transform duration-200',
                    isSessionsOpen && 'rotate-180'
                  )}
                />
              )}
            </span>
          </button>

          <AnimatePresence>
            {isSessionsOpen && activeAgentId && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-xl shadow-2xl p-2 z-[60] overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 mb-1 text-muted-foreground/40 border-b border-border/50">
                  <History className="w-3 h-3" />
                  <span className="text-[0.65rem] font-bold uppercase tracking-widest">
                    {t('common.sessions')}
                  </span>
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-0.5">
                  {isLoadingSessions[activeAgentId] && activeAgentSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs uppercase tracking-widest font-bold">
                        {t('common.loading')}
                      </span>
                    </div>
                  ) : activeAgentSessions.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground/50 uppercase tracking-widest font-bold">
                      {t('common.no_history_sessions')}
                    </div>
                  ) : (
                    activeAgentSessions.map((sk) => (
                      <div
                        key={sk}
                        className={cn(
                          'group w-full flex items-center gap-1 rounded-lg text-xs transition-colors p-0.5',
                          currentSessionKey === sk ? 'bg-primary/10' : 'hover:bg-muted/80'
                        )}
                      >
                        <button
                          onClick={() => {
                            switchSession(activeAgentId, sk)
                            setIsSessionsOpen(false)
                          }}
                          className={cn(
                            'flex-1 flex items-center gap-2 px-3 py-2 text-left truncate transition-colors',
                            currentSessionKey === sk
                              ? 'text-primary font-bold'
                              : 'text-muted-foreground group-hover:text-foreground'
                          )}
                        >
                          <MessageSquare className="w-3 h-3 opacity-60" />
                          <span className="truncate flex-1">{sk.replace('session-', '')}</span>
                          {currentSessionKey === sk && (
                            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                          )}
                        </button>

                        {activeAgentSessions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const isConfirmed = await confirm({
                                title: t('common.confirm_delete_session'),
                                description: t('common.confirm_delete_session_desc'),
                                confirmText: t('common.delete'),
                                cancelText: t('common.cancel'),
                                variant: 'destructive'
                              })
                              if (isConfirmed.confirmed) {
                                deleteSession(activeAgentId, sk)
                              }
                            }}
                            className="h-8 w-8 opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all rounded-md shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-9 px-3 gap-2 text-muted-foreground hover:text-primary transition-colors font-bold"
          onClick={() => activeAgentId && newSession(activeAgentId)}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('common.new_session')}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-9 px-3 gap-2 text-muted-foreground hover:text-orange-500 transition-colors font-bold"
          onClick={() => activeAgentId && resetSession(activeAgentId)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{t('common.reset_session')}</span>
        </Button>

        <div className="w-px h-4 bg-border mx-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSettings}
          className={cn(
            'h-10 w-10 transition-all',
            settingsVisible
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <PanelRight className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}

export default ChatHeader
