import React from 'react'
import { Sender, Suggestion } from '@ant-design/x'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ChatStatus } from '@shared/types/agent'
import { useSkillStore } from '@renderer/store/useSkillStore'
import {
  SettingOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  handleSend: () => void
  isTyping: boolean
  inputRef: React.RefObject<any>
  currentError: string | null
  chatStatus: ChatStatus
  activeAgentId: string | null
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  handleSend,
  isTyping,
  inputRef,
  currentError,
  chatStatus,
  activeAgentId
}) => {
  const { t } = useTranslation()
  const { commands, fetchCommands } = useSkillStore()

  // 初始加载技能命令
  React.useEffect(() => {
    if (activeAgentId) {
      fetchCommands(activeAgentId)
    }
  }, [activeAgentId, fetchCommands])

  // 内置基础指令适配 SuggestionItems 格式
  const builtinCommands = React.useMemo(
    () => [
      {
        value: '/new',
        label: '/new',
        extra: t('common.new_session'),
        icon: <PlusOutlined />
      },
      {
        value: '/reset',
        label: '/reset',
        extra: t('common.reset_agent'),
        icon: <ReloadOutlined />
      },
      {
        value: '/settings',
        label: '/settings',
        extra: t('common.settings'),
        icon: <SettingOutlined />
      }
    ],
    [t]
  )

  // 合并后的联想项 (符合 SuggestionItem[] 格式)
  const suggestionItems = React.useMemo(() => {
    const all = [
      ...builtinCommands,
      ...commands.map((c) => ({
        value: `/${c.name}`,
        label: `/${c.name}`,
        extra: c.description,
        icon: <ThunderboltOutlined className="text-amber-500" />
      }))
    ]

    // Suggestion 组件内部会处理显示的过滤，但我们也可以在这里根据 input 前缀预过滤
    return all.filter((item) => item.label.startsWith(input))
  }, [input, commands, builtinCommands])

  return (
    <div className="flex flex-col w-full shrink-0">
      {/* Error Message */}
      <AnimatePresence>
        {currentError && chatStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-4 py-2 bg-destructive/10 text-destructive text-[10px] text-center border-t border-destructive/20 font-sans font-medium uppercase tracking-widest max-w-full overflow-hidden text-ellipsis shadow-[0_-4px_12px_rgba(220,38,38,0.1)]"
          >
            {currentError}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-background/40 backdrop-blur-sm border-t min-h-[72px] py-1 px-[20px] shrink-0 transition-all duration-300 w-full min-w-0 flex items-center relative">
        <div className="max-w-4xl mx-auto w-full min-w-0 relative">
          <Suggestion
            items={suggestionItems}
            onSelect={(itemVal) => {
              // 自动补全后加个空格，方便用户输入参数
              setInput(`${itemVal} `)
            }}
          >
            {({ onTrigger, onKeyDown }) => (
              <Sender
                ref={inputRef}
                value={input}
                onChange={(nextVal) => {
                  // 根据输入状态触发联想面板
                  if (nextVal.startsWith('/')) {
                    onTrigger()
                  } else if (!nextVal) {
                    onTrigger(false)
                  }
                  setInput(nextVal)
                }}
                onSubmit={handleSend}
                onKeyDown={onKeyDown}
                // 当正在输入时，发送按钮会变为停止/取消按钮，由 Sender 自动管理
                loading={isTyping}
                onCancel={isTyping ? handleSend : undefined}
                placeholder={t('common.message_assistant')}
                className="rounded-2xl shadow-sm border-border/60 font-sans font-medium tracking-tight"
                autoSize={{ minRows: 1, maxRows: 6 }}
              />
            )}
          </Suggestion>
        </div>
      </div>
    </div>
  )
}

export default ChatInput
