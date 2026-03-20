import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy,
  Check,
  Brain,
  Zap,
  Clock,
  Activity,
  Bot,
  AlertCircle,
  CheckCircle2,
  Terminal,
  ChevronDown
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Message, ContentBlock, ChatStatus, SubagentInfo } from '@shared/types/agent'
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
  const [isExpanded, setIsExpanded] = useState(isThinking)

  return (
    <div className="group/think bg-zinc-50/80 dark:bg-zinc-800/20 border border-zinc-200/50 dark:border-zinc-700/30 rounded-xl overflow-hidden transition-all duration-300 hover:border-purple-500/30 shadow-sm">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-[9px]">
          <div
            className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300',
              isThinking
                ? 'bg-purple-500/10 text-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            <Brain className={cn('w-3.5 h-3.5', isThinking && 'animate-pulse')} />
          </div>
          <span className={cn('transition-colors', isThinking && 'text-purple-500')}>
            {isThinking ? t('common.thinking') : t('common.thought')}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-400"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="px-4 pb-4 pt-0">
              <div className="whitespace-pre-wrap pl-4 border-l-2 border-purple-500/20 dark:border-purple-500/10 italic leading-relaxed text-zinc-500/90 dark:text-zinc-400/90 text-xs max-h-[400px] overflow-y-auto custom-scrollbar">
                {text}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const UsageStats: React.FC<{ usage?: any; performance?: any }> = ({ usage, performance }) => {
  const { t } = useTranslation()
  if (!usage && !performance) return null

  const stats = [
    usage?.totalTokens && { icon: Zap, value: `${usage.totalTokens}`, label: t('common.tokens'), color: 'text-amber-500' },
    performance?.totalDurationMs && {
      icon: Clock,
      value: `${(performance.totalDurationMs / 1000).toFixed(1)}s`,
      label: t('common.latency'),
      color: 'text-blue-500'
    },
    performance?.throughput && {
      icon: Activity,
      value: `${performance.throughput.toFixed(1)}`,
      label: t('common.throughput'),
      suffix: 't/s',
      color: 'text-emerald-500'
    }
  ].filter(Boolean) as any[]

  if (stats.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50 opacity-60 hover:opacity-100 transition-opacity">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-center gap-1.5" title={stat.label}>
          <stat.icon className={cn("w-3 h-3", stat.color)} />
          <span className="text-[10px] font-mono font-bold tracking-tight text-zinc-500 dark:text-zinc-400">
            {stat.value}
            <span className="text-[8px] opacity-70 ml-0.5 uppercase">{stat.suffix || ''}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

const SubagentBlock: React.FC<{ subagent: SubagentInfo }> = ({ subagent }) => {
  const { t } = useTranslation()
  const { task, summary, error, label, status, agentId } = subagent
  const isError = status === 'error' || !!error
  const isRunning = status === 'running'

  return (
    <div
      className={cn(
        'group/subagent border rounded-xl overflow-hidden transition-all duration-300 hover:shadow-md',
        isError
          ? 'bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30'
          : isRunning
            ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-100/50 dark:border-amber-900/20'
            : 'bg-indigo-50/30 dark:bg-indigo-950/10 border-indigo-100/50 dark:border-indigo-900/20'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 border-b transition-colors',
          isError
            ? 'border-red-100 dark:border-red-800/30 bg-red-50/80 dark:bg-red-900/20'
            : isRunning
              ? 'border-amber-100/30 dark:border-amber-800/20 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-indigo-100/30 dark:border-indigo-800/20 bg-indigo-50/50 dark:bg-indigo-900/10'
        )}
      >
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shadow-sm',
            isError
              ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
              : isRunning
                ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
                : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
          )}
        >
          {isError ? (
            <AlertCircle className="w-4 h-4" />
          ) : isRunning ? (
            <Brain className="w-4 h-4 animate-pulse" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                isError
                  ? 'bg-red-200/50 dark:bg-red-800/50 text-red-700 dark:text-red-300'
                  : isRunning
                    ? 'bg-amber-200/50 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300'
                    : 'bg-indigo-200/50 dark:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300'
              )}
            >
              {isError
                ? t('common.subagent_error')
                : isRunning
                  ? t('common.subagent_running')
                  : t('common.subagent_summary')}
            </span>
            {(label || agentId) && (
              <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 truncate">
                {label || agentId}
              </span>
            )}
          </div>
          <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1 truncate">
            {task}
          </h4>
        </div>
        {!isError && !isRunning && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-0 group-hover/subagent:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="px-4 py-3 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm">
        <div className="flex items-start gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 font-medium">
          <Terminal className="w-3.5 h-3.5 mt-0.5 opacity-40 shrink-0" />
          <div className="flex-1 whitespace-pre-wrap">
            {isError ? (
              <span className="text-red-600 dark:text-red-400 italic">Error: {error}</span>
            ) : (
              summary
            )}
          </div>
        </div>
      </div>
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
    let textToCopy = ''
    if (typeof content === 'string') {
      textToCopy = content
    } else {
      // 智能过滤：跳过思考过程和工具结果，只复制给用户的文本反馈
      textToCopy = content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n')
    }

    if (!textToCopy) return
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
        <div className="flex flex-col gap-3 py-1">
          {['thinking', 'tool_executing', 'waiting'].includes(status) && (
            <div className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.2em] overflow-hidden">
              <div className="relative flex h-2 w-2">
                <span
                  className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                    status === 'thinking'
                      ? 'bg-purple-400'
                      : status === 'tool_executing'
                        ? 'bg-blue-400'
                        : 'bg-zinc-300'
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex rounded-full h-2 w-2',
                    status === 'thinking'
                      ? 'bg-purple-500'
                      : status === 'tool_executing'
                        ? 'bg-blue-500'
                        : 'bg-zinc-400'
                  )}
                />
              </div>
              <span
                className={cn(
                  'translate-y-[0.5px]',
                  status === 'thinking'
                    ? 'text-purple-500/80 dark:text-purple-400/80'
                    : status === 'tool_executing'
                      ? 'text-blue-500/80 dark:text-blue-400/80'
                      : 'text-zinc-400/80'
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
            case 'subagent':
              return block.subagent ? (
                <SubagentBlock key={`sa-${idx}`} subagent={block.subagent} />
              ) : null
            default:
              return null
          }
        })}
        {isTyping && ['streaming', 'waiting', 'thinking', 'tool_executing'].includes(status) && (
          <LoadingDots />
        )}
        <UsageStats usage={message.usage} performance={message.performance} />
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
              : cn(
                  'bg-white dark:bg-zinc-900 text-foreground border border-zinc-100 dark:border-zinc-800 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] hover:shadow-md',
                  isTyping && 'ring-2 ring-primary/10 shadow-lg shadow-primary/5'
                )
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
