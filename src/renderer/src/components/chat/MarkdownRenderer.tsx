import { memo } from 'react'
import { XMarkdown } from '@ant-design/x-markdown'
import '@ant-design/x-markdown/dist/x-markdown.css'
import { cn } from '@renderer/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const MarkdownRenderer = memo(({ content, className }: MarkdownRendererProps) => {
  return (
    <div
      className={cn(
        'markdown-content w-full min-w-0 overflow-hidden leading-relaxed text-[15px]',
        'text-foreground dark:text-zinc-100',
        className
      )}
    >
      <XMarkdown>{content}</XMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
