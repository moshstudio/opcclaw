import React from 'react'
import { Puzzle, Trash2, Info, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { DialogBody } from '@renderer/components/ui/dialog'
import { Skill, Agent } from '@shared/types/agent'

interface SkillDetailProps {
  skill: Skill
  agent?: Agent
  onDelete?: () => void
}

/**
 * 技能详情对话框组件
 */
export const SkillDetail: React.FC<SkillDetailProps> = ({ skill, agent, onDelete }) => {
  const { t } = useTranslation()

  return (
    <DialogBody className="space-y-6 py-6 font-sans">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-primary/10 rounded-2xl text-primary shrink-0">
          <Puzzle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold">{skill.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={
                skill.source === 'built-in'
                  ? 'secondary'
                  : skill.source === 'managed'
                    ? 'default'
                    : 'outline'
              }
            >
              {t(`skills.source.${skill.source}`)}
            </Badge>
            {agent && (
              <Badge variant="outline" className="text-primary/70 border-primary/30">
                {agent.config.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          {t('common.description')}
        </h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {skill.description || t('common.no_description')}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          {t('common.path')}
        </h4>
        <div className="bg-muted/50 p-3 rounded-xl border group relative overflow-hidden">
          <code className="text-xs break-all block text-muted-foreground">{skill.path}</code>
        </div>
      </div>

      {onDelete && skill.source !== 'built-in' && (
        <div className="pt-4 mt-4 border-t border-dashed">
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 rounded-xl"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
            {t('common.delete')}
          </Button>
        </div>
      )}
    </DialogBody>
  )
}
