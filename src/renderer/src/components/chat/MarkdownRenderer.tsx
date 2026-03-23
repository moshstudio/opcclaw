import React, { memo, useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@renderer/lib/utils'
import { useTheme } from '@renderer/hooks/use-theme'
import { Check, Copy, ExternalLink } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * 代码高亮通用样式
 */
const commonHighlightStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  fontSize: '13px',
  backgroundColor: 'transparent',
  wordBreak: 'break-all',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  lineHeight: '1.6'
}

/**
 * 代码复制组件
 */
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200',
        'hover:bg-zinc-200/50 dark:hover:bg-zinc-800/80 active:scale-95',
        'text-[10px] font-medium text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400'
      )}
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-500 animate-in zoom-in-50" />
          <span className="text-green-500">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

/**
 * Markdown 渲染组件
 * 深度优化流式渲染性能
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content, className }) => {
  const { theme } = useTheme()
  const [isDark, setIsDark] = useState(false)

  // 处理深浅色主题检测
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateThemeMode = () => {
      if (theme === 'system') {
        setIsDark(mediaQuery.matches)
      } else {
        setIsDark(theme === 'dark')
      }
    }

    updateThemeMode()
    mediaQuery.addEventListener('change', updateThemeMode)
    return () => mediaQuery.removeEventListener('change', updateThemeMode)
  }, [theme])

  // 记忆化所有的渲染组件配置，这是保证“打字机”输出流畅的关键
  const markdownComponents = React.useMemo(
    () => ({
      pre: ({ children }: any) => children,
      code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '')
        const language = match ? match[1] : ''
        const codeString = String(children).replace(/\n$/, '')

        if (!inline && language) {
          return (
            <div className="my-6 group relative rounded-xl overflow-hidden border border-border/50 bg-zinc-50 dark:bg-zinc-900/50 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-100/60 dark:bg-zinc-800/60 border-b border-border/40 backdrop-blur-sm">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-zinc-400">
                  {language}
                </span>
                <CopyButton text={codeString} />
              </div>
              <SyntaxHighlighter
                style={isDark ? vscDarkPlus : prism}
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
              'bg-indigo-50/80 dark:bg-indigo-400/10 px-1.5 py-0.5 rounded-md text-[0.88em] font-mono text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-400/20 align-baseline',
              className
            )}
            {...props}
          >
            {children}
          </code>
        )
      },
      p: ({ children }: any) => (
        <p className="mb-4 last:mb-0 leading-relaxed text-slate-700 dark:text-zinc-300">
          {children}
        </p>
      ),
      ul: ({ children }: any) => (
        <ul className="list-disc pl-5 mb-4 space-y-2 text-slate-700 dark:text-zinc-300">
          {children}
        </ul>
      ),
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-5 mb-4 space-y-2 text-slate-700 dark:text-zinc-300">
          {children}
        </ol>
      ),
      a: ({ children, href }: any) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline underline-offset-4 decoration-primary/30 font-semibold transition-colors group"
        >
          {children}
          <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>
      ),
      blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-indigo-500/40 dark:border-indigo-500/20 pl-4 py-1 italic text-slate-600 dark:text-slate-400 bg-indigo-50/20 dark:bg-indigo-500/5 rounded-r-lg mb-4">
          {children}
        </blockquote>
      ),
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-6 rounded-xl border border-border shadow-sm">
          <table className="w-full text-left text-xs border-collapse divide-y divide-border/50">
            {children}
          </table>
        </div>
      ),
      th: ({ children }: any) => (
        <th className="p-3 bg-zinc-50/50 dark:bg-zinc-800/50 font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-tight">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="p-3 border-b border-border/30 text-zinc-600 dark:text-zinc-400">
          {children}
        </td>
      ),
      h1: ({ children }: any) => (
        <h1 className="text-2xl font-black mt-10 mb-5 border-b pb-2 tracking-tight">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-xl font-bold mt-8 mb-4 tracking-tight">{children}</h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-lg font-bold mt-6 mb-3 tracking-tight">{children}</h3>
      )
    }),
    [isDark] // 只有主题变化时才重新声明组件映射
  )

  return (
    <div
      className={cn(
        'markdown-content prose prose-sm dark:prose-invert max-w-none w-full min-w-0 overflow-hidden',
        'prose-headings:scroll-mt-20 prose-headings:font-bold',
        'prose-strong:font-bold prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
        {content}
      </ReactMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
