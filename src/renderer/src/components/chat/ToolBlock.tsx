import React, { useState } from 'react'
import { ChevronDown, Wrench, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@renderer/lib/utils'
import { isJson, formatJson } from '@renderer/lib/chat-utils'
import { useTheme } from '@renderer/hooks/use-theme'

interface ToolBlockProps {
  name: string
  input: any
  result?: string
  status?: 'loading' | 'success' | 'error'
}

const ToolBlock: React.FC<ToolBlockProps> = ({ name, input, result, status = 'success' }) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const { theme } = useTheme()

  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const highlightStyle = {
    margin: 0,
    padding: '12px',
    fontSize: '11px',
    backgroundColor: 'transparent',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere'
  } as React.CSSProperties

  return (
    <div className="my-3 border rounded-xl overflow-hidden bg-white/50 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/40 w-full min-w-0 group/tool">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-sm group-hover/tool:scale-105 transition-transform duration-300">
            <Wrench className="w-4 h-4" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80 shrink-0">
                {name}
              </span>
              {!isExpanded && status === 'success' && result && (
                <span className="text-[10px] text-muted-foreground/50 font-mono truncate border-l border-muted-foreground/20 pl-2 leading-none mt-0.5">
                  {typeof result === 'string'
                    ? result.trim().replace(/\s+/g, ' ')
                    : JSON.stringify(result)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {status === 'loading' ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </div>
                  <span className="text-[9px] text-amber-600/80 dark:text-amber-500/80 font-bold uppercase tracking-tighter">
                    {t('common.executing')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span className="text-[9px] text-emerald-600/80 dark:text-emerald-500/80 font-bold uppercase tracking-tighter">
                    {t('common.completed')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
          className="ml-2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
        </motion.div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'circOut' }}
          >
            <div className="px-4 pb-5 pt-1 space-y-4">
              {/* Input Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                    {t('common.parameters')}
                  </span>
                </div>
                <div
                  className={cn(
                    'rounded-xl overflow-hidden border border-border/50 w-full shadow-inner transition-colors',
                    isDarkMode ? 'bg-black/40' : 'bg-zinc-50'
                  )}
                >
                  <SyntaxHighlighter
                    style={isDarkMode ? vscDarkPlus : oneLight}
                    language="json"
                    PreTag="div"
                    customStyle={{
                      ...highlightStyle,
                      backgroundColor: 'transparent',
                      padding: '16px'
                    }}
                    wrapLines={true}
                  >
                    {formatJson(input)}
                  </SyntaxHighlighter>
                </div>
              </div>

              {/* Result Section */}
              {result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('common.output')}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'rounded-xl overflow-hidden border border-border/50 w-full shadow-inner transition-colors',
                      isDarkMode ? 'bg-black/40' : 'bg-zinc-100/30'
                    )}
                  >
                    <SyntaxHighlighter
                      style={isDarkMode ? vscDarkPlus : oneLight}
                      language={isJson(result) ? 'json' : 'text'}
                      PreTag="div"
                      customStyle={{
                        ...highlightStyle,
                        backgroundColor: 'transparent',
                        padding: '16px'
                      }}
                      wrapLines={true}
                    >
                      {formatJson(result)}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ToolBlock
