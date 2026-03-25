import React, { useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { Message, ChatStatus, ToolResultMessage } from '@shared/types/agent'
import MessageBubble from './MessageBubble'
import { Loader2 } from 'lucide-react'

const MessageList: React.FC<{ messages: Message[]; isTyping: boolean; chatStatus: ChatStatus }> = ({
  messages,
  isTyping,
  chatStatus
}) => {
  const { activeAgentId } = useAgentStore()
  const { sessionKeys, hasMoreMap, isLoadingHistory, fetchHistory } = useChatStore()
  const activeSessionKey = activeAgentId ? sessionKeys[activeAgentId] : null

  // 1. 业务逻辑：聚合工具结果并构造渲染数据
  const { data, allToolResults } = useMemo(() => {
    const toolResults = new Map(
      messages
        .filter((m): m is ToolResultMessage => m.role === 'toolResult')
        .map((m) => [m.toolCallId!, m])
    )

    const list = messages.reduce<Message[]>((acc, m) => {
      if (m.role === 'toolResult') return acc
      const last = acc[acc.length - 1]
      // 聚合连续的 Assistant 消息
      const shouldMerge =
        last?.role === 'assistant' && m.role === 'assistant' && last.runId === m.runId

      if (shouldMerge) {
        acc[acc.length - 1] = {
          ...last,
          content: [...last.content, ...m.content],
          id: m.id || last.id
        }
      } else {
        acc.push(m)
      }
      return acc
    }, [])

    // 插入加载状态占位
    if (isTyping && list[list.length - 1]?.role !== 'assistant') {
      list.push({ id: 'pending', role: 'assistant', content: [], timestamp: 0 } as any)
    }

    return { data: list, allToolResults: toolResults }
  }, [messages, isTyping])

  // 2. 虚拟列表核心配置与状态
  const virtuosoRef = React.useRef<any>(null)
  const [firstItemIndex, setFirstItemIndex] = React.useState(10000)
  const lastDataLength = React.useRef(data.length)
  const lastFirstId = React.useRef<string | number | undefined>(data[0]?.id)
  const atBottomThreshold = 150

  // 3. 计算强制滚动触发器：当用户发送新消息时，无视当前滚动位置，强制跳转到底部
  const forceScrollTrigger = useMemo(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'user') {
      return lastMsg.id || lastMsg.timestamp
    }
    return undefined
  }, [messages])

  // 4. 处理历史记录加载：通过调整索引保持位置稳定
  React.useEffect(() => {
    const currentLength = data.length
    const currentFirstId = data[0]?.id
    const prevLength = lastDataLength.current
    const prevFirstId = lastFirstId.current

    // 检测是否是历史加载 (特征：长度增加且第一个 ID 变化)
    const isHistoryLoad =
      prevLength > 0 &&
      currentLength > prevLength &&
      currentFirstId !== prevFirstId &&
      currentFirstId !== undefined &&
      prevFirstId !== undefined

    if (isHistoryLoad) {
      const diff = currentLength - prevLength
      setFirstItemIndex((prev) => prev - diff)
    }

    lastDataLength.current = currentLength
    lastFirstId.current = currentFirstId
  }, [data])

  // 4. 处理强制跳转：用户发送新消息时无视位置，强制到底
  React.useEffect(() => {
    if (forceScrollTrigger !== undefined && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: firstItemIndex + data.length - 1,
        align: 'end',
        behavior: 'auto'
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceScrollTrigger])

  return (
    <div className="flex-1 relative bg-background/30 overflow-hidden">
      <Virtuoso
        ref={virtuosoRef}
        data={data}
        firstItemIndex={firstItemIndex}
        // 关键：开启底对齐模式。当列表短于容器时，项会位于视口底部
        alignToBottom
        // 初始位置：新打开会话时定位到底部
        initialTopMostItemIndex={data.length > 0 ? firstItemIndex + data.length - 1 : 10000}
        atBottomThreshold={atBottomThreshold}
        // 完全利用内置逻辑：如果已经在底部，则新内容加入时自动跟随。
        // 不再需要外部状态干预，避免抖动。
        followOutput="auto"
        increaseViewportBy={500}
        startReached={() => {
          if (
            activeAgentId &&
            activeSessionKey &&
            hasMoreMap[activeSessionKey] &&
            !isLoadingHistory[activeSessionKey]
          ) {
            fetchHistory(activeAgentId, activeSessionKey, 'more')
          }
        }}
        components={{
          Header: () => (
            <div className="flex justify-center py-4">
              {activeSessionKey && isLoadingHistory[activeSessionKey] && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>加载中...</span>
                </div>
              )}
            </div>
          ),
          Footer: () => <div className="h-10" />
        }}
        itemContent={(index, msg) => (
          <div className="max-w-4xl mx-auto w-full px-4 mb-8 overflow-hidden">
            <MessageBubble
              message={msg}
              allToolResults={allToolResults}
              isTyping={isTyping && index === firstItemIndex + data.length - 1}
              status={chatStatus}
            />
          </div>
        )}
      />
    </div>
  )
}

export default MessageList
