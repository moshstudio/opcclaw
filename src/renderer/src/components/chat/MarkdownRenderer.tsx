import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@renderer/lib/utils'
import { isJson } from '@renderer/lib/chat-utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
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
    <div className={cn('markdown-content prose prose-sm dark:prose-invert max-w-none w-full min-w-0 overflow-hidden', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            if (!inline && language) {
              return (
                <div className="my-3 rounded-lg overflow-x-auto border border-border shadow-sm w-full">
                  <div className="bg-muted px-3 py-1 text-[10px] font-mono text-muted-foreground border-b flex justify-between items-center">
                    <span>{language.toUpperCase()}</span>
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

            // If it's a block without language but is valid JSON, highlight it as JSON
            if (!inline && !language && isJson(codeString)) {
              return (
                <div className="my-3 rounded-lg overflow-x-auto border border-border shadow-sm w-full">
                  <div className="bg-muted px-3 py-1 text-[10px] font-mono text-muted-foreground border-b">
                    JSON
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language="json"
                    PreTag="div"
                    customStyle={commonHighlightStyle}
                    wrapLines={true}
                    {...props}
                  >
                    {JSON.stringify(JSON.parse(codeString), null, 2)}
                  </SyntaxHighlighter>
                </div>
              )
            }

            return (
              <code
                className={cn(
                  'bg-muted-foreground/10 px-1.5 py-0.5 rounded text-[0.9em] font-mono',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
          // Customizing other elements for a premium feel
          p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-4"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 py-1 italic text-muted-foreground mb-3">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3 rounded-lg border">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="p-2 bg-muted font-bold border-b">{children}</th>,
          td: ({ children }) => <td className="p-2 border-b">{children}</td>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
