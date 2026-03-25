import React from 'react'
import { Zap, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Usage, AgentPerformance } from '@shared/types/agent'

interface UsageStatsProps {
  usage?: Usage
  performance?: AgentPerformance
}

/** Token 用量与性能统计组件 */
const UsageStats: React.FC<UsageStatsProps> = ({ usage, performance }) => {
  const { t } = useTranslation()
  if (!usage && !performance) return null

  return (
    <div className="flex items-center gap-x-4 text-muted-foreground/30 whitespace-nowrap overflow-hidden">
      {usage && (
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight">
          <Zap size={10} className="text-amber-500/50" />
          <span>{t('common.tokens_count', { count: usage.totalTokens || 0 })}</span>
        </div>
      )}
      {performance?.totalDurationMs && (
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight">
          <Cpu size={10} className="text-blue-500/50" />
          <span>{((performance.totalDurationMs || 0) / 1000).toFixed(2)}s</span>
        </div>
      )}
    </div>
  )
}

export default React.memo(UsageStats)
