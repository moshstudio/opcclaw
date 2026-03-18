import React, { useState, useEffect, useRef } from 'react'
import {
  Send,
  Menu,
  PanelRight,
  Paperclip,
  Smile,
  Plus,
  RotateCcw,
  ChevronDown,
  MessageSquare,
  History,
  Trash2,
  Square
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useConfirm } from '@renderer/hooks/use-confirm'
import MessageBubble from '../chat/MessageBubble'

interface ChatBoxProps {
  toggleSidebar: () => void
  settingsVisible: boolean
  toggleSettings: () => void
}

const ChatBox: React.FC<ChatBoxProps> = ({ toggleSidebar, settingsVisible, toggleSettings }) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const {
    getVisibleMessages,
    sendMessage,
    init: initChat,
    chatStatuses,
    isLoadingHistory,
    newSession,
    resetSession,
    sessionKeys,
    allSessions,
    isLoadingSessions,
    switchSession,
    deleteSession,
    abortMessage
  } = useChatStore()
  const { agents, activeAgentId } = useAgentStore()
  const [input, setInput] = useState('')
  const [isSessionsOpen, setIsSessionsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const messages = getVisibleMessages()
  const currentSessionKey = activeAgentId ? sessionKeys[activeAgentId] || 'main' : 'main'
  const chatStatus = currentSessionKey ? chatStatuses[currentSessionKey] || 'idle' : 'idle'

  // 仅在关键活动状态下允许中止（显示停止图标）
  const isTyping = ['waiting', 'thinking', 'streaming', 'tool_executing'].includes(chatStatus)
  const isFinished = ['completed', 'error', 'aborted'].includes(chatStatus)

  const isLoading = activeAgentId ? isLoadingHistory[activeAgentId] : false
  const activeAgentSessions = activeAgentId ? allSessions[activeAgentId] || [] : []

  const getStatusDisplay = () => {
    if (!isTyping) return currentSessionKey.replace('session-', '')
    switch (chatStatus) {
      case 'waiting':
        return t('common.waiting') || 'Waiting'
      case 'thinking':
        return t('common.thinking') || 'Thinking'
      case 'tool_executing':
        return t('common.executing_tool') || 'Executing'
      case 'streaming':
        return t('common.typing') || 'Typing'
      default:
        return t('common.typing') || 'Typing'
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSessionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  // 监听 WebSocket 事件流
  useEffect(() => {
    initChat()
  }, [initChat])

  // 自动滚动逻辑
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => scrollToBottom('smooth'), 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [messages, isTyping, isLoading])

  // 切换 Agent 时立即滚动到底部
  useEffect(() => {
    scrollToBottom('auto')
  }, [activeAgentId])

  const handleSend = async () => {
    if (isTyping) {
      if (activeAgentId && currentSessionKey) {
        await abortMessage(activeAgentId, currentSessionKey)
      }
      return
    }

    if (!input.trim()) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 transition-all duration-300 relative">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-50 font-bold">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex flex-col text-left relative" ref={dropdownRef}>
            <h3 className="text-sm font-bold uppercase tracking-tight">
              {activeAgent?.config.name || activeAgentId || 'OpenClaw'}
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
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1 group-hover:text-foreground/80">
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

            {/* Session Dropdown Menu */}
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
                    <span className="text-[9px] font-bold uppercase tracking-widest">
                      {t('common.sessions')}
                    </span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-0.5">
                    {isLoadingSessions[activeAgentId] && activeAgentSessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">
                          {t('common.loading')}
                        </span>
                      </div>
                    ) : activeAgentSessions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold">
                        No History Sessions
                      </div>
                    ) : (
                      activeAgentSessions.map((sk) => (
                        <div
                          key={sk}
                          className={cn(
                            'group w-full flex items-center gap-1 rounded-lg text-xs transition-colors p-0.5',
                            currentSessionKey === sk
                              ? 'bg-primary/10'
                              : 'hover:bg-muted/80'
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
                                  variant: 'destructive'
                                })
                                if (isConfirmed) {
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

          <Button variant="ghost" className="text-xs h-9 px-4 text-muted-foreground font-bold">
            {t('common.share')}
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

      {/* Messages */}
      <ScrollArea className="flex-1 w-full min-w-0">
        <div className="max-w-5xl mx-auto w-full px-3 py-6 md:px-4 md:py-8 space-y-10 text-left min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse font-bold uppercase tracking-widest">
                {t('common.loading_history')}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-24 text-muted-foreground text-sm font-medium">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Smile className="w-8 h-8 opacity-20" />
              </div>
              <p className="opacity-40 uppercase tracking-widest text-[10px] font-bold">
                {t('common.no_messages')}
              </p>
            </div>
          ) : (
            <>
              {(() => {
                const allToolResults = new Map()
                messages.forEach((msg) => {
                  if (Array.isArray(msg.content)) {
                    msg.content.forEach((block) => {
                      if (block.type === 'tool_result' && block.tool_use_id) {
                        allToolResults.set(block.tool_use_id, block)
                      }
                    })
                  }
                })

                const rendered = messages.map((msg, idx) => {
                  const isLastMessage = idx === messages.length - 1
                  const isFinished = !isTyping && isLastMessage && msg.role === 'assistant'
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      allToolResults={allToolResults}
                      isTyping={isTyping && isLastMessage && msg.role === 'assistant'}
                      isFinished={isFinished}
                      status={isLastMessage ? chatStatus : 'idle'}
                    />
                  )
                })

                // 如果正在输入，但最后一条不是 AI 消息（即正在等待 AI 响应），追加一个带 loading 的临时气泡
                if (isTyping && messages[messages.length - 1]?.role !== 'assistant') {
                  rendered.push(
                    <MessageBubble
                      key="typing-placeholder"
                      message={{
                        id: 'typing-placeholder',
                        role: 'assistant',
                        content: '',
                        timestamp: new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      }}
                      isTyping={true}
                      status={chatStatus}
                    />
                  )
                }

                return rendered
              })()}

              <div ref={messagesEndRef} className="h-4 w-full shrink-0" />
            </>
          )}
        </div>
      </ScrollArea>

      <div className="bg-background/50 backdrop-blur-sm border-t p-3 md:px-4 md:py-4 shrink-0 z-20 transition-all duration-300 w-full min-w-0">
        <div className="max-w-4xl mx-auto w-full min-w-0 relative group">
          <div className="bg-orange-50/30 dark:bg-orange-950/10 border border-orange-200/60 dark:border-orange-800/40 rounded-xl shadow-[0_2px_12px_-3px_rgba(0,0,0,0.04),0_8px_16px_-4px_rgba(0,0,0,0.03)] overflow-hidden focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-500/5 transition-all duration-300">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={t('common.message_assistant')}
              className="w-full bg-transparent border-none py-3 px-4 pr-12 text-sm focus:outline-none resize-none min-h-[48px] font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-orange-950 dark:text-orange-100 custom-scrollbar"
              style={{ maxHeight: '160px' }}
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50">
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50">
                  <Smile className="w-4 h-4" />
                </Button>
              </div>
              <Button
                onClick={handleSend}
                disabled={!input.trim() && !isTyping}
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-xl shadow-lg transition-all active:scale-95',
                  input.trim() || isTyping
                    ? 'bg-primary text-primary-foreground shadow-primary/20'
                    : 'bg-muted text-muted-foreground/20',
                  isTyping && 'bg-destructive/90 hover:bg-destructive text-white shadow-destructive/20'
                )}
              >
                {isTyping ? (
                  <Square className="w-3 h-3 fill-current" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatBox
