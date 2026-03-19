import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@renderer/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content, className }) => {
  const commonHighlightStyle = {
    margin: 0,
    padding: '12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere'
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'markdown-content prose prose-sm dark:prose-invert max-w-none w-full min-w-0 overflow-hidden',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            if (!inline && language) {
              return (
                <div className="my-4 rounded-lg overflow-hidden border border-border bg-[#1e1e1e]">
                  <div className="bg-muted/10 px-3 py-1.5 text-[10px] font-mono text-muted-foreground border-b flex justify-between items-center">
                    <span className="uppercase tracking-wider">{language}</span>
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    customStyle={commonHighlightStyle}
                    wrapLines={true}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              )
            }

            return (
              <code
                className={cn(
                  'bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[0.9em] font-mono text-indigo-600 dark:text-indigo-400 border border-zinc-200/50 dark:border-zinc-700/50',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
          p: ({ children }) => (
            <p className="mb-4 last:mb-0 leading-relaxed text-zinc-700 dark:text-zinc-300">
              {children}
            </p>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-2">{children}</ol>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-4 font-medium transition-colors"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/20 pl-4 py-2 italic text-muted-foreground bg-muted/20 rounded-r-lg mb-4">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4 rounded-lg border border-border shadow-sm">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="p-3 bg-muted/50 font-bold border-b text-zinc-600 dark:text-zinc-400">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="p-3 border-b border-muted/30">{children}</td>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
