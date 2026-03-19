import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Brain } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Message, ContentBlock, ChatStatus } from '@shared/types/agent'
import { useTranslation } from 'react-i18next'
import { isJson } from '@renderer/lib/chat-utils'
import MarkdownRenderer from './MarkdownRenderer'
import ToolBlock from './ToolBlock'

interface MessageBubbleProps {
  message: Message
  allToolResults?: Map<string, ContentBlock>
  isTyping?: boolean
  isFinished?: boolean
  status?: ChatStatus
}

const ThinkingBlock: React.FC<{ text: string; isThinking?: boolean }> = ({ text, isThinking }) => {
  const { t } = useTranslation()
  return (
    <div className="group/think bg-zinc-50/50 dark:bg-zinc-800/20 border border-zinc-100 dark:border-zinc-800/50 rounded-lg p-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 font-medium overflow-hidden">
      <div className="flex items-center gap-1.5 mb-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
        <Brain
          className={cn(
            'w-3 h-3 transition-colors group-hover/think:text-purple-500',
            isThinking && 'animate-pulse text-purple-500'
          )}
        />
        {isThinking ? t('common.thinking') : t('common.thought')}
      </div>
      <div className="whitespace-pre-wrap opacity-80 overflow-hidden">{text}</div>
    </div>
  )
}

const LoadingDots: React.FC = () => (
  <div className="flex gap-1.5 px-1 py-2">
    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
  </div>
)

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  allToolResults,
  isTyping,
  status = 'idle'
}) => {
  const { t } = useTranslation()
  const { role, content, timestamp } = message
  const isUser = role === 'user'
  const isSystem = role === 'system'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const textToCopy =
      typeof content === 'string'
        ? content
        : content.map((block) => (block.type === 'text' ? block.text : '')).join('\n')

    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isOnlyToolResults =
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((block) => block.type === 'tool_result')

  if (isOnlyToolResults && allToolResults) return null

  const renderContent = () => {
    const isEmpty =
      !content || (typeof content === 'string' ? !content.trim() : content.length === 0)

    if (isEmpty && isTyping) {
      return (
        <div className="flex flex-col gap-2">
          {['thinking', 'tool_executing', 'waiting'].includes(status) && (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest animate-pulse overflow-hidden">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  status === 'thinking'
                    ? 'bg-purple-500'
                    : status === 'tool_executing'
                      ? 'bg-blue-500'
                      : 'bg-zinc-300'
                )}
              />
              <span
                className={cn(
                  status === 'thinking'
                    ? 'text-purple-500'
                    : status === 'tool_executing'
                      ? 'text-blue-500'
                      : 'text-zinc-400'
                )}
              >
                {t(
                  `common.${
                    status === 'thinking'
                      ? 'thinking'
                      : status === 'tool_executing'
                        ? 'executing_tool'
                        : 'waiting'
                  }`
                )}
              </span>
            </div>
          )}
          <LoadingDots />
        </div>
      )
    }

    if (typeof content === 'string') {
      return (
        <div className="flex flex-col gap-2 overflow-hidden">
          {isJson(content) ? (
            <MarkdownRenderer content={`\`\`\`json\n${content}\n\`\`\``} />
          ) : (
            <MarkdownRenderer content={content} />
          )}
          {isTyping && status === 'streaming' && <LoadingDots />}
        </div>
      )
    }

    const consumedBlockIndices = new Set<number>()
    return (
      <div className="space-y-4 w-full min-w-0 overflow-hidden">
        {content.map((block, idx) => {
          if (consumedBlockIndices.has(idx)) return null

          switch (block.type) {
            case 'thinking': {
              const isCurrentThinking =
                isTyping && status === 'thinking' && idx === content.length - 1
              return block.text ? (
                <ThinkingBlock
                  key={`thinking-${idx}`}
                  text={block.text}
                  isThinking={isCurrentThinking}
                />
              ) : null
            }
            case 'text':
              return block.text ? (
                <MarkdownRenderer key={`text-${idx}`} content={block.text} />
              ) : null
            case 'tool_use': {
              const resIdx = content.findIndex(
                (b) => b.type === 'tool_result' && b.tool_use_id === block.id
              )
              const resultBlock = resIdx !== -1 ? content[resIdx] : allToolResults?.get(block.id!)
              if (resIdx !== -1) consumedBlockIndices.add(resIdx)

              return (
                <ToolBlock
                  key={`tool-${block.id}-${idx}`}
                  name={block.name || t('common.unknown_tool')}
                  input={block.input}
                  result={resultBlock?.content}
                  status={resultBlock ? 'success' : 'loading'}
                />
              )
            }
            case 'tool_result':
              return !consumedBlockIndices.has(idx) ? (
                <ToolBlock
                  key={`result-${idx}`}
                  name={t('common.tool_result')}
                  input={{ note: t('common.unmatched_tool_result') }}
                  result={block.content}
                />
              ) : null
            default:
              return null
          }
        })}
        {isTyping && ['streaming', 'waiting', 'thinking', 'tool_executing'].includes(status) && (
          <LoadingDots />
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'flex flex-col min-w-0 w-full px-2 sm:px-4 md:px-6 relative',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'max-w-[92%] sm:max-w-[85%] rounded-xl p-5 shadow-sm transition-all duration-300 min-w-0 overflow-hidden grid grid-cols-1 relative group',
          isUser
            ? 'bg-orange-50/80 dark:bg-orange-950/20 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800/50 shadow-orange-100/50 dark:shadow-none'
            : isSystem
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-lg text-xs'
              : 'bg-white dark:bg-zinc-900 text-foreground border border-zinc-100 dark:border-zinc-800 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-md'
        )}
      >
        <div className="min-w-0 w-full overflow-hidden leading-relaxed">{renderContent()}</div>

        {!isUser && !isSystem && (
          <button
            onClick={handleCopy}
            className={cn(
              'absolute top-3 right-3 p-2 rounded-lg transition-all duration-200',
              'opacity-0 group-hover:opacity-100 focus:opacity-100',
              'bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700',
              'text-zinc-500 hover:text-indigo-600 shadow-sm z-10'
            )}
            title={t('common.copy_message')}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Check className="w-3.5 h-3.5 text-green-500" />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2 px-1">
        <span className="text-[9px] text-muted-foreground/40 font-bold italic uppercase tracking-widest">
          {timestamp}
        </span>
      </div>
    </motion.div>
  )
}

export default MessageBubble
