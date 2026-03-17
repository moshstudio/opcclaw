import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Message, ContentBlock } from '@renderer/store/useChatStore'
import { isJson } from '@renderer/lib/chat-utils'
import MarkdownRenderer from './MarkdownRenderer'
import ToolBlock from './ToolBlock'

interface MessageBubbleProps {
  message: Message
  allToolResults?: Map<string, ContentBlock>
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, allToolResults }) => {
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

  // Helper to check if a message only contains tool results
  const isOnlyToolResults =
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((block) => block.type === 'tool_result')

  // If this message only contains tool results, we return null because
  // they should be displayed inside the corresponding tool_use bubbles.
  if (isOnlyToolResults && allToolResults) {
    return null
  }

  const renderContent = () => {
    if (typeof content === 'string') {
      if (isJson(content)) {
        return <MarkdownRenderer content={`\`\`\`json\n${content}\n\`\`\``} />
      }
      return <MarkdownRenderer content={content} />
    }

    // Process ContentBlocks
    const blocks = content
    const renderedBlocks: React.ReactNode[] = []

    // Track which blocks we've already "consumed" by grouping within this message
    const consumedBlockIndices = new Set<number>()

    blocks.forEach((block, idx) => {
      if (consumedBlockIndices.has(idx)) return

      if (block.type === 'text' && block.text) {
        renderedBlocks.push(<MarkdownRenderer key={`text-${idx}`} content={block.text} />)
      } else if (block.type === 'tool_use' && block.id) {
        // Find result: prioritize results in the current message, then search the global map
        let resultBlock = blocks.find((b) => b.type === 'tool_result' && b.tool_use_id === block.id)

        if (!resultBlock && allToolResults) {
          resultBlock = allToolResults.get(block.id)
        }

        // Find the index of the result block if it's in the current message to mark it as consumed
        const resultIdxInCurrentMsg = blocks.findIndex(
          (b) => b.type === 'tool_result' && b.tool_use_id === block.id
        )
        if (resultIdxInCurrentMsg !== -1) {
          consumedBlockIndices.add(resultIdxInCurrentMsg)
        }

        renderedBlocks.push(
          <ToolBlock
            key={`tool-${block.id}`}
            name={block.name || 'Unknown Tool'}
            input={block.input}
            result={resultBlock?.content}
            status={resultBlock ? 'success' : 'loading'}
          />
        )
      } else if (block.type === 'tool_result' && !consumedBlockIndices.has(idx)) {
        // Fallback for tool results without a preceding tool use in the same message (rare but possible)
        renderedBlocks.push(
          <ToolBlock
            key={`result-${idx}`}
            name="Tool Result"
            input={{ note: 'Unmatched tool result' }}
            result={block.content}
          />
        )
      }
    })

    return <div className="space-y-4 w-full min-w-0">{renderedBlocks}</div>
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

        {/* Copy Button for AI messages */}
        {!isUser && !isSystem && (
          <button
            onClick={handleCopy}
            className={cn(
              'absolute top-3 right-3 p-2 rounded-lg transition-all duration-200',
              'opacity-0 group-hover:opacity-100 focus:opacity-100',
              'bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700',
              'text-zinc-500 hover:text-indigo-600 shadow-sm z-10'
            )}
            title="Copy message"
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
