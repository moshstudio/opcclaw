import React, { useState } from 'react'
import { Send, Menu, PanelRight, Paperclip, Smile, Mic } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ChatBoxProps {
  toggleSidebar: () => void
  settingsVisible: boolean
  toggleSettings: () => void
}

const ChatBox: React.FC<ChatBoxProps> = ({ toggleSidebar, settingsVisible, toggleSettings }) => {
  const { t } = useTranslation()
  const [messages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: t('common.message_assistant'),
      timestamp: '10:00 AM'
    }
  ])

  const [input, setInput] = useState('')

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 transition-all duration-300 relative">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10 font-bold">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h3 className="text-sm font-bold uppercase tracking-tight">
              {t('settings.agent_title')}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {t('common.online')}
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
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
          {messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              key={msg.id}
              className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm transition-all duration-200 font-medium',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none shadow-primary/10'
                    : 'bg-muted/50 text-foreground border rounded-tl-none shadow-black/5 hover:bg-muted/70'
                )}
              >
                {msg.content}
              </div>
              <span className="text-[10px] text-muted-foreground/40 mt-1.5 px-1 font-bold italic uppercase tracking-wider">
                {msg.timestamp}
              </span>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Input Area - Docked at bottom */}
      <div className="bg-background border-t p-4 md:p-6 shrink-0 z-20 transition-all duration-300">
        <div className="max-w-3xl mx-auto relative group">
          <div className="bg-muted/30 backdrop-blur-xl border border-muted-foreground/10 rounded-2xl shadow-sm overflow-hidden focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-300">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('common.message_assistant')}
              className="w-full bg-transparent border-none py-4 px-5 pr-12 text-sm focus:outline-none resize-none min-h-[56px] max-h-[200px] font-medium"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground/50 hover:text-primary transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground/50 hover:text-primary transition-colors"
                >
                  <Smile className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground/50 hover:text-primary transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </Button>
              </div>
              <Button
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
