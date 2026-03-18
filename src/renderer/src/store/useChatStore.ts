import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getGatewayClient } from '../services/gateway-client'
import { useAgentStore } from './useAgentStore'
import { Message, ChatStatus } from '@shared/types/agent'

interface ChatState {
  sessions: Record<string, Message[]> // Key: sessionKey
  chatStatuses: Record<string, ChatStatus> // Key: sessionKey
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
        getGatewayClient((evt) => {
          const { agentId, sessionKey } = (evt.payload as any) || {}
          if (!agentId || !sessionKey) return

          // 处理核心聊天事件流
          if (evt.event === 'chat') {
            const { state, text, runId, error, message: remoteMsg } = evt.payload as any

            set((s) => {
              const msgs = [...(s.sessions[sessionKey] || [])]
              const idx = runId
                ? msgs.findLastIndex((m) => m.id === runId && m.role === 'assistant')
                : msgs.findLastIndex((m) => m.role === 'assistant')

              let status = s.chatStatuses[sessionKey] || 'idle'

              if (state === 'start') {
                status = 'streaming'
                if (idx === -1) {
                  msgs.push({
                    ...remoteMsg,
                    id: runId || remoteMsg.id || `t-${Date.now()}`
                  })
                } else {
                  msgs[idx] = { ...msgs[idx], ...remoteMsg }
                }
              } else if (state === 'delta') {
                status = 'streaming'
                if (idx !== -1) {
                  const m = msgs[idx]
                  if (typeof m.content === 'string') {
                    m.content += text || ''
                  } else if (Array.isArray(m.content)) {
                    // 找到最后一个文本块，或者追加一个新的
                    const lastBlock = m.content[m.content.length - 1]
                    if (lastBlock?.type === 'text') {
                      lastBlock.text = (lastBlock.text || '') + (text || '')
                    } else {
                      m.content.push({ type: 'text', text: text || '' })
                    }
                  }
                  msgs[idx] = { ...m }
                }
              } else if (state === 'final') {
                status = 'completed'
                if (remoteMsg) {
                  if (idx !== -1) msgs[idx] = remoteMsg
                  else msgs.push(remoteMsg)
                } else if (idx !== -1) {
                  // Fallback: 如果没有完整消息，确保文本最终是对的
                  const m = msgs[idx]
                  if (text && typeof m.content === 'string') m.content = text
                }
              } else if (state === 'error') {
                const isAbort =
                  error === '操作已中止' ||
                  (error && String(error).toLowerCase().includes('aborted'))
                status = isAbort ? 'aborted' : 'error'

                if (!isAbort) {
                  msgs.push({
                    id: `e-${Date.now()}`,
                    role: 'system',
                    content: String(error).startsWith('Error:') ? error : `Error: ${error}`,
                    timestamp: ''
                  })
                }
              }

              // 如果已完成、出错或中止，延迟回滚到 idle
              if (state === 'final' || state === 'error') {
                setTimeout(() => {
                  set((inner) => ({
                    chatStatuses: { ...inner.chatStatuses, [sessionKey]: 'idle' }
                  }))
                }, 800)
              }

              return {
                sessions: { ...s.sessions, [sessionKey]: msgs },
                chatStatuses: { ...s.chatStatuses, [sessionKey]: status }
              }
            })
          }

          // 处理深度 Agent 事件（获取更精确的状态：思考、工具调用等）
          if (evt.event === 'agent') {
            const payload = evt.payload as any
            set((s) => {
              const currentStatus = s.chatStatuses[sessionKey] || 'idle'
              let nextStatus = currentStatus

              switch (payload.type) {
                case 'thinking_delta':
                  nextStatus = 'thinking'
                  break
                case 'tool_execution_start':
                  nextStatus = 'tool_executing'
                  break
                case 'tool_execution_end': {
                  // 保存工具执行结果到本地会话中，以便 MessageBubble 能够感知并渲染
                  const toolResultMsg: Message = {
                    id: `tr-${payload.toolCallId}-${Date.now()}`,
                    role: 'assistant',
                    content: [
                      {
                        type: 'tool_result',
                        tool_use_id: payload.toolCallId,
                        content: payload.result
                      }
                    ],
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }
                  set((inner) => ({
                    sessions: {
                      ...inner.sessions,
                      [sessionKey]: [...(inner.sessions[sessionKey] || []), toolResultMsg]
                    }
                  }))
                  nextStatus = 'streaming'
                  break
                }
                case 'agent_error':
                  nextStatus = 'error'
                  break
              }

              if (nextStatus === currentStatus) return s as any
              return { chatStatuses: { ...s.chatStatuses, [sessionKey]: nextStatus } }
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
            id: m.id || Math.random(),
            role: m.role,
            content: m.content || m.text || '',
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

        const userMsg = {
          id: Math.random().toString(36).slice(7),
          role: 'user',
          content: text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } as Message
        set((s) => ({
          sessions: { ...s.sessions, [sk]: [...(s.sessions[sk] || []), userMsg] },
          chatStatuses: { ...s.chatStatuses, [sk]: 'waiting' }
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
              sessionKeys: { ...s.sessionKeys, [agentId]: newSk },
              sessions: { ...s.sessions, [newSk]: [userMsg] }
            }))
            await get().fetchSessions(agentId)
          }
        } catch (err) {
          updateState(set, 'chatStatuses', sk, 'error')
          updateState(set, 'sessions', sk, [
            ...(get().sessions[sk] || []),
            { id: `err-${Date.now()}`, role: 'system', content: `发送失败: ${err}`, timestamp: '' }
          ])
          // 延迟回滚
          setTimeout(() => updateState(set, 'chatStatuses', sk, 'idle'), 1000)
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
            const combined = Array.from(new Set(currentKey ? [currentKey, ...remoteSessions] : remoteSessions))
            return {
              allSessions: { ...s.allSessions, [agentId]: combined },
              sessionKeys: (currentKey ? s.sessionKeys : { ...s.sessionKeys, [agentId]: combined[0] }) as Record<string, string>
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
