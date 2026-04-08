import React from 'react'
import { Sender } from '@ant-design/x'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ChatStatus } from '@shared/types/agent'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  handleSend: () => void
  isTyping: boolean
  inputRef: React.RefObject<any> // Sender 内部 ref 结构不同，此处改为 any 或适配 SenderRef
  currentError: string | null
  chatStatus: ChatStatus
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  handleSend,
  isTyping,
  currentError,
  chatStatus
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col w-full shrink-0">
      {/* Error Message */}
      <AnimatePresence>
        {currentError && chatStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-4 py-2 bg-destructive/10 text-destructive text-[10px] text-center border-t border-destructive/20 font-medium uppercase tracking-widest max-w-full overflow-hidden text-ellipsis shadow-[0_-4px_12px_rgba(220,38,38,0.1)]"
          >
            {currentError}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-background/40 backdrop-blur-sm border-t min-h-[72px] py-1 px-[20px] shrink-0 transition-all duration-300 w-full min-w-0 flex items-center">
        <div className="max-w-4xl mx-auto w-full min-w-0 relative">
          <Sender
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            // 当正在输入时，发送按钮会变为停止/取消按钮，由 Sender 自动管理
            loading={isTyping}
            onCancel={isTyping ? handleSend : undefined} // handleSend 内部已处理 isTyping 时的中止逻辑
            placeholder={t('common.message_assistant')}
            className="rounded-2xl shadow-sm border-border/60 font-medium tracking-tight"
            autoSize={{ minRows: 1, maxRows: 6 }}
          />
        </div>
      </div>
    </div>
  )
}

export default ChatInput
