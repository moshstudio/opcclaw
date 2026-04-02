import React, { useState } from 'react'
import { Card } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Globe, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { toast } from 'sonner'
import { cn } from '@renderer/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

const NetworkSettings: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()

  const [localProxy, setLocalProxy] = useState(config?.proxy || '')
  const [prevProxy, setPrevProxy] = useState(config?.proxy)

  // 同步配置到本地状态
  if (config?.proxy !== prevProxy) {
    setPrevProxy(config?.proxy)
    setLocalProxy(config?.proxy || '')
  }

  const handleSaveProxy = async () => {
    try {
      await updateConfig({ proxy: localProxy })
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to save proxy:', err)
      toast.error(t('common.save_failed') + ': ' + err)
    }
  }

  const presets = [
    { label: t('settings.proxy_none'), value: '' },
    { label: 'Clash / Stash (7890)', value: 'http://127.0.0.1:7890' },
    { label: 'Clash Verge / Mihomo (7897)', value: 'http://127.0.0.1:7897' },
    { label: 'V2Ray / SS / SSR (1080)', value: 'socks5://127.0.0.1:1080' },
    {
      label: 'v2rayN / V2Ray Desktop (10808)',
      value: 'socks5://127.0.0.1:10808'
    }
  ]

  return (
    <div className="pt-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 px-1">
        <Globe className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest leading-none">
          {t('settings.global_proxy')}
        </h3>
      </div>

      <Card className="p-6 border-muted bg-background/50 backdrop-blur-sm shadow-xs overflow-hidden">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 group">
              <Input
                placeholder="e.g. http://127.0.0.1:7890 或 socks5://127.0.0.1:7890"
                value={localProxy}
                onChange={(e) => setLocalProxy(e.target.value)}
                className="h-10 bg-muted/40 border-muted/50 font-mono text-xs focus-visible:ring-1 focus-visible:ring-primary/20 pr-10 shadow-none hover:bg-muted/60 transition-all rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveProxy()
                  }
                }}
              />
              <div className="absolute right-1 top-1 bottom-1 flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-muted-foreground/10 text-muted-foreground/60 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[260px] p-2 rounded-2xl shadow-2xl border-muted/50 backdrop-blur-xl bg-background/95"
                  >
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest leading-none mb-1">
                      Quick Presets
                    </div>
                    {presets.map((p) => (
                      <DropdownMenuItem
                        key={p.value}
                        onClick={() => setLocalProxy(p.value)}
                        className="flex flex-col items-start gap-0.5 py-2 px-3 rounded-xl hover:bg-primary/5 cursor-pointer group"
                      >
                        <span className="text-xs font-bold transition-colors group-hover:text-primary">
                          {p.label}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/70 truncate w-full">
                          {p.value || 'DIRECT / NO PROXY'}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                'h-10 px-5 rounded-xl text-xs font-extrabold shadow-sm transition-all',
                localProxy !== (config?.proxy || '')
                  ? 'active:scale-95 hover:bg-secondary/80'
                  : 'opacity-40 cursor-not-allowed'
              )}
              disabled={localProxy === (config?.proxy || '')}
              onClick={handleSaveProxy}
            >
              {t('common.save')}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-medium">
            {t('settings.global_proxy_desc')}
          </p>
        </div>
      </Card>
    </div>
  )
}

export default NetworkSettings
