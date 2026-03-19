import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getGatewayClient } from '../services/gateway-client'
import { useAgentStore } from './useAgentStore'
import { Message, ChatStatus } from '@shared/types/agent'
import { handleChatEvent, handleAgentEvent } from './chat-handler'

interface ChatState {
  sessions: Record<string, Message[]> // Key: sessionKey
  chatStatuses: Record<string, ChatStatus> // Key: sessionKey
  errorMessages: Record<string, string | null> // Key: sessionKey
  isLoadingHistory: Record<string, boolean> // Key: sessionKey
  sessionKeys: Record<string, string> // agentId -> activeSessionKey
  allSessions: Record<string, string[]> // agentId -> keys[]
  isLoadingSessions: Record<string, boolean> // agentId -> state

  init: () => void
  sendMessage: (text: string) => Promise<void>
  fetchHistory: (agentId: string) => Promise<void>
  getVisibleMessages: () => Message[]
  newSession: (agentId: string) => Promise<void>
  switchSession: (agentId: string, sessionKey: string) => Promise<void>
  fetchSessions: (agentId: string) => Promise<void>
  resetSession: (agentId: string) => Promise<void>
  deleteSession: (agentId: string, sessionKey: string) => Promise<void>
  abortMessage: (agentId: string, sessionKey: string) => Promise<void>
}

// 辅助函数：统一处理相关的状态更新
const updateState = (set: any, key: keyof ChatState, id: string, value: any) => {
  set((s: any) => ({ [key]: { ...s[key], [id]: value } }))
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},
      chatStatuses: {},
      errorMessages: {},
      isLoadingHistory: {},
      sessionKeys: {},
      allSessions: {},
      isLoadingSessions: {},

      getVisibleMessages: () => {
        const id = useAgentStore.getState().activeAgentId
        if (!id) return []
        const sk = get().sessionKeys[id]
        return sk ? get().sessions[sk] || [] : []
      },

      init: () => {
        const resetStatus = (sessionKey: string, delay: number) => {
          setTimeout(() => {
            set((inner) => ({
              chatStatuses: { ...inner.chatStatuses, [sessionKey]: 'idle' }
            }))
          }, delay)
        }

        getGatewayClient((evt) => {
          const { agentId, sessionKey } = (evt.payload as any) || {}
          if (!agentId || !sessionKey) return

          if (evt.event === 'chat' || evt.event === 'agent') {
            const payload = evt.payload as any
            set((s) => {
              const messages = [...(s.sessions[sessionKey] || [])]
              let newStatus: ChatStatus = s.chatStatuses[sessionKey] || 'idle'
              let errorMsg: string | undefined

              if (evt.event === 'chat') {
                const res = handleChatEvent(payload, messages)
                newStatus = res.status
                if (res.errorMessage) errorMsg = res.errorMessage
              } else {
                const res = handleAgentEvent(payload, messages, newStatus)
                newStatus = res.status
                if (res.errorMessage) errorMsg = res.errorMessage

                if (payload.type === 'agent_end' || payload.type === 'agent_error') {
                  resetStatus(sessionKey, payload.type === 'agent_end' ? 800 : 1500)
                }
              }

              // 清除错误信息如果状态恢复正常
              if (
                newStatus === 'idle' ||
                newStatus === 'streaming' ||
                newStatus === 'thinking' ||
                newStatus === 'tool_executing'
              ) {
                errorMsg = null as any
              }

              return {
                sessions: { ...s.sessions, [sessionKey]: messages },
                chatStatuses: { ...s.chatStatuses, [sessionKey]: newStatus },
                ...(errorMsg !== undefined
                  ? { errorMessages: { ...s.errorMessages, [sessionKey]: errorMsg } }
                  : {})
              }
            })
          }
        })
      },

      fetchHistory: async (agentId: string) => {
        const sk = get().sessionKeys[agentId] || 'main'
        if (get().sessions[sk]?.length || get().isLoadingHistory[sk]) return
        updateState(set, 'isLoadingHistory', sk, true)
        try {
          const res = (await getGatewayClient().request('chat.history', {
            agentId,
            sessionKey: sk
          })) as any
          const mapped = (res?.messages || []).map((m: any) => ({
            id: m.id || `temp_history_${Math.random()}`,
            role: m.role,
            content: m.content || m.text || '',
            runId: m.runId,
            timestamp: m.timestamp
              ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''
          }))
          updateState(set, 'sessions', sk, mapped)
        } finally {
          updateState(set, 'isLoadingHistory', sk, false)
        }
      },

      sendMessage: async (text: string) => {
        const agentId = useAgentStore.getState().activeAgentId
        if (!agentId) return
        const sk = get().sessionKeys[agentId] || 'main'

        set((s) => ({
          chatStatuses: { ...s.chatStatuses, [sk]: 'waiting' },
          errorMessages: { ...s.errorMessages, [sk]: null }
        }))

        try {
          const res = (await getGatewayClient().request('chat.send', {
            agentId,
            message: text,
            sessionKey: sk
          })) as any
          if (res?.sessionKey && res.sessionKey !== sk) {
            const newSk = res.sessionKey
            set((s) => ({
              sessionKeys: { ...s.sessionKeys, [agentId]: newSk }
            }))
            await get().fetchSessions(agentId)
          }
        } catch (err) {
          updateState(set, 'chatStatuses', sk, 'error')
          updateState(set, 'errorMessages', sk, String(err))

          // 如果出现紧接在 userMessage 之后的网络级错误，可以延迟后让其返回 idle
          setTimeout(() => updateState(set, 'chatStatuses', sk, 'idle'), 3000)
        }
      },

      newSession: async (agentId: string) => {
        const currentSk = get().sessionKeys[agentId]
        const currentMsgs = currentSk ? get().sessions[currentSk] || [] : []
        if (!currentMsgs.length) return

        try {
          // 停止当前会话输出（如果正在输出）
          if (currentSk) {
            await getGatewayClient().request('chat.abort', { agentId, sessionKey: currentSk })
          }

          const res = (await getGatewayClient().request('sessions.create', { agentId })) as any
          const key = res.sessionKey

          set((s) => ({
            sessionKeys: { ...s.sessionKeys, [agentId]: key },
            sessions: { ...s.sessions, [key]: [] }
          }))

          await get().fetchSessions(agentId)
        } catch (err) {
          console.error('Failed to create session:', err)
        }
      },

      switchSession: async (agentId: string, sk: string) => {
        set((s) => ({
          sessionKeys: { ...s.sessionKeys, [agentId]: sk },
          // 确保当前切换的 Key 一定在列表中
          allSessions: {
            ...s.allSessions,
            [agentId]: Array.from(new Set([sk, ...(s.allSessions[agentId] || [])]))
          }
        }))
        get().fetchHistory(agentId)
      },

      fetchSessions: async (agentId: string) => {
        if (get().isLoadingSessions[agentId]) return
        updateState(set, 'isLoadingSessions', agentId, true)
        try {
          const res = (await getGatewayClient().request('sessions.list', { agentId })) as any
          const remoteSessions = (res?.sessions || []).map((s: any) => s.key || s).filter(Boolean)

          set((s) => {
            const currentKey = s.sessionKeys[agentId]
            // 如果本地已有活跃 Key，确保它在列表中；否则取列表第一个
            const combined = Array.from(
              new Set(currentKey ? [currentKey, ...remoteSessions] : remoteSessions)
            )
            return {
              allSessions: { ...s.allSessions, [agentId]: combined },
              sessionKeys: (currentKey
                ? s.sessionKeys
                : { ...s.sessionKeys, [agentId]: combined[0] }) as Record<string, string>
            } as Partial<ChatState>
          })
        } finally {
          updateState(set, 'isLoadingSessions', agentId, false)
        }
      },

      resetSession: async (agentId: string) => {
        const sk = get().sessionKeys[agentId] || 'main'
        try {
          await getGatewayClient().request('sessions.reset', {
            agentId,
            sessionKey: sk
          })
          updateState(set, 'sessions', sk, [])
          get().fetchSessions(agentId)
        } catch (err) {
          console.error('Reset error:', err)
        }
      },
      deleteSession: async (agentId: string, sk: string) => {
        const list = get().allSessions[agentId] || []
        if (list.length <= 1) return

        const idx = list.indexOf(sk)
        const active = get().sessionKeys[agentId] === sk

        await getGatewayClient().request('sessions.delete', { agentId, sessionKey: sk })

        const newList = list.filter((k) => k !== sk)
        updateState(set, 'allSessions', agentId, newList)

        if (active) {
          const next = newList[Math.min(idx, newList.length - 1)]
          set((s) => ({
            sessionKeys: { ...s.sessionKeys, [agentId]: next }
          }))
          get().fetchHistory(agentId)
        }
      },
      abortMessage: async (agentId: string, sk: string) => {
        try {
          await getGatewayClient().request('chat.abort', { agentId, sessionKey: sk })
          updateState(set, 'chatStatuses', sk, 'aborted')
          setTimeout(() => updateState(set, 'chatStatuses', sk, 'idle'), 500)
        } catch (err) {
          console.error('Abort error:', err)
        }
      }
    }),
    {
      name: 'opcclaw-chat',
      partialize: (s) => ({ sessionKeys: s.sessionKeys })
    }
  )
)
