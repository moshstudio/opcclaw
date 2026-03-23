import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useAutoScroll } from '@renderer/hooks/useAutoScroll'
import { Message, ChatStatus } from '@shared/types/agent'
import MessageBubble from './MessageBubble'
import { MESSAGE_LIST_VARIANTS } from './ChatAnimations'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isTyping: boolean
  chatStatus: ChatStatus
}

const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, chatStatus }) => {
  const { scrollContainerRef } = useAutoScroll(messages, { offset: 200, behavior: 'smooth' })

  // 1. 结果映射收集 (从独立的消息中提取)
  const allToolResults = useMemo(() => {
    const results = new Map<string, any>()

    messages.forEach((m) => {
      if (m.role === 'toolResult') {
        const tr = m as any
        if (tr.toolCallId) {
          results.set(tr.toolCallId, tr)
        }
      }
    })
    return results
  }, [messages])

  // 2. 消息处理逻辑：对消息进行预处理和聚合
  const groupedMessages = useMemo(() => {
    return messages.reduce<Message[]>((acc, m) => {
      // 1. toolResult 消息不独立展示，而是作为工具调用块的结果引用
      if (m.role === 'toolResult') return acc

      const last = acc[acc.length - 1]

      // 2. 核心聚合逻辑：将具有相同 runId 的连续 assistant 消息聚合为一个气泡。
      const shouldMerge =
        last?.role === 'assistant' &&
        m.role === 'assistant' &&
        (last.runId === m.runId || (!last.runId && !m.runId))

      if (shouldMerge) {
        // 更新最后一条消息的内容
        acc[acc.length - 1] = {
          ...last,
          content: [...last.content, ...m.content],
          usage: m.usage || last.usage,
          performance: m.performance || last.performance,
          id: m.id || last.id // 保持 ID 最新以触发流式更新
        }
      } else {
        acc.push(m)
      }
      return acc
    }, [])
  }, [messages])

  // 3. 确定是否需要显示占位 AI 气泡 (当 AI 正在处理但最后一条不是 AI 消息)
  const showPendingBubble = useMemo(() => {
    const lastMsg = groupedMessages[groupedMessages.length - 1]
    return isTyping && (!lastMsg || lastMsg.role !== 'assistant')
  }, [groupedMessages, isTyping])

  return (
    <div className="flex-1 min-h-0 relative bg-background/30">
      <ScrollArea className="h-full w-full" viewportRef={scrollContainerRef}>
        <div className="max-w-4xl mx-auto w-full px-4 py-10 space-y-10">
          <AnimatePresence initial={false} mode="popLayout">
            {groupedMessages.map((msg, i) => (
              <motion.div
                key={msg.id || i}
                layout="position"
                variants={MESSAGE_LIST_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full flex"
              >
                <MessageBubble
                  message={msg}
                  allToolResults={allToolResults}
                  isTyping={isTyping && i === groupedMessages.length - 1}
                  status={chatStatus}
                />
              </motion.div>
            ))}

            {showPendingBubble && (
              <motion.div
                key="pending-ghost"
                layout="position"
                variants={MESSAGE_LIST_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full flex"
              >
                <MessageBubble
                  message={
                    {
                      id: 'pending-ghost',
                      role: 'assistant',
                      content: [],
                      timestamp: 0
                    } as unknown as Message
                  }
                  isTyping={true}
                  status={chatStatus}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  )
}

export default MessageList
