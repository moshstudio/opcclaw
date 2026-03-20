import React, { useMemo } from 'react'
import { Smile, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import { useAutoScroll } from '@renderer/hooks/useAutoScroll'
import { Message, ContentBlock, ChatStatus } from '@shared/types/agent'
import MessageBubble from './MessageBubble'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isTyping: boolean
  chatStatus: ChatStatus
}

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading, isTyping, chatStatus }) => {
  const { t } = useTranslation()

  // 使用智能滚动 Hook
  const { scrollContainerRef, isAtBottom, scrollToBottom } = useAutoScroll(messages, {
    offset: 200,
    behavior: 'smooth'
  })

  // 1. 先建立全局工具结果映射
  const allToolResults = useMemo(() => {
    const results = new Map()
    messages.forEach((msg) => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach((block) => {
          if (block.type === 'tool_result' && block.tool_use_id) {
            results.set(block.tool_use_id, block)
          }
        })
      }
    })
    return results
  }, [messages])

  // 2. 聚合消息：具有相同 runId 的连续 Assistant/User 消息合并为一个气泡
  const groupedMessages = useMemo(() => {
    const grouped: Message[] = []
    messages.forEach((msg) => {
      const last = grouped[grouped.length - 1]

      // 判定逻辑：
      // 1. 必须是同一个 runId
      // 2. 只有当 msg 是工具结果或辅助信息时，才合并到上一个 assistant 消息中
      const isSystemGeneratedUserMessage =
        msg.role === 'user' &&
        Array.isArray(msg.content) &&
        msg.content.every((block) => block.type === 'tool_result' || block.type === 'subagent')

      if (
        last &&
        msg.runId &&
        last.runId === msg.runId &&
        last.role === 'assistant' &&
        (msg.role === 'assistant' || isSystemGeneratedUserMessage)
      ) {
        // 合并内容
        const currentBlocks: ContentBlock[] = Array.isArray(last.content)
          ? [...last.content]
          : [{ type: 'text', text: last.content as string }]

        if (Array.isArray(msg.content)) {
          currentBlocks.push(...msg.content)
        } else if (msg.content) {
          currentBlocks.push({ type: 'text', text: msg.content as string })
        }
        last.content = currentBlocks
        // 保留最新的统计数据
        if (msg.usage) last.usage = msg.usage
        if (msg.performance) last.performance = msg.performance
      } else {
        // 深拷贝以防修改原数据，并作为新气泡
        grouped.push({
          ...msg,
          content: Array.isArray(msg.content)
            ? [...msg.content]
            : msg.content
              ? [{ type: 'text', text: msg.content as string }]
              : []
        })
      }
    })
    return grouped
  }, [messages])

  return (
    <div className="flex-1 min-h-0 relative group/list">
      <ScrollArea className="h-full w-full" viewportRef={scrollContainerRef}>
        <div className="max-w-5xl mx-auto w-full px-3 py-6 md:px-4 md:py-8 space-y-10 text-left min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse font-bold uppercase tracking-widest">
                {t('common.loading_history')}
              </p>
            </div>
          ) : groupedMessages.length === 0 ? (
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
              {groupedMessages.map((msg, idx) => {
                const isLastMessage = idx === groupedMessages.length - 1
                const isAIActive = isTyping && isLastMessage && msg.role === 'assistant'
                const isFinished = !isTyping && isLastMessage && msg.role === 'assistant'

                return (
                  <MessageBubble
                    key={msg.id || idx}
                    message={msg}
                    allToolResults={allToolResults}
                    isTyping={isAIActive}
                    isFinished={isFinished}
                    status={isLastMessage ? chatStatus : 'idle'}
                  />
                )
              })}

              {/* 如果正在输入，但最后一条不是 AI 消息（即正在等待 AI 响应），追加一个带 loading 的临时气泡 */}
              {isTyping && groupedMessages[groupedMessages.length - 1]?.role !== 'assistant' && (
                <MessageBubble
                  key="typing-placeholder"
                  message={{
                    id: 'typing-placeholder',
                    role: 'assistant',
                    content: [], // 新版逻辑使用空数组作为初始状态
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }}
                  isTyping={true}
                  status={chatStatus}
                />
              )}

              <div className="h-12 w-full shrink-0" />
            </>
          )}
        </div>
      </ScrollArea>

      {/* 悬浮的滚动到底部按钮 */}
      {!isAtBottom && groupedMessages.length > 0 && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-6 right-6 rounded-full shadow-lg bg-background/80 backdrop-blur hover:bg-background border-primary/20 hover:border-primary/50 text-primary transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
          onClick={() => scrollToBottom('smooth')}
        >
          <ArrowDown className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

export default MessageList
