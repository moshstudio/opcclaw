import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ChevronDown, Zap, Cpu } from 'lucide-react'
import {
  Message,
  ChatStatus,
  AgentToolCallBlock,
  AgentToolResultBlock,
  AgentPerformance
} from '@shared/types/agent'
import { useTranslation } from 'react-i18next'
import MarkdownRenderer from './MarkdownRenderer'
import ToolBlock from './ToolBlock'
import { MESSAGE_BLOCK_VARIANTS, CHAT_TRANSITION, LOADING_DOT_VARIANTS } from './ChatAnimations'

// ============================================================================
// 1. Auxiliary Internal Components
// ============================================================================

/** 思考过程展示组件 */
const ThinkingBlock: React.FC<{ text: string; isThinking?: boolean }> = ({ text, isThinking }) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const { t } = useTranslation()

  return (
    <motion.div
      layout
      transition={CHAT_TRANSITION}
      className="my-1 overflow-hidden rounded-[6px] bg-primary/5 border border-primary/5"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{isThinking ? t('chat.thinking') : t('chat.thought_process')}</span>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={CHAT_TRANSITION}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-muted-foreground/70 border-t border-primary/5 pt-3">
              <MarkdownRenderer content={text} />
              {isThinking && (
                <div className="flex gap-1.5 mt-3">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-primary/40"
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** 消耗与性能统计组件 */
const UsageStats: React.FC<{ usage?: any; performance?: AgentPerformance }> = ({
  usage,
  performance
}) => {
  const { t } = useTranslation()
  if (!usage && !performance) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 opacity-0 group-hover/message:opacity-100 transition-opacity duration-300">
      {usage && (
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tight">
          <Zap size={10} className="text-amber-500" />
          <span>{t('common.tokens_count', { count: usage.totalTokens || 0 })}</span>
          <span className="opacity-40">
            ({usage.input || 0} / {usage.output || 0})
          </span>
        </div>
      )}
      {performance && (
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tight">
          <Cpu size={10} className="text-blue-500" />
          <span>{((performance.totalDurationMs || 0) / 1000).toFixed(2)}s</span>
          {performance.throughput && (
            <span className="opacity-40 ml-1">@{performance.throughput.toFixed(1)} T/S</span>
          )}
        </div>
      )}
    </div>
  )
}

/** 气泡内部专用的加载指示器 */
const BubbleLoadingIndicator: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex gap-1.5 mt-4 mb-1 px-1"
  >
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        custom={i}
        variants={LOADING_DOT_VARIANTS}
        animate="animate"
        className="w-1.5 h-1.5 rounded-full bg-primary/30"
      />
    ))}
  </motion.div>
)

/** 工具交互组件 (耦合工具调用与结果) */
const ToolInteraction: React.FC<{
  block: AgentToolCallBlock
  allResults?: Map<string, AgentToolResultBlock>
  isExecuting: boolean
}> = ({ block, allResults, isExecuting }) => {
  const tid = block.id || (block as { toolCallId?: string }).toolCallId
  const result = tid ? allResults?.get(tid) : undefined

  const resultText = useMemo(() => {
    if (!result?.content) return undefined

    let text = ''
    if (Array.isArray(result.content)) {
      text = result.content
        .map((c: any) => {
          return typeof c === 'string' ? c : (c as { text?: string }).text || JSON.stringify(c)
        })
        .join('\n')
    } else {
      text = String(result.content)
    }

    return text || ' '
  }, [result])

  if (!tid) return null

  return (
    <ToolBlock
      name={block.name}
      input={block.arguments}
      result={resultText}
      status={result ? (result.isError ? 'error' : 'success') : isExecuting ? 'loading' : 'success'}
    />
  )
}

// ============================================================================

interface MessageBubbleProps {
  message: Message
  isTyping?: boolean
  isFinished?: boolean
  status?: ChatStatus
  allToolResults?: Map<string, any>
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isTyping,
  status,
  allToolResults
}) => {
  const { role, content, timestamp, usage, performance } = message
  const isAssistant = role === 'assistant'
  const { t } = useTranslation()
  const [copied, setCopied] = React.useState(false)

  const fullText = useMemo(() => {
    if (!isAssistant) return ''
    return Array.isArray(content)
      ? content
          .filter((b) => b.type === 'text')
          .map((b) => (b as any).text || '')
          .join('\n\n')
      : String(content)
  }, [content, isAssistant])

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ===========================================
  // 3. Assistant Message (Unified Bubble)
  // ===========================================
  if (isAssistant) {
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }]

    return (
      <div className="group/message flex flex-col w-full items-start gap-4">
        <motion.div
          initial="initial"
          animate="animate"
          variants={MESSAGE_BLOCK_VARIANTS}
          className="group relative w-full max-w-[95%] md:max-w-[90%] rounded-[12px] px-6 py-5 bg-secondary/40 text-foreground border border-secondary/20 backdrop-blur-md shadow-sm"
        >
          <div className="flex flex-col gap-2">
            {blocks.map((block, i) => {
              let element: React.ReactNode = null
              switch (block.type) {
                case 'text':
                  element = (
                    <div className="prose-container">
                      <MarkdownRenderer content={block.text} />
                    </div>
                  )
                  break
                case 'thinking':
                  element = (
                    <ThinkingBlock
                      text={block.thinking}
                      isThinking={isTyping && i === blocks.length - 1}
                    />
                  )
                  break
                case 'toolCall':
                  element = (
                    <ToolInteraction
                      block={block}
                      allResults={allToolResults}
                      isExecuting={status === 'toolExecuting'}
                    />
                  )
                  break
              }

              return (
                <motion.div key={i} variants={MESSAGE_BLOCK_VARIANTS}>
                  {element}
                </motion.div>
              )
            })}
            
            {/* 加载指示器：当 AI 正在处理时在气泡底部显示 */}
            {isTyping && <BubbleLoadingIndicator />}
          </div>

          <div className="absolute top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background transition-colors text-muted-foreground"
              title={t('common.copy')}
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </motion.div>

        {/* Meta Information - Only show when finished to avoid jitter during growth */}
        {!isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-2 mt-[-2px] text-muted-foreground/30"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-tight">
              <span>
                {typeof timestamp === 'number'
                  ? new Date(timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : timestamp}
              </span>
            </div>
            <UsageStats usage={usage} performance={performance} />
          </motion.div>
        )}
      </div>
    )
  }

  // 如果是 User，依然保持气泡设计
  const userText = Array.isArray(content)
    ? content.map((c) => (c as any).text || '').join('\n')
    : String(content)

  return (
    <div className="flex flex-col gap-2 w-full items-end">
      <motion.div
        layout
        initial="initial"
        animate="animate"
        variants={MESSAGE_BLOCK_VARIANTS}
        className="group relative max-w-[90%] md:max-w-[85%] rounded-[12px] px-6 py-5 bg-orange-50 dark:bg-orange-500/10 border border-orange-200/50 dark:border-orange-500/20 text-orange-900 dark:text-orange-100 shadow-sm backdrop-blur-sm"
      >
        <MarkdownRenderer content={userText} />
      </motion.div>
      <div className="flex items-center gap-3 px-2 mt-1 text-muted-foreground/40">
        <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-tight">
          <span>
            {typeof timestamp === 'number'
              ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : timestamp}
          </span>
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
