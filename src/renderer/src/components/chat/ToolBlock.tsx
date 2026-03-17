import React, { useState } from 'react'
import { ChevronDown, Wrench, CheckCircle2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@renderer/lib/utils'
import { isJson, formatJson } from '@renderer/lib/chat-utils'
import { useTheme } from '../ThemeProvider'

interface ToolBlockProps {
  name: string
  input: any
  result?: string
  status?: 'loading' | 'success' | 'error'
}

const ToolBlock: React.FC<ToolBlockProps> = ({ name, input, result, status = 'success' }) => {
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
    <div className="my-2 border rounded-xl overflow-hidden bg-muted/20 backdrop-blur-sm shadow-sm transition-all hover:border-primary/30 w-full min-w-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Wrench className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-xs font-bold uppercase tracking-tight text-foreground/80 shrink-0">
                {name}
              </span>
              {!isExpanded && status === 'success' && result && (
                <span className="text-[10px] text-muted-foreground/50 font-mono truncate border-l border-muted-foreground/20 pl-2">
                  {typeof result === 'string'
                    ? result.trim().replace(/\s+/g, ' ')
                    : JSON.stringify(result)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {status === 'loading' ? (
                <>
                  <Clock className="w-3 h-3 text-amber-500 animate-pulse" />
                  <span className="text-[10px] text-amber-500/80 font-medium font-mono uppercase">
                    Executing...
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="text-[10px] text-green-500/80 font-medium font-mono uppercase">
                    Completed
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-2 shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="px-4 pb-4 pt-2 space-y-3">
              {/* Input Section */}
              <div className='space-y-1.5'>
                <div className='text-[10px] font-bold text-foreground/70 dark:text-foreground/80 uppercase tracking-widest px-1'>
                  Parameters
                </div>
                <div
                  className={cn(
                    'rounded-lg overflow-x-auto border border-border/70 dark:border-border/50 w-full shadow-inner transition-colors',
                    isDarkMode ? 'bg-zinc-950' : 'bg-zinc-50/50'
                  )}
                >
                  <SyntaxHighlighter
                    style={isDarkMode ? vscDarkPlus : oneLight}
                    language='json'
                    PreTag='div'
                    customStyle={{
                      ...highlightStyle,
                      backgroundColor: 'transparent'
                    }}
                    wrapLines={true}
                  >
                    {formatJson(input)}
                  </SyntaxHighlighter>
                </div>
              </div>

              {/* Result Section */}
              {result && (
                <div className='space-y-1.5'>
                  <div className='text-[10px] font-bold text-foreground/70 dark:text-foreground/80 uppercase tracking-widest px-1'>
                    Output
                  </div>
                  <div
                    className={cn(
                      'rounded-lg overflow-x-auto border border-border/70 dark:border-border/50 w-full shadow-inner transition-colors',
                      isDarkMode ? 'bg-zinc-950' : 'bg-zinc-100/30'
                    )}
                  >
                    <SyntaxHighlighter
                      style={isDarkMode ? vscDarkPlus : oneLight}
                      language={isJson(result) ? 'json' : 'text'}
                      PreTag='div'
                      customStyle={{
                        ...highlightStyle,
                        backgroundColor: 'transparent'
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
