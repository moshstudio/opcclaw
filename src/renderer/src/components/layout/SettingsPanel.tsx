import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sliders, Shield, Zap, Sparkles, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/useSettingsStore'
import { cn } from '@renderer/lib/utils'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ visible, onClose }) => {
  const { t } = useTranslation()
  const { agentSettings, setAgentSetting } = useSettingsStore()

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed xl:relative top-0 right-0 h-full w-[320px] bg-muted/30 border-l z-50 flex flex-col shadow-2xl overflow-hidden backdrop-blur-md"
        >
          <header className="h-16 flex items-center justify-between px-6 border-b shrink-0 bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-tight">
                {t('settings.agent_title')}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg"
            >
              <X className="w-4 h-4" />
            </Button>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8 pb-10">
              {/* Section: Model Config */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('common.intelligence')}
                  </h4>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-foreground/70">
                        {t('settings.temperature_label')}
                      </label>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                        {agentSettings.temperature}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={agentSettings.temperature}
                      onChange={(e) => setAgentSetting('temperature', parseFloat(e.target.value))}
                      className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-foreground/70">
                        {t('settings.maxTokens_label')}
                      </label>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                        {agentSettings.maxTokens}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="256"
                      max="8192"
                      step="256"
                      value={agentSettings.maxTokens}
                      onChange={(e) => setAgentSetting('maxTokens', parseInt(e.target.value))}
                      className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Capabilities */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3.5 h-3.5 text-orange-400" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('common.capabilities')}
                  </h4>
                </div>

                <div className="space-y-2">
                  {[
                    { id: 'webSearch', icon: Zap, label: t('settings.webSearch_label') },
                    {
                      id: 'codeExecution',
                      icon: Sparkles,
                      label: t('settings.codeExecution_label')
                    },
                    { id: 'vision', icon: Shield, label: t('settings.vision_label') }
                  ].map((item) => {
                    const isActive =
                      agentSettings.capabilities[item.id as keyof typeof agentSettings.capabilities]
                    return (
                      <Card
                        key={item.id}
                        className="flex items-center justify-between p-3.5 border-muted bg-background/40 hover:bg-background/80 transition-all font-bold group"
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                          <span className="text-xs group-hover:text-foreground transition-colors">
                            {item.label}
                          </span>
                        </div>
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) =>
                            setAgentSetting('capabilities', {
                              ...agentSettings.capabilities,
                              [item.id]: checked
                            })
                          }
                        />
                      </Card>
                    )
                  })}
                </div>
              </div>

              {/* Section: Storage */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-3.5 h-3.5 text-green-400" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('common.memory')}
                  </h4>
                </div>
                <Card className="p-4 bg-background/40 border-muted-foreground/10 space-y-4">
                  <p className="text-[11px] text-muted-foreground font-medium leading-[1.6]">
                    {t('common.memory_desc')}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full py-2 h-9 text-[11px] font-bold border-muted-foreground/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all"
                  >
                    {t('common.clear_history')}
                  </Button>
                </Card>
              </div>
            </div>
          </ScrollArea>

          <div className="p-6 border-t bg-background/50 backdrop-blur-md mt-auto">
            <Button className="w-full font-bold shadow-xl shadow-primary/20">
              {t('common.apply')}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default SettingsPanel
