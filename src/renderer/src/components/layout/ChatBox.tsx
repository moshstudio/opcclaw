import React, { useState, useEffect, useRef } from 'react'
import { Send, Menu, PanelRight, Paperclip, Smile } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import MessageBubble from '../chat/MessageBubble'

interface ChatBoxProps {
  toggleSidebar: () => void
  settingsVisible: boolean
  toggleSettings: () => void
}

const ChatBox: React.FC<ChatBoxProps> = ({ toggleSidebar, settingsVisible, toggleSettings }) => {
  const { t } = useTranslation()
  const {
    getVisibleMessages,
    sendMessage,
    init: initChat,
    typingStates,
    isLoadingHistory
  } = useChatStore()
  const { agents, activeAgentId } = useAgentStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const messages = getVisibleMessages()
  const isTyping = activeAgentId ? typingStates[activeAgentId] : false
  const isLoading = activeAgentId ? isLoadingHistory[activeAgentId] : false

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  // 监听 WebSocket 事件流 (仅在挂载时执行一次 init)
  useEffect(() => {
    initChat()
  }, [initChat])

  // 自动滚动逻辑
  useEffect(() => {
    if (!isLoading) {
      // 如果消息正在更新或正在打字，滚动到底部
      // messages 作为依赖项，确保流式输出时内容变化也能触发
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
    if (!input.trim() || isTyping) return // 打字中禁止再次发送（商用限制）
    const text = input
    setInput('')
    await sendMessage(text)
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 transition-all duration-300 relative">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10 font-bold">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex flex-col text-left">
            <h3 className="text-sm font-bold uppercase tracking-tight">
              {activeAgent?.config.name || activeAgentId || 'OpenClaw'}
            </h3>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)]',
                  isTyping ? 'bg-primary animate-pulse' : 'bg-green-500'
                )}
              />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {isTyping
                  ? t('common.typing')
                  : activeAgent?.config.description || t('common.online')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" className="text-xs h-9 px-4 text-muted-foreground">
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
        <div className="max-w-4xl mx-auto w-full p-4 md:p-8 space-y-10 text-left min-w-0">
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
                // Pre-build a map of all tool results to pass to bubbles for grouping
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

                return messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} allToolResults={allToolResults} />
                ))
              })()}

              {/* 打字机动画指示器 */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 px-2"
                >
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                  </div>
                </motion.div>
              )}
              {/* 滚动锚点 */}
              <div ref={messagesEndRef} className="h-4 w-full shrink-0" />
            </>
          )}
        </div>
      </ScrollArea>

      <div className="bg-background/50 backdrop-blur-sm border-t p-4 md:p-6 shrink-0 z-20 transition-all duration-300 w-full min-w-0">
        <div className="max-w-3xl mx-auto w-full min-w-0 relative group">
          <div className="bg-orange-50/30 dark:bg-orange-950/10 border border-orange-200/60 dark:border-orange-800/40 rounded-xl shadow-[0_2px_12px_-3px_rgba(0,0,0,0.04),0_8px_16px_-4px_rgba(0,0,0,0.03)] overflow-hidden focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-500/5 transition-all duration-300">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={t('common.message_assistant')}
              className="w-full bg-transparent border-none py-5 px-6 pr-12 text-[15px] focus:outline-none resize-none min-h-[64px] max-h-[250px] font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-orange-950 dark:text-orange-100"
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
                disabled={!input.trim()}
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-xl shadow-lg transition-all active:scale-95',
                  input.trim()
                    ? 'bg-primary text-primary-foreground shadow-primary/20'
                    : 'bg-muted text-muted-foreground/20'
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatBox
