import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Settings as SettingsIcon, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useAgentStore } from '@renderer/store/useAgentStore'
import { useChatStore } from '@renderer/store/useChatStore'

interface SidebarProps {
  collapsed: boolean
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { agents, activeAgentId, setActiveAgent, fetchAgents } = useAgentStore()
  const { fetchHistory, fetchSessions, newSession } = useChatStore()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

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
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"
          >
            OpenClaw
          </motion.h1>
        )}
      </div>

      {/* New Chat Button */}
      <div className="px-4 mb-4">
        <Button
          variant="outline"
          onClick={() => activeAgentId && newSession(activeAgentId)}
          className="w-full flex items-center justify-start gap-2 px-3 py-6 border-muted bg-background/50 hover:bg-background rounded-xl transition-all group"
        >
          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
            {t('common.new_session')}
          </span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 mb-6">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder={t('common.search_agents')}
            className="w-full bg-background/50 border-transparent focus-visible:border-primary/20 pl-10 h-10 rounded-xl font-medium"
          />
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => handleAgentClick(agent.id)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group text-left',
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
              {agent.config.name?.[0] || agent.id[0]}
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
                  {agent.config.name || agent.id}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground/60 truncate font-medium">
                {agent.config.description || 'AI Assistant'}
              </p>
            </div>
          </button>
        ))}
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
          onClick={() => navigate('/settings')}
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
        >
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </div>
    </motion.aside>
  )
}

export default Sidebar
