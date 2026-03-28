import { create, StoreApi } from 'zustand'
import { persist } from 'zustand/middleware'
import { getGatewayClient } from '../services/gateway-client'
import { ConfirmService } from '../components/ui/confirm-context'
import { Message, ChatStatus, Agent } from '@shared/types/agent'
import { ChatPayload, AgentEventPayload, NoticePayload, ModelsPayload } from '@shared/types/gateway'
import { mapHistoryMessage, RESET_TIMEOUT } from './gateway/chat-handler'
import { applyGatewayEvent, MinimalChatStore } from './gateway/gateway-reducer'

interface ChatState {
  sessions: Record<string, Message[]> // Key: sessionKey
  chatStatuses: Record<string, ChatStatus> // Key: sessionKey
  errorMessages: Record<string, string | null> // Key: sessionKey
  isLoadingHistory: Record<string, boolean> // Key: sessionKey
  hasMoreMap: Record<string, boolean> // Key: sessionKey
  totalMap: Record<string, number> // Key: sessionKey
  sessionKeys: Record<string, string> // agentId -> activeSessionKey
  allSessions: Record<string, string[]> // agentId -> keys[]
  isLoadingSessions: Record<string, boolean> // agentId -> state
  toolResultsMap: Record<string, Record<string, unknown>> // sessionKey -> { toolCallId -> result }
  interactionMap: Record<string, ChatPayload['interaction'] | null> // sessionKey -> active interaction
  agents: Agent[]
  activeAgentId: string | null
  models: ModelsPayload['models']
  defaultModelId: string | null
  initialized: boolean

  handleChatEvent: (payload: ChatPayload) => void
  handleNoticeEvent: (payload: NoticePayload) => void
  handleAgentEvent: (payload: AgentEventPayload) => void
  handleSessionEvent: (payload: AgentEventPayload) => void
  init: () => void

  sendMessage: (text: string, agentId: string) => Promise<void>
  fetchHistory: (agentId: string, sessionKey?: string, mode?: 'initial' | 'more') => Promise<void>
  newSession: (agentId: string) => Promise<void>
  switchSession: (agentId: string, sessionKey: string) => Promise<void>
  fetchSessions: (agentId: string) => Promise<void>
  resetSession: (agentId: string) => Promise<void>
  deleteSession: (agentId: string, sessionKey: string) => Promise<void>
  abortMessage: (agentId: string, sessionKey: string) => Promise<void>
  respondInteraction: (
    agentId: string,
    sessionKey: string,
    interactionId: string,
    result: boolean
  ) => Promise<void>
}

type SetState = StoreApi<ChatState>['setState']

/** 辅助函数：统一处理相关的状态更新 (强类型版本) */
const updateSubState = <K extends keyof ChatState>(
  set: SetState,
  key: K,
  id: string,
  value: ChatState[K] extends Record<string, infer V> ? V : never
) => {
  set((s) => ({
    [key]: { ...(s[key] as Record<string, unknown>), [id]: value }
  }))
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},
      chatStatuses: {},
      errorMessages: {},
      isLoadingHistory: {},
      hasMoreMap: {},
      totalMap: {},
      sessionKeys: {},
      allSessions: {},
      isLoadingSessions: {},
      toolResultsMap: {},
      interactionMap: {},
      agents: [],
      activeAgentId: null,
      models: [],
      defaultModelId: null,
      initialized: false,

      handleChatEvent: (payload) => {
        const sk = payload.sessionKey
        set((s) => applyGatewayEvent(s as MinimalChatStore, payload, 'chat'))

        // 交互逻辑自动处理
        if (
          payload.state === 'interaction' &&
          payload.interaction &&
          !payload.interaction.isComplete
        ) {
          ConfirmService.confirm({
            title: 'AI 需要你的确认',
            description: payload.interaction.prompt,
            confirmText: payload.interaction.options?.[0],
            cancelText: payload.interaction.options?.[1]
          }).then((res) => {
            const agentId = payload.agentId || sk.split(':')[0] || 'main'
            get().respondInteraction(agentId, sk, payload.interaction!.interactionId, res)
          })
        }

        // 异步状态复位逻辑 (UI 体验优化)
        if (payload.state === 'final' || payload.state === 'error') {
          const timeout = payload.state === 'final' ? RESET_TIMEOUT.SUCCESS : RESET_TIMEOUT.ERROR
          setTimeout(() => {
            if (get().chatStatuses[sk] === (payload.state === 'final' ? 'completed' : 'error')) {
              updateSubState(set, 'chatStatuses', sk, 'idle')
            }
          }, timeout)
        }
      },
      handleNoticeEvent: (payload) => {
        set((s) => applyGatewayEvent(s as MinimalChatStore, payload, 'notice'))
      },
      handleAgentEvent: (payload) => {
        set((s) => applyGatewayEvent(s as MinimalChatStore, payload, 'agent'))
      },
      handleSessionEvent: (payload) => {
        set((s) => applyGatewayEvent(s as MinimalChatStore, payload, 'session'))
      },

      init: () => {
        // Initialization logic if needed
      },

      fetchHistory: async (agentId: string, sk?: string, mode: 'initial' | 'more' = 'initial') => {
        const sessionKey = sk || get().sessionKeys[agentId]
        if (!sessionKey) return
        if (get().isLoadingHistory[sessionKey]) return

        // 缓存策略：如果是初始化且已有内容，除非显式刷新，否则不重取（或改为取增量，此处先做不重复取）
        if (mode === 'initial' && get().sessions[sessionKey]?.length > 0) {
          return
        }

        // 分页参数
        const limit = 30
        const offset = mode === 'more' ? get().sessions[sessionKey]?.length || 0 : 0

        updateSubState(set, 'isLoadingHistory', sessionKey, true)
        try {
          const res = (await getGatewayClient().request('chat:history', {
            agentId,
            sessionKey,
            limit,
            offset
          })) as { messages: any[]; hasMore: boolean; total: number }

          const mapped = (res?.messages || []).map(mapHistoryMessage)

          set((s) => {
            const current = s.sessions[sessionKey] || []
            // 如果是加载更多，则追加到前面
            const newMessages = mode === 'more' ? [...mapped, ...current] : mapped
            return {
              sessions: { ...s.sessions, [sessionKey]: newMessages },
              hasMoreMap: { ...s.hasMoreMap, [sessionKey]: !!res.hasMore },
              totalMap: { ...s.totalMap, [sessionKey]: res.total || 0 }
            }
          })
        } finally {
          updateSubState(set, 'isLoadingHistory', sessionKey, false)
        }
      },

      sendMessage: async (text: string, agentId: string) => {
        const sk = get().sessionKeys[agentId]
        if (!sk) {
          console.warn('No active session for agent:', agentId)
          return
        }

        set((s) => ({
          chatStatuses: { ...s.chatStatuses, [sk]: 'waiting' },
          errorMessages: { ...s.errorMessages, [sk]: null }
        }))

        try {
          const res = (await getGatewayClient().request('chat:send', {
            agentId,
            message: text,
            sessionKey: sk
          })) as { sessionKey?: string }

          if (res?.sessionKey && res.sessionKey !== sk) {
            const newSk = res.sessionKey
            set((s) => ({
              sessionKeys: { ...s.sessionKeys, [agentId]: newSk }
            }))
            await get().fetchSessions(agentId)
          }
        } catch (err) {
          updateSubState(set, 'chatStatuses', sk, 'error')
          updateSubState(set, 'errorMessages', sk, String(err))
          setTimeout(
            () => updateSubState(set, 'chatStatuses', sk, 'idle'),
            RESET_TIMEOUT.SEND_ERROR
          )
        }
      },

      newSession: async (agentId: string) => {
        const currentSk = get().sessionKeys[agentId]
        const currentMsgs = currentSk ? get().sessions[currentSk] || [] : []
        if (currentMsgs.length === 0 && currentSk) return

        try {
          if (currentSk) {
            await getGatewayClient().request('chat:abort', { agentId, sessionKey: currentSk })
          }
          const res = (await getGatewayClient().request('sessions:create', {
            agentId
          })) as { sessionKey: string }
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
        // 规范化：确保 sessionKey 包含 agentId 前缀
        const normalizedSk = sk.includes(':') ? sk : `${agentId}:${sk}`
        set((s) => ({
          sessionKeys: { ...s.sessionKeys, [agentId]: normalizedSk }
        }))
        get().fetchHistory(agentId, normalizedSk, 'initial')
      },

      fetchSessions: async (agentId: string) => {
        if (get().isLoadingSessions[agentId]) return
        updateSubState(set, 'isLoadingSessions', agentId, true)
        try {
          const res = (await getGatewayClient().request('sessions:list', {
            agentId
          })) as { sessions: (string | { key: string })[] }
          const remoteSessions = (res?.sessions || [])
            .map((s) => (typeof s === 'string' ? s : s.key))
            .filter(Boolean) as string[]

          set((s) => {
            const currentKey = s.sessionKeys[agentId]
            // 尊重服务器返回的顺序，除非 currentKey 还没被包含进来（比如刚创建且未刷新）
            const combined = Array.from(
              new Set(
                currentKey && !remoteSessions.includes(currentKey)
                  ? [currentKey, ...remoteSessions]
                  : remoteSessions
              )
            ) as string[]
            return {
              allSessions: { ...s.allSessions, [agentId]: combined },
              sessionKeys: currentKey ? s.sessionKeys : { ...s.sessionKeys, [agentId]: combined[0] }
            }
          })
        } finally {
          updateSubState(set, 'isLoadingSessions', agentId, false)
        }
      },

      resetSession: async (agentId: string) => {
        const sk = get().sessionKeys[agentId]
        if (!sk) return
        try {
          await getGatewayClient().request('sessions:reset', {
            agentId,
            sessionKey: sk
          })
          updateSubState(set, 'sessions', sk, [])
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
        await getGatewayClient().request('sessions:delete', { agentId, sessionKey: sk })
        const newList = list.filter((k) => k !== sk)
        updateSubState(set, 'allSessions', agentId, newList)
        if (active) {
          const next = newList[Math.min(idx, newList.length - 1)]
          set((s) => ({
            sessionKeys: { ...s.sessionKeys, [agentId]: next }
          }))
          get().fetchHistory(agentId, next, 'initial')
        }
      },

      abortMessage: async (agentId: string, sk: string) => {
        try {
          await getGatewayClient().request('chat:abort', { agentId, sessionKey: sk })
          updateSubState(set, 'chatStatuses', sk, 'aborted')
          setTimeout(() => updateSubState(set, 'chatStatuses', sk, 'idle'), RESET_TIMEOUT.ABORT)
        } catch (err) {
          console.error('Abort error:', err)
        }
      },
      respondInteraction: async (agentId, sk, interactionId, result) => {
        try {
          await getGatewayClient().request('chat:respondInteraction', {
            agentId,
            interactionId,
            result
          })
          // 清理本地状态（或者等待后端通知清理，通常这里设为 null 响应更快）
          updateSubState(set, 'interactionMap', sk, null)
        } catch (err) {
          console.error('Respond interaction error:', err)
        }
      }
    }),
    {
      name: 'opcclaw-chat',
      partialize: (s) => ({ sessionKeys: s.sessionKeys })
    }
  )
)
