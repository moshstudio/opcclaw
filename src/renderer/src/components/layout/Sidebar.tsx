import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Settings as SettingsIcon, PanelLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useChatStore } from '@renderer/store/useChatStore'

import { useSystemStore } from '@renderer/store/useSystemStore'

import NewAgentModal from '../modals/NewAgentModal'

interface SidebarProps {
  collapsed: boolean
  toggleSidebar: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, toggleSidebar }) => {
  const { t } = useTranslation()
  const { agents, activeAgentId, setActiveAgent } = useAgentStore()
  const { fetchHistory, fetchSessions } = useChatStore()
  const [isNewAgentOpen, setIsNewAgentOpen] = React.useState(false)
  const navigate = useNavigate()

  const { status: connStatus } = useSystemStore()

  // 监听 activeAgentId 变化，自动触发历史载入和会话列表载入
  useEffect(() => {
    if (activeAgentId) {
      fetchHistory(activeAgentId)
      fetchSessions(activeAgentId)
    }
  }, [activeAgentId, fetchHistory, fetchSessions])

  const handleAgentClick = (id: string) => {
    setActiveAgent(id)
    fetchHistory(id)
    fetchSessions(id)
  }

  const sortedAgents = [...agents].sort((a, b) => {
    const aPinned = a.config.isPinned ?? a.id === 'main'
    const bPinned = b.config.isPinned ?? b.id === 'main'
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    if (aPinned && bPinned) {
      if (a.id === 'main') return -1
      if (b.id === 'main') return 1
    }
    return 0
  })

  return (
    <motion.aside
      initial={false}
      animate={{
        width: collapsed ? 0 : 280,
        opacity: collapsed ? 0 : 1
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'relative h-full bg-muted/30 border-r flex flex-col overflow-hidden',
        collapsed && 'border-none'
      )}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        {!collapsed && (
          <div className="flex flex-col">
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"
            >
              OpcClaw
            </motion.h1>
            <div className="flex items-center gap-1.5 mt-0.5 ml-0.5">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full shadow-[0_0_8px]',
                  connStatus === 'connected'
                    ? 'bg-green-500 shadow-green-500/50'
                    : connStatus === 'reconnecting'
                      ? 'bg-yellow-500 animate-pulse shadow-yellow-500/50'
                      : 'bg-red-500 shadow-red-500/50'
                )}
              />
              <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest leading-none">
                Gateway {connStatus}
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-muted-foreground hover:text-primary transition-all"
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* New Agent Button */}
      <div className="px-4 mb-4">
        <Button
          variant="outline"
          onClick={() => setIsNewAgentOpen(true)}
          className="w-full flex items-center justify-start gap-2 px-3 py-6 border-muted bg-background/50 hover:bg-background rounded-xl transition-all group"
        >
          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
            {t('common.new_agent')}
          </span>
        </Button>
      </div>

      <NewAgentModal open={isNewAgentOpen} onOpenChange={setIsNewAgentOpen} />

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
        {sortedAgents.map((agent) => {
          const agentName =
            agent.id === 'main' && (!agent.config.name || agent.config.name === 'Default Assistant')
              ? t('common.default_assistant')
              : agent.config.name || agent.id

          return (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group text-left relative',
                activeAgentId === agent.id
                  ? 'bg-primary/10 border border-primary/20 shadow-sm'
                  : 'hover:bg-muted/50 border border-transparent'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm transition-all uppercase',
                  activeAgentId === agent.id
                    ? 'bg-primary text-primary-foreground scale-105'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {agentName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <p
                    className={cn(
                      'text-sm font-bold truncate',
                      activeAgentId === agent.id
                        ? 'text-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    {agentName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-4 mt-auto border-t bg-background/40 backdrop-blur-sm flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 shadow-md" />
        <div className="flex-1 overflow-hidden">
          <p className="text-xs font-bold text-foreground truncate">{t('common.user_account')}</p>
          <p className="text-[10px] text-muted-foreground/60 truncate font-bold uppercase tracking-tighter">
            {t('common.premium_member')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            navigate('/settings')
          }}
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
        >
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </div>
    </motion.aside>
  )
}

export default Sidebar
