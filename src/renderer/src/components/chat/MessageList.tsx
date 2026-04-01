import React, { useMemo, useCallback, useRef, useEffect } from 'react'
import { Bubble, Actions } from '@ant-design/x'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import {
  Message,
  ChatStatus,
  ToolResultMessage,
  ContentBlock,
  AgentTextBlock
} from '@shared/types/agent'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import type { GetRef } from 'antd'
import MessageBubble from './MessageBubble'
import UsageStats from './parts/UsageStats'
import type { BubbleItemType } from '@ant-design/x'

// ============================================================================
// 1. Helpers
// ============================================================================

/** 格式化消息时间 */
const formatTime = (ts: number | string) => {
  if (typeof ts === 'string') return ts
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface MessageListProps {
  messages: Message[]
  isTyping: boolean
  isLoading: boolean
  chatStatus: ChatStatus
}

// ============================================================================
// 2. Main List Component
// ============================================================================

const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, isLoading, chatStatus }) => {
  console.log(messages)
  console.log(isTyping)

  const { t } = useTranslation()
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const { activeAgentId } = useAgentStore()
  const { sessionKeys, hasMoreMap, isLoadingHistory, fetchHistory } = useChatStore()
  const activeSessionKey = activeAgentId ? sessionKeys[activeAgentId] : null

  /** 1. 预处理数据: 提取工具结果并合并 Assistant 消息 */
  const { mergedMessages, toolResults } = useMemo(() => {
    const resultsMap = new Map<string, ToolResultMessage>()
    const merged: Message[] = []

    messages.forEach((m) => {
      // 记录工具结果以供 Bubble 内联展示
      if (m.role === 'toolResult' && m.toolCallId) {
        resultsMap.set(m.toolCallId, m)
        return
      }

      // 准备渲染内容
      const content = Array.isArray(m.content)
        ? [...m.content]
        : ([{ type: 'text', text: String(m.content) }] as ContentBlock[])

      const last = merged[merged.length - 1]
      // 连续助手消息合并策略
      if (m.role === 'assistant' && last?.role === 'assistant') {
        last.content = [...last.content, ...content]
        if (m.usage) last.usage = m.usage
        if (m.performance) last.performance = m.performance
      } else {
        merged.push({ ...m, content })
      }
    })

    // 如果正在连接且最后一条不是助手消息，注入一个占位助手消息以展示 Loading 气泡
    const isPending =
      isTyping &&
      (chatStatus === 'waiting' || chatStatus === 'thinking' || chatStatus === 'retrying')
    const lastMessage = merged[merged.length - 1]

    if (isPending && lastMessage?.role !== 'assistant') {
      merged.push({
        id: 'pending',
        role: 'assistant',
        content: [],
        timestamp: lastMessage?.timestamp || 0
      } as any)
    }

    return { mergedMessages: merged, toolResults: resultsMap }
  }, [messages, isTyping, chatStatus])

  /** 2. 复制逻辑封装 */
  const handleCopy = useCallback((m: Message) => {
    let fullText = ''
    if (typeof m.content === 'string') {
      fullText = m.content
    } else if (Array.isArray(m.content)) {
      fullText = m.content
        .filter((b): b is AgentTextBlock => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n\n')
    }

    if (fullText) {
      navigator.clipboard.writeText(fullText)
      setCopiedId(m.id || null)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }, [])

  /** 3. 构造基础列表项 (BubbleItemType) */
  const baseItems = useMemo<BubbleItemType[]>(() => {
    return mergedMessages.map((m) => {
      const isAi = m.role === 'assistant'
      const isLastAi =
        isAi &&
        mergedMessages.indexOf(m) === mergedMessages.map((msg) => msg.role).lastIndexOf('assistant')

      return {
        key: m.id || `${m.role}-${m.timestamp}`,
        role: isAi ? 'ai' : 'user',
        content: m.id || ' ', // 占位符，实际渲染由 contentRender 接管
        footer: (
          <div className="flex items-center gap-3 px-6 mt-0 max-w-4xl mx-auto w-full">
            <div
              className={`flex-1 flex items-center gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}
            >
              {isAi ? (
                <>
                  <span className="text-[10px] text-muted-foreground/30 font-medium leading-none flex items-center h-4">
                    {formatTime(m.timestamp)}
                  </span>
                  <UsageStats usage={m.usage} performance={m.performance} />
                  <Actions
                    items={[
                      {
                        key: 'copy',
                        icon:
                          copiedId === m.id ? (
                            <CheckOutlined style={{ fontSize: 10 }} className="text-green-500/60" />
                          ) : (
                            <CopyOutlined
                              style={{ fontSize: 10 }}
                              className="text-muted-foreground/40"
                            />
                          ),
                        label: copiedId === m.id ? t('common.copied') : t('common.copy'),
                        onItemClick: () => handleCopy(m)
                      }
                    ]}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted-foreground/30 text-[9px] font-bold uppercase tracking-tight flex items-center h-4"
                  />
                </>
              ) : (
                <>
                  <Actions
                    items={[
                      {
                        key: 'copy',
                        icon:
                          copiedId === m.id ? (
                            <CheckOutlined style={{ fontSize: 10 }} className="text-green-500/60" />
                          ) : (
                            <CopyOutlined
                              style={{ fontSize: 10 }}
                              className="text-muted-foreground/40"
                            />
                          ),
                        label: copiedId === m.id ? t('common.copied') : t('common.copy'),
                        onItemClick: () => handleCopy(m)
                      }
                    ]}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted-foreground/30 text-[9px] font-bold uppercase tracking-tight flex items-center h-4"
                  />
                  <span className="text-[10px] text-muted-foreground/30 font-medium leading-none flex items-center h-4">
                    {formatTime(m.timestamp)}
                  </span>
                </>
              )}
            </div>
          </div>
        ),
        contentRender: () => (
          <MessageBubble
            message={m}
            allToolResults={toolResults}
            isTyping={isLastAi && isTyping}
            status={isLastAi ? chatStatus : undefined}
          />
        )
      }
    })
  }, [mergedMessages, toolResults, copiedId, isTyping, chatStatus, t, handleCopy])

  /** 4. 状态修补: 处理 Pending 及错误状态 */
  const displayItems = useMemo<BubbleItemType[]>(() => {
    const results = [...baseItems]

    // 处理全局出错
    if (!isTyping && chatStatus === 'error' && results.length > 0) {
      const lastAiIdx = results.map((r) => r.role).lastIndexOf('ai')
      if (lastAiIdx !== -1) results[lastAiIdx].status = 'error'
    }

    return results
  }, [baseItems, isTyping, chatStatus])

  /** 5. 自动滚动到底部逻辑 */
  const listRef = useRef<GetRef<typeof Bubble.List>>(null)

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    // 仅在用户发送消息时强制滚动到底部
    if (lastMessage?.role !== 'user') return

    const rafId = requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 'bottom', behavior: 'smooth' })
    })

    return () => cancelAnimationFrame(rafId)
  }, [messages])

  /** 6. 渲染配置及回调 */
  const roles = useMemo(
    () => ({
      ai: {
        placement: 'start' as const,
        variant: 'borderless' as const,
        style: { maxWidth: '100%', width: '100%' },
        className: 'group',
        footerPlacement: 'outer-start' as const
      },
      user: {
        placement: 'end' as const,
        variant: 'borderless' as const,
        style: { maxWidth: '100%' },
        className: 'group',
        footerPlacement: 'outer-end' as const
      }
    }),
    []
  )

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop } = e.currentTarget
      if (
        scrollTop < 50 &&
        activeAgentId &&
        activeSessionKey &&
        hasMoreMap[activeSessionKey] &&
        !isLoadingHistory[activeSessionKey]
      ) {
        fetchHistory(activeAgentId, activeSessionKey, 'more')
      }
    },
    [activeAgentId, activeSessionKey, hasMoreMap, isLoadingHistory, fetchHistory]
  )

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-transparent relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background/5 pointer-events-none" />

      {isLoading && (
        <div className="relative z-10 flex items-center justify-center py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 gap-2 shrink-0 animate-in fade-in duration-700">
          <Loader2 className="w-3 h-3 animate-spin text-primary/50" />
          <span>{t('common.loading_history')}</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative z-0">
        <Bubble.List
          items={displayItems}
          role={roles}
          autoScroll={true}
          ref={listRef}
          onScroll={handleScroll}
          className="p-0 w-full h-full scroll-smooth custom-scrollbar"
        />
      </div>
    </div>
  )
}

export default React.memo(MessageList)
