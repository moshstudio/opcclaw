import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getGatewayClient } from '../services/gateway-client'
import { useAgentStore } from './useAgentStore'
import { Message, ChatStatus } from '@shared/types/agent'
import { applyChatEvent } from './chat-handler'

interface ChatState {
  sessions: Record<string, Message[]> // Key: sessionKey
  chatStatuses: Record<string, ChatStatus> // Key: sessionKey
  errorMessages: Record<string, string | null> // Key: sessionKey
  isLoadingHistory: Record<string, boolean> // Key: sessionKey
  sessionKeys: Record<string, string> // agentId -> activeSessionKey
  allSessions: Record<string, string[]> // agentId -> keys[]
  isLoadingSessions: Record<string, boolean> // agentId -> state
  initialized: boolean

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
      initialized: false,

      getVisibleMessages: () => {
        const id = useAgentStore.getState().activeAgentId
        if (!id) return []
        const sk = get().sessionKeys[id]
        return sk ? get().sessions[sk] || [] : []
      },

      init: () => {
        if (get().initialized) return
        set({ initialized: true })

        const client = getGatewayClient()

        const handleGatewayEvent = (payload: any, eventType: 'chat' | 'agent') => {
          const { agentId, sessionKey } = payload || {}
          if (!agentId || !sessionKey) return

          set((s) => {
            const currentPatch = {
              messages: [...(s.sessions[sessionKey] || [])],
              status: s.chatStatuses[sessionKey] || 'idle',
              errorMessage: s.errorMessages[sessionKey]
            }

            const nextPatch = applyChatEvent(eventType, payload, currentPatch)

            // 状态后置处理逻辑 (例如自动恢复到 idle)
            if (payload.type === 'agent_end' || payload.type === 'agent_error') {
              setTimeout(
                () => {
                  updateState(set, 'chatStatuses', sessionKey, 'idle')
                },
                payload.type === 'agent_end' ? 800 : 1500
              )
            }

            return {
              sessions: { ...s.sessions, [sessionKey]: nextPatch.messages },
              chatStatuses: { ...s.chatStatuses, [sessionKey]: nextPatch.status },
              errorMessages: { ...s.errorMessages, [sessionKey]: nextPatch.errorMessage }
            }
          })
        }

        client.onChat((p) => handleGatewayEvent(p, 'chat'))
        client.onAgent((p) => handleGatewayEvent(p, 'agent'))
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
          setTimeout(() => updateState(set, 'chatStatuses', sk, 'idle'), 3000)
        }
      },

      newSession: async (agentId: string) => {
        const currentSk = get().sessionKeys[agentId]
        const currentMsgs = currentSk ? get().sessions[currentSk] || [] : []
        if (!currentMsgs.length) return

        try {
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
