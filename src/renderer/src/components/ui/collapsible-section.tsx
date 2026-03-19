import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
} from '@renderer/components/ui/collapsible'

export interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isOpen,
  onToggle,
  children
}) => {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className="border border-border/40 rounded-2xl bg-muted/5 transition-colors relative"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 transition-all active:scale-[0.99] outline-none border-none focus-visible:ring-2 focus-visible:ring-primary/20',
            'sticky top-0 z-20 bg-background/95 backdrop-blur-md',
            isOpen ? 'rounded-t-2xl border-b border-border/10 shadow-sm' : 'rounded-2xl'
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                isOpen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
                className: 'w-3.5 h-3.5'
              })}
            </div>
            <span className="font-bold text-[11px] uppercase tracking-wider text-foreground/80">
              {title}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-300',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>

      <AnimatePresence>
        {isOpen && (
          <CollapsibleContent asChild forceMount>
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/10 bg-muted/5">
                {children}
              </div>
            </motion.div>
          </CollapsibleContent>
        )}
      </AnimatePresence>
    </Collapsible>
  )
}
