import React, { useEffect } from 'react'
import { Send, Paperclip, Smile, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { ChatStatus } from '@shared/types/agent'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  handleSend: () => void
  isTyping: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  currentError: string | null
  chatStatus: ChatStatus
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  handleSend,
  isTyping,
  inputRef,
  currentError,
  chatStatus
}) => {
  const { t } = useTranslation()

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`
    }
  }, [input, inputRef])

  return (
    <div className="flex flex-col w-full shrink-0">
      {/* Error Message */}
      <AnimatePresence>
        {currentError && chatStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-4 py-2 bg-destructive/10 text-destructive text-xs text-center border-t border-destructive/20 font-bold max-w-full overflow-hidden text-ellipsis shadow-[0_-4px_12px_rgba(220,38,38,0.1)]"
          >
            {currentError}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-background/50 backdrop-blur-sm border-t p-3 md:px-4 md:py-4 shrink-0 z-20 transition-all duration-300 w-full min-w-0">
        <div className="max-w-4xl mx-auto w-full min-w-0 relative group">
          <div className="bg-secondary/30 dark:bg-secondary/10 border border-border/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-500">
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
              className="w-full bg-transparent border-none py-3.5 px-4 pr-12 text-sm focus:outline-none resize-none min-h-[48px] font-medium placeholder:text-muted-foreground/40 text-foreground custom-scrollbar transition-colors"
              style={{ maxHeight: '160px' }}
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <Smile className="w-4 h-4" />
                </Button>
              </div>
              <Button
                onClick={handleSend}
                disabled={!input.trim() && !isTyping}
                size="icon"
                className={cn(
                  'h-9 w-9 rounded-xl shadow-lg transition-all duration-300 relative flex items-center justify-center overflow-hidden',
                  input.trim() || isTyping
                    ? 'bg-gradient-to-br from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-700 text-white shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 active:scale-95'
                    : 'bg-muted/50 text-muted-foreground/20 shadow-none cursor-not-allowed',
                  isTyping &&
                    'from-destructive via-destructive/90 to-destructive/80 shadow-destructive/25'
                )}
              >
                <AnimatePresence mode="wait">
                  {isTyping ? (
                    <motion.div
                      key="stop"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="flex items-center justify-center"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="send"
                      initial={{ opacity: 0, x: -5, y: 5 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, x: 5, y: -5 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="flex items-center justify-center"
                    >
                      <Send className="w-4 h-4 translate-x-[0.5px] -translate-y-[0.5px]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatInput
