import React, { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@renderer/store/useChatStore'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { ChatStatus } from '@shared/types/agent'
import { useModelStore } from '@renderer/store/useModelStore'
import { toast } from 'sonner'
import ChatHeader from '../chat/ChatHeader'
import MessageList from '../chat/MessageList'
import ChatInput from '../chat/ChatInput'

interface ChatBoxProps {
  settingsVisible: boolean
  toggleSettings: () => void
}

const ChatBox: React.FC<ChatBoxProps> = ({ settingsVisible, toggleSettings }) => {
  const { t } = useTranslation()
  const {
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
    sessionKeys,
    sessions
  } = useChatStore()
  const { models } = useModelStore()

  const { agents, activeAgentId } = useAgentStore()
  const [input, setInput] = useState('')
  const [isSessionsOpen, setIsSessionsOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const currentSessionKey = activeAgentId ? sessionKeys[activeAgentId] || 'main' : 'main'
  const messages = sessions[currentSessionKey] || []

  const chatStatus = (
    currentSessionKey ? chatStatuses[currentSessionKey] || 'idle' : 'idle'
  ) as ChatStatus

  const currentError = currentSessionKey ? errorMessages[currentSessionKey] : null
  const isTyping = [
    'waiting',
    'thinking',
    'streaming',
    'toolCalling',
    'toolExecuting',
    'retrying'
  ].includes(chatStatus)
  const isLoading = currentSessionKey ? isLoadingHistory[currentSessionKey] : false
  const activeAgentSessions = activeAgentId ? allSessions[activeAgentId] || [] : []

  // 状态显示逻辑映射
  const getStatusDisplay = useCallback(() => {
    if (!isTyping) return currentSessionKey.replace('session-', '')

    switch (chatStatus) {
      case 'waiting':
        return t('common.waiting') || 'Waiting'
      case 'thinking':
        return t('common.thinking') || 'Thinking'
      case 'toolExecuting':
        return t('common.executing_tool') || 'Executing'
      case 'streaming':
        return t('common.generating') || 'Responding'
      default:
        return t('common.generating') || 'Responding'
    }
  }, [isTyping, chatStatus, currentSessionKey, t])

  const handleSend = async () => {
    if (isTyping) {
      if (activeAgentId && currentSessionKey) {
        await abortMessage(activeAgentId, currentSessionKey)
      }
      return
    }

    if (!input.trim() || !activeAgentId) return

    if (models.length === 0) {
      toast.error(t('settings.no_models_configured') || '未配置任何模型，请先前往设置页面配置模型')
      return
    }

    const text = input
    setInput('')
    await sendMessage(text, activeAgentId)
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 transition-all duration-300 relative">
      <ChatHeader
        activeAgent={activeAgent}
        activeAgentId={activeAgentId}
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
