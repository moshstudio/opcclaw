import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-bold placeholder:text-muted-foreground placeholder:font-sans focus-visible:outline-none focus-visible:border-primary/40 focus-visible:shadow-[0_0_0_2px_hsl(var(--primary)/10%),0_0_8px_hsl(var(--primary)/15%)] disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-none custom-scrollbar',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
