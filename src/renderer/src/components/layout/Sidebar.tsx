import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  Settings2
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
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
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false)
  const settingsTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const { status: connStatus } = useSystemStore()
  const navigate = useNavigate()

  const handleSettingsOpen = () => {
    if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current)
    setIsSettingsOpen(true)
  }

  const handleSettingsClose = () => {
    settingsTimeoutRef.current = setTimeout(() => {
      setIsSettingsOpen(false)
    }, 300)
  }

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
    const aPinned = a.config?.isPinned ?? a.id === 'main'
    const bPinned = b.config?.isPinned ?? b.id === 'main'
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    if (aPinned && bPinned) {
      if (a.id === 'main') return -1
      if (b.id === 'main') return 1
    }
    return 0
  })

  // 统一的线性动画参数
  const linearTransition = { duration: 0.3, ease: 'linear' as const }

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={linearTransition}
      className="relative h-full bg-muted/30 border-r flex flex-col overflow-hidden"
    >
      {/* 1. Header Section - 锁定高度 64px */}
      <div className="h-[72px] px-[20px] flex items-center justify-start relative overflow-hidden">
        <motion.div
          initial={false}
          animate={{
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : 'auto',
            x: collapsed ? -10 : 0
          }}
          transition={linearTransition}
          className="flex flex-col whitespace-nowrap overflow-hidden shrink-0"
        >
          <h1 className="text-lg leading-[26px] font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            {t('common.app_name')}
          </h1>
          <div className="flex items-center gap-[6px] mt-[2px] ml-[2px]">
            <div
              className={cn(
                'w-[6px] h-[6px] rounded-full shadow-[0_0_8px]',
                connStatus === 'connected'
                  ? 'bg-green-500 shadow-green-500/50'
                  : connStatus === 'reconnecting'
                    ? 'bg-yellow-500 animate-pulse shadow-yellow-500/50'
                    : 'bg-red-500 shadow-red-500/50'
              )}
            />
            <span className="text-[0.65rem] font-bold text-muted-foreground/60 uppercase tracking-widest shrink-0">
              {t('gateway.status_label')} {connStatus}
            </span>
          </div>
        </motion.div>

        {/* 动态伸缩空间 - 基于像素的线性驱动 */}
        <div className="flex-1 transition-all duration-300 ease-linear" />

        <motion.div
          layout
          transition={linearTransition}
          className="w-[40px] h-[40px] flex items-center justify-center shrink-0"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-[32px] w-[32px] text-muted-foreground hover:text-primary transition-all duration-300 ease-linear"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            ) : (
              <PanelLeftClose className="w-[18px] h-[18px]" />
            )}
          </Button>
        </motion.div>
      </div>

      {/* 2. New Agent Button - 锁定高度 56px */}
      <div className="mb-[16px]">
        <Button
          variant="outline"
          onClick={() => setIsNewAgentOpen(true)}
          className="p-0 px-[20px] w-full h-[56px] border-muted bg-background/50 hover:bg-background rounded-[12px] transition-all duration-300 ease-linear overflow-hidden flex items-center justify-start gap-[12px]"
        >
          <div className="w-[40px] h-[40px] flex items-center justify-center shrink-0">
            <Plus className="w-[16px] h-[16px] text-muted-foreground group-hover:text-primary transition-all duration-300 ease-linear" />
          </div>
          <motion.span
            initial={false}
            animate={{
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : 'auto',
              x: collapsed ? -5 : 0
            }}
            transition={linearTransition}
            className="text-sm font-semibold text-muted-foreground whitespace-nowrap overflow-hidden"
          >
            {t('common.new_agent')}
          </motion.span>
        </Button>
      </div>

      <NewAgentModal open={isNewAgentOpen} onOpenChange={setIsNewAgentOpen} />

      {/* 3. Agent List */}
      <div className="flex-1 overflow-y-auto space-y-[4px] custom-scrollbar">
        {sortedAgents.length === 0 && (
          <div className="px-6 py-10 text-center opacity-30 flex flex-col items-center gap-2">
            <Plus className="w-8 h-8 text-muted-foreground animate-pulse" />
            <p className="text-xs uppercase font-black tracking-widest leading-loose">
              {t('common.no_content')}
            </p>
          </div>
        )}
        {sortedAgents.map((agent) => {
          const agentName = agent.config?.name || agent.id

          return (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent.id)}
              className={cn(
                'w-full h-[56px] flex items-center justify-start gap-[12px] px-[20px] rounded-[12px] transition-all duration-300 ease-linear group relative border border-transparent',
                activeAgentId === agent.id ? 'bg-primary/10' : 'hover:bg-muted/50'
              )}
            >
              <div
                className={cn(
                  'w-[40px] h-[40px] rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ease-linear relative',
                  activeAgentId === agent.id
                    ? 'bg-primary text-primary-foreground scale-105 shadow-[0_0_15px_hsl(var(--primary)/0.3)]'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {agentName[0]}
                {(agent.config?.isPinned ?? agent.id === 'main') && (
                  <div className="absolute -top-0.5 -right-0.5 w-[10px] h-[10px] bg-primary/60 rounded-full border-2 border-background shadow-[0_0_8px_rgba(0,0,0,0.1)] z-10" />
                )}
              </div>
              <motion.div
                initial={false}
                animate={{
                  opacity: collapsed ? 0 : 1,
                  width: collapsed ? 0 : 'auto',
                  x: collapsed ? -10 : 0
                }}
                transition={linearTransition}
                className="flex-1 min-w-0 overflow-hidden text-left"
              >
                <p
                  className={cn(
                    'text-sm font-semibold truncate transition-colors duration-300 ease-linear',
                    activeAgentId === agent.id
                      ? 'text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {agentName}
                </p>
              </motion.div>
            </button>
          )
        })}
      </div>

      {/* 4. Footer Section - 锁定高度 64px */}
      <div className="h-[72px] mt-auto border-t bg-background/40 backdrop-blur-sm flex items-center justify-start px-[20px] relative overflow-hidden">
        <motion.div
          initial={false}
          animate={{
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : 'auto',
            x: collapsed ? -10 : 0
          }}
          transition={linearTransition}
          className="flex items-center gap-[12px] overflow-hidden whitespace-nowrap shrink-0"
        >
          <div className="w-[40px] h-[40px] flex items-center justify-center shrink-0">
            <div className="w-[32px] h-[32px] rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 shadow-md shrink-0" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <p className="text-[0.75rem] font-bold text-foreground truncate leading-tight">
              {t('common.user_account')}
            </p>
            <p className="text-[0.65rem] text-muted-foreground/60 truncate font-bold uppercase tracking-tighter leading-none">
              {t('common.premium_member')}
            </p>
          </div>
        </motion.div>

        {/* 动态伸缩空间 */}
        <div className="flex-1 transition-all duration-300 ease-linear" />

        <motion.div
          layout
          transition={linearTransition}
          className="flex items-center gap-[4px] h-[40px] shrink-0"
        >
          <DropdownMenu open={isSettingsOpen} onOpenChange={setIsSettingsOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-300 ease-linear"
                title={t('common.settings')}
                onMouseEnter={handleSettingsOpen}
                onMouseLeave={handleSettingsClose}
              >
                <Settings2 className="w-[18px] h-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={2}
              className="w-[180px]"
              onMouseEnter={handleSettingsOpen}
              onMouseLeave={handleSettingsClose}
            >
              <DropdownMenuItem
                onClick={() => {
                  setIsSettingsOpen(false)
                  navigate('/tasks')
                }}
                className="flex items-center gap-[10px] cursor-pointer"
              >
                <Clock className="w-[16px] h-[16px] text-muted-foreground" />
                <span className="font-medium">{t('common.scheduled_tasks')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setIsSettingsOpen(false)
                  navigate('/settings')
                }}
                className="flex items-center gap-[10px] cursor-pointer"
              >
                <SettingsIcon className="w-[16px] h-[16px] text-muted-foreground" />
                <span className="font-medium">{t('common.settings')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </div>
    </motion.aside>
  )
}

export default Sidebar
