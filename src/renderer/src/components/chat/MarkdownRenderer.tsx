import { memo, type FC } from 'react'
import { CodeHighlighter } from '@ant-design/x'
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown'
import '@ant-design/x-markdown/dist/x-markdown.css'
import { cn } from '@renderer/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * 自定义代码渲染组件
 * 使用 @ant-design/x 的 CodeHighlighter 提供语义化高亮等增强功能
 */
const Code: FC<ComponentProps> = (props) => {
  const { className, children } = props
  const lang = className?.match(/language-(\w+)/)?.[1] || ''

  if (typeof children !== 'string') {
    return <code {...props} />
  }

  return (
    <CodeHighlighter lang={lang} prismLightMode={false}>
      {children}
    </CodeHighlighter>
  )
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
      <XMarkdown
        components={{
          code: Code
        }}
        // 使用 div 替代 p 标签作为段落容器，遵循示例代码的最佳实践
        paragraphTag="div"
      >
        {content}
      </XMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
