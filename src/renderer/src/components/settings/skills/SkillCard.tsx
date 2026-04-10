import React from 'react'
import { motion } from 'framer-motion'
import { Puzzle, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { Skill, Agent } from '@shared/types/agent'
import { cn } from '@renderer/lib/utils'
import { SkillDetail } from './SkillDetail'

interface SkillCardProps {
  skill: Skill
  agent?: Agent
  agentId?: string
  onDelete?: (agentId: string, name: string) => void
}

/**
 * 紧凑型技能卡片
 */
export const SkillCard: React.FC<SkillCardProps> = ({ skill, agent, agentId, onDelete }) => {
  const { t } = useTranslation()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <motion.div
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="p-6 flex flex-col items-start gap-4 group transition-all duration-200 hover:border-primary/20 cursor-pointer shadow-sm hover:shadow-md rounded-2xl relative overflow-hidden bg-card border-muted/40">
            {/* 饰品背景 */}
            <div className="absolute -right-6 -top-6 opacity-[0.02] transition-all duration-300 pointer-events-none">
              <Puzzle className="w-40 h-40" />
            </div>

            <div className="flex items-center gap-4 w-full relative z-10">
              <div className="p-3 bg-primary/5 rounded-xl text-primary shrink-0 group-hover:bg-primary/10 transition-all duration-200 shadow-inner group-hover:shadow-sm">
                <Puzzle className="w-5 h-5 transition-transform duration-200" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-sm lg:text-base truncate uppercase tracking-tight text-foreground group-hover:text-primary transition-colors">
                    {skill.name}
                  </h4>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full animate-pulse',
                      skill.source === 'built-in'
                        ? 'bg-blue-400'
                        : skill.source === 'managed'
                          ? 'bg-orange-400'
                          : 'bg-green-400'
                    )}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                    {t(`skills.source.${skill.source}`)}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] lg:text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed min-h-[3rem] relative z-10 group-hover:text-foreground/90 transition-colors duration-200">
              {skill.description || t('common.no_description')}
            </p>

            <div className="w-full flex items-center justify-between pt-3 mt-1 relative z-10 border-t border-muted/10 opacity-40 group-hover:opacity-100 transition-all duration-200">
              <span className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-[100px]">
                {skill.path.split(/[\\/]/).pop()}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-primary/60 group-hover:text-primary transition-colors">
                {t('skills.detail') || 'VIEW'}
                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Card>
        </motion.div>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{t('skills.detail') || 'Skill Detail'}</DialogTitle>
        </DialogHeader>
        <SkillDetail
          skill={skill}
          agent={agent}
          onDelete={onDelete ? () => onDelete(agentId || agent?.id || '', skill.name) : undefined}
        />
      </DialogContent>
    </Dialog>
  )
}
