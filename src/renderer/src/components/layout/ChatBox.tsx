import React, { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { ChatStatus } from '@shared/types/agent'
import ChatHeader from '../chat/ChatHeader'
import MessageList from '../chat/MessageList'
import ChatInput from '../chat/ChatInput'

interface ChatBoxProps {
  toggleSidebar: () => void
  sidebarCollapsed: boolean
  settingsVisible: boolean
  toggleSettings: () => void
}

const ChatBox: React.FC<ChatBoxProps> = ({
  toggleSidebar,
  sidebarCollapsed,
  settingsVisible,
  toggleSettings
}) => {
  const { t } = useTranslation()
  const {
    getVisibleMessages,
    sendMessage,
    chatStatuses,
    errorMessages,
    isLoadingHistory,
    allSessions,
    isLoadingSessions,
    newSession,
    resetSession,
    switchSession,
    deleteSession,
    abortMessage,
    sessionKeys
  } = useChatStore()

  const { agents, activeAgentId } = useAgentStore()
  const [input, setInput] = useState('')
  const [isSessionsOpen, setIsSessionsOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const messages = getVisibleMessages()
  const currentSessionKey = activeAgentId ? sessionKeys[activeAgentId] || 'main' : 'main'

  const chatStatus = (
    currentSessionKey ? chatStatuses[currentSessionKey] || 'idle' : 'idle'
  ) as ChatStatus

  const currentError = currentSessionKey ? errorMessages[currentSessionKey] : null
  const isTyping = ['waiting', 'thinking', 'streaming', 'tool_executing'].includes(chatStatus)
  const isLoading = activeAgentId ? isLoadingHistory[activeAgentId] : false
  const activeAgentSessions = activeAgentId ? allSessions[activeAgentId] || [] : []

  // 状态显示逻辑映射
  const getStatusDisplay = useCallback(() => {
    if (!isTyping) return currentSessionKey.replace('session-', '')

    switch (chatStatus) {
      case 'waiting':
        return t('common.waiting') || 'Waiting'
      case 'thinking':
        return t('common.thinking') || 'Thinking'
      case 'tool_executing':
        return t('common.executing_tool') || 'Executing'
      case 'streaming':
        return t('common.typing') || 'Typing'
      default:
        return t('common.typing') || 'Typing'
    }
  }, [isTyping, chatStatus, currentSessionKey, t])


  const handleSend = async () => {
    if (isTyping) {
      if (activeAgentId && currentSessionKey) {
        await abortMessage(activeAgentId, currentSessionKey)
      }
      return
    }

    if (!input.trim()) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 transition-all duration-300 relative">
      <ChatHeader
        activeAgent={activeAgent}
        activeAgentId={activeAgentId}
        sidebarCollapsed={sidebarCollapsed}
        toggleSidebar={toggleSidebar}
        isTyping={isTyping}
        chatStatus={chatStatus}
        getStatusDisplay={getStatusDisplay}
        isSessionsOpen={isSessionsOpen}
        setIsSessionsOpen={setIsSessionsOpen}
        activeAgentSessions={activeAgentSessions}
        currentSessionKey={currentSessionKey}
        switchSession={switchSession}
        deleteSession={deleteSession}
        newSession={newSession}
        resetSession={resetSession}
        isLoadingSessions={isLoadingSessions}
        toggleSettings={toggleSettings}
        settingsVisible={settingsVisible}
      />

      <MessageList
        messages={messages}
        isLoading={isLoading}
        isTyping={isTyping}
        chatStatus={chatStatus}
      />

      <ChatInput
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        isTyping={isTyping}
        inputRef={inputRef}
        currentError={currentError}
        chatStatus={chatStatus}
      />
    </div>
  )
}

export default ChatBox
