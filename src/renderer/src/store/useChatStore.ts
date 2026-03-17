import { create } from 'zustand'
import { getGatewayClient } from '../services/gateway-client'
import { useAgentStore } from './useAgentStore'

import { Message, ContentBlock } from '@shared/types/agent'
export type { Message, ContentBlock }

interface ChatState {
  // 按照 agentId 隔离的消息列表
  sessions: Record<string, Message[]>
  // 按照 agentId 隔离的输入中状态
  typingStates: Record<string, boolean>
  // 按照 agentId 隔离的历史记录加载状态
  isLoadingHistory: Record<string, boolean>
  // 按照 agentId 隔离的当前 Session Key (由前端生成或切换，默认 'main')
  sessionKeys: Record<string, string>

  // 初始化系统全局监听
  init: () => void
  // 发送消息
  sendMessage: (text: string) => Promise<void>
  // 显式拉取某个 Agent 的历史记录
  fetchHistory: (agentId: string) => Promise<void>
  // 获取当前可见的消息列表
  getVisibleMessages: () => Message[]
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  typingStates: {},
  isLoadingHistory: {},
  sessionKeys: {},

  getVisibleMessages: () => {
    const activeAgentId = useAgentStore.getState().activeAgentId
    if (!activeAgentId) return []
    return get().sessions[activeAgentId] || []
  },

  init: () => {
    // 监听网关事件：全局单例网关客户端，无论当前看哪个 Agent，都要接收并处理数据
    const client = getGatewayClient((evt) => {
      if (evt.event === 'chat') {
        const p = evt.payload as any
        const { agentId, state, text, runId, error } = p

        if (!agentId) return

        set((s) => {
          const currentSessions = { ...s.sessions }
          const currentTyping = { ...s.typingStates }

          if (!currentSessions[agentId]) currentSessions[agentId] = []

          const messages = [...currentSessions[agentId]]
          // 尝试查找同一个 runId 的现有消息 (支持并发输出隔离)
          const foundIdx = messages.findIndex((m) => m.id === runId && m.role === 'assistant')

          // 情况 1: 流式输出 delta
          if (state === 'delta') {
            currentTyping[agentId] = true
            if (foundIdx !== -1) {
              const msg = messages[foundIdx]
              if (typeof msg.content === 'string') {
                messages[foundIdx] = {
                  ...msg,
                  content: msg.content + (text || '')
                }
              } else if (Array.isArray(msg.content)) {
                // 如果是复杂内容块，找到最后一个文本块追加
                const blocks = [...msg.content]
                const lastBlock = blocks[blocks.length - 1]
                if (lastBlock && lastBlock.type === 'text') {
                  blocks[blocks.length - 1] = {
                    ...lastBlock,
                    text: (lastBlock.text || '') + (text || '')
                  }
                } else {
                  blocks.push({ type: 'text', text: text || '' })
                }
                messages[foundIdx] = { ...msg, content: blocks }
              }
            } else {
              // 占位
              messages.push({
                id: runId || `tmp-${Date.now()}`,
                role: 'assistant',
                content: text || '',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              })
            }
          }

          // 情况 2: 完成 final
          if (state === 'final') {
            currentTyping[agentId] = false
            if (foundIdx !== -1) {
              // 覆盖为最终完整文本（如果有）
              if (text) messages[foundIdx] = { ...messages[foundIdx], content: text }
            } else if (text) {
              // 如果没经历 delta 过程，直接插入
              messages.push({
                id: runId || `final-${Date.now()}`,
                role: 'assistant',
                content: text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              })
            }
          }

          // 情况 3: 报错 error
          if (state === 'error') {
            currentTyping[agentId] = false
            messages.push({
              id: `err-${Date.now()}`,
              role: 'system',
              content: `Error: ${error || 'Unknown error'}`,
              timestamp: new Date().toLocaleTimeString()
            })
          }

          return {
            sessions: { ...currentSessions, [agentId]: messages },
            typingStates: currentTyping
          }
        })
      }
    })
  },

  fetchHistory: async (agentId: string) => {
    console.log('fetch history', agentId)

    // 如果已经有缓存了，就不重复拉取（商用级缓存策略）
    if (get().sessions[agentId]?.length > 0) return

    set((s) => ({
      isLoadingHistory: { ...s.isLoadingHistory, [agentId]: true }
    }))

    try {
      const client = getGatewayClient()
      const sessionKey = get().sessionKeys[agentId] || 'main'
      const res = (await client.request('chat.history', {
        agentId,
        sessionKey
      })) as { messages: any[] }
      console.log('history res', res)

      if (res && res.messages) {
        // 转换后端消息格式到前端 Message 格式
        const mappedMessages: Message[] = res.messages.map((m) => ({
          id: m.id || Math.random().toString(),
          role: m.role,
          content: m.content || m.text || '',
          timestamp: m.timestamp
            ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''
        }))

        set((s) => ({
          sessions: { ...s.sessions, [agentId]: mappedMessages }
        }))
      }
    } catch (err) {
      console.error(`[ChatStore] Failed to fetch history for ${agentId}:`, err)
    } finally {
      set((s) => ({
        isLoadingHistory: { ...s.isLoadingHistory, [agentId]: false }
      }))
    }
  },

  sendMessage: async (text: string) => {
    const activeAgentId = useAgentStore.getState().activeAgentId
    if (!activeAgentId) return

    const client = getGatewayClient()

    // 1. 本地立即追加用户消息 (Optimistic Update)
    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    set((s) => {
      const prevMsgs = s.sessions[activeAgentId] || []
      return {
        sessions: {
          ...s.sessions,
          [activeAgentId]: [...prevMsgs, userMsg]
        },
        typingStates: {
          ...s.typingStates,
          [activeAgentId]: true
        }
      }
    })

    // 2. 发送请求给后端
    try {
      const sessionKey = get().sessionKeys[activeAgentId] || 'main'
      const res = await client.request('chat.send', {
        agentId: activeAgentId,
        message: text,
        sessionKey
      })

      if (!res) {
        console.error('[ChatStore] Send returned empty response')
        throw new Error('Failed to send: empty response')
      }
    } catch (err) {
      console.error('[ChatStore] Send Error:', err)
      // 可以在此处给用户发送一个系统错误消息
      set((s) => ({
        typingStates: { ...s.typingStates, [activeAgentId]: false },
        sessions: {
          ...s.sessions,
          [activeAgentId]: [
            ...(s.sessions[activeAgentId] || []),
            {
              id: `err-${Date.now()}`,
              role: 'system',
              content: `发送失败: ${err instanceof Error ? err.message : String(err)}`,
              timestamp: new Date().toLocaleTimeString()
            }
          ]
        }
      }))
    }
  }
}))
