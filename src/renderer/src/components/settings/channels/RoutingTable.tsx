import React, { useState } from 'react'
import { Hash, Bot, X, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { toast } from 'sonner'

interface RoutingTableProps {
  bindings: Record<string, string>
  agents: Array<{ id: string; name: string }>
  onUpdate: (newBindings: Record<string, string>) => void
}

export const RoutingTable: React.FC<RoutingTableProps> = ({ bindings, agents, onUpdate }) => {
  const { t } = useTranslation()
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newAgent, setNewAgent] = useState('')

  const handleAdd = () => {
    if (!newKey || !newAgent) {
      toast.error(t('settings.channels_routing_placeholder_chatid'))
      return
    }
    onUpdate({ ...bindings, [newKey]: newAgent })
    setNewKey('')
    setIsAdding(false)
  }

  const handleRemove = (key: string) => {
    const next = { ...bindings }
    delete next[key]
    onUpdate(next)
  }

  return (
    <div className="bg-muted/5 p-4 space-y-4 antialiased">
      {/* Table Header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 leading-none">
          <Hash className="w-3.5 h-3.5 text-primary/40" />
          {t('settings.channels_routing_table')}
        </h4>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 rounded-lg text-[10px] font-bold border-muted/50 hover:bg-muted/5 transition-all"
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
          {isAdding ? t('settings.channels_routing_cancel') : t('settings.channels_routing_add')}
        </Button>
      </div>

      {/* 获取 ID 的提示信息 */}
      <div className="px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 shadow-xs">
        <div className="shrink-0 mt-0.5 p-1 rounded-full bg-primary/10 text-primary">
          <Hash className="w-3 h-3" />
        </div>
        <p className="text-[10px] leading-relaxed text-primary/80 font-medium">
          {t('settings.channels_routing_id_help')}
        </p>
      </div>

      {/* Add Rule Form */}
      {isAdding && (
        <div className="p-3.5 rounded-xl bg-background border border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200 shadow-lg ring-1 ring-primary/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-muted-foreground/80 pl-1">
                {t('settings.channels_routing_placeholder_chatid')}
              </label>
              <Input
                placeholder={t('settings.channels_routing_id_placeholder')}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="h-8 text-[11px] font-mono bg-muted/10 border-border/40 rounded-lg hover:border-border transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-muted-foreground/80 pl-1">
                {t('settings.channels_routing_target_agent')}
              </label>
              <Select
                value={newAgent}
                onValueChange={setNewAgent}
                disabled={!agents || agents.length === 0}
              >
                <SelectTrigger className="h-8 text-[11px] bg-muted/10 border-border/40 rounded-lg hover:border-border transition-all">
                  <SelectValue placeholder={t('settings.channels_bot_select_agent')} />
                </SelectTrigger>
                {agents && agents.length > 0 && (
                  <SelectContent className="rounded-xl border-muted/50">
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="rounded-lg">
                        <span className="font-bold text-[11px]">{a.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                )}
              </Select>
            </div>
          </div>
          <Button
            className="w-full h-8 rounded-lg font-bold text-[11px] shadow-sm bg-primary/90 hover:bg-primary transition-all"
            onClick={handleAdd}
          >
            {t('settings.channels_confirm') || 'Confirm'}
          </Button>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-1.5">
        {Object.entries(bindings).map(([id, agentId]) => (
          <div
            key={id}
            className="group/item flex items-center justify-between p-2 rounded-xl bg-background border border-muted/20 hover:border-primary/30 hover:bg-muted/5 transition-all duration-200 shadow-sm"
          >
            <div className="flex items-center gap-3 overflow-hidden px-1">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-muted/10 flex flex-col items-center justify-center border border-muted/20 group-hover/item:border-primary/20 transition-colors">
                <span className="text-[8px] font-mono font-black text-muted-foreground/80 leading-none">
                  #
                </span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[10px] font-mono font-bold text-foreground truncate">
                  {id}
                </span>
                <div className="flex items-center gap-1 opacity-60 group-hover/item:text-primary group-hover/item:opacity-100 transition-all">
                  <Bot className="w-2.5 h-2.5" />
                  <span className="text-[9px] font-bold text-muted-foreground/80 group-hover/item:text-primary/80 truncate">
                    {agents?.find((a) => a.id === agentId)?.name || agentId}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover/item:opacity-100 transition-all rounded-lg"
              onClick={() => handleRemove(id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {Object.keys(bindings).length === 0 && !isAdding && (
        <div className="py-6 flex flex-col items-center justify-center border border-dashed border-muted/20 rounded-xl opacity-30 mt-2">
          <Hash className="w-6 h-6 text-muted-foreground/20 mb-1" />
          <span className="text-[10px] font-bold text-muted-foreground/40 italic">
            {t('settings.channels_routing_no_rules')}
          </span>
        </div>
      )}
    </div>
  )
}
