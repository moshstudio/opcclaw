import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Think, ThoughtChain } from '@ant-design/x'
import {
  Message,
  ChatStatus,
  ContentBlock,
  AgentThinkingBlock,
  AgentToolCallBlock,
  AgentTextBlock,
  ToolResultMessage
} from '@shared/types/agent'
import { useTranslation } from 'react-i18next'
import MarkdownRenderer from './MarkdownRenderer'
import { LOADING_DOT_VARIANTS } from './ChatAnimations'
import { Image } from 'antd'
import ToolInteraction from './parts/ToolInteraction'

// ============================================================================
// 1. Sub-Components for Different Block Types
// ============================================================================

/** 思考过程块 */
const ThinkingBlockRenderer: React.FC<{
  block: AgentThinkingBlock
  isTyping?: boolean
  isLastBlock?: boolean
}> = ({ block, isTyping, isLastBlock }) => {
  const { t } = useTranslation()
  const isCurrentlyThinking = isTyping && isLastBlock
  return (
    <Think
      title={isCurrentlyThinking ? t('chat.thinking') : t('chat.thought_process')}
      loading={isCurrentlyThinking}
      blink={isCurrentlyThinking}
      defaultExpanded={isCurrentlyThinking}
    >
      <MarkdownRenderer
        content={block.thinking}
        className="text-muted-foreground/70 dark:text-zinc-400 text-[14px] leading-6"
      />
    </Think>
  )
}

/** 子代理状态块 */
const SubagentBlockRenderer: React.FC<{
  block: Extract<ContentBlock, { type: 'subagent' }>['subagent']
  index: number
}> = ({ block, index }) => {
  const { t } = useTranslation()
  const statusIcon =
    block.status === 'running' ? (
      <LoadingOutlined />
    ) : block.status === 'error' ? (
      <CloseCircleOutlined />
    ) : (
      <CheckCircleOutlined />
    )

  return (
    <ThoughtChain
      items={[
        {
          key: block.runId || index.toString(),
          title: block.label || t('chat.subagent'),
          description: block.task,
          status: block.status === 'running' ? 'loading' : (block.status as any),
          icon: statusIcon,
          content: block.summary ? (
            <div className="p-3 bg-muted/30 rounded-md">
              <MarkdownRenderer
                content={block.summary}
                className="text-muted-foreground/70 dark:text-zinc-400 text-[13px] leading-5"
              />
            </div>
          ) : null,
          collapsible: true
        }
      ]}
      className="my-1"
      line={false}
    />
  )
}

/** 气泡内部加载指示点 */
const BubbleLoadingIndicator: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex gap-1.5 mt-4 mb-1 px-1"
  >
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        custom={i}
        variants={LOADING_DOT_VARIANTS}
        animate="animate"
        className="w-1.5 h-1.5 rounded-full bg-primary/30"
      />
    ))}
  </motion.div>
)

// ============================================================================
// 2. Main Bubble Component
// ============================================================================

interface MessageBubbleProps {
  message: Message
  isTyping?: boolean
  status?: ChatStatus
  allToolResults?: Map<string, ToolResultMessage>
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isTyping,
  status,
  allToolResults
}) => {
  const { content, role } = message
  const isAi = role === 'assistant'

  /** 数据预处理: 确保 content 为 Array */
  const blocks = useMemo(() => {
    return Array.isArray(content)
      ? (content as ContentBlock[])
      : ([{ type: 'text', text: String(content) }] as AgentTextBlock[])
  }, [content])

  /** 渲染内容块主函数 */
  const renderContentBlocks = () => {
    type BlockGroup =
      | { type: 'single'; block: ContentBlock; index: number }
      | { type: 'tools'; blocks: AgentToolCallBlock[]; startIndex: number }

    // 将连续的 ToolCall 归类为一组，按顺序渲染
    const groups = blocks.reduce<BlockGroup[]>((acc, block, i) => {
      if (block.type === 'toolCall') {
        const last = acc[acc.length - 1]
        if (last?.type === 'tools') {
          last.blocks.push(block as AgentToolCallBlock)
        } else {
          acc.push({ type: 'tools', blocks: [block as AgentToolCallBlock], startIndex: i })
        }
      } else {
        acc.push({ type: 'single', block, index: i })
      }
      return acc
    }, [])

    return groups.map((group, groupIdx) => {
      if (group.type === 'tools') {
        return (
          <ToolInteraction
            key={`tools-${group.startIndex}`}
            blocks={group.blocks}
            allResults={allToolResults}
          />
        )
      }

      const { block, index } = group
      switch (block.type) {
        case 'text':
          return (
            <div key={groupIdx} className="prose-container w-full min-w-0">
              <MarkdownRenderer
                content={block.text}
                className={!isAi ? 'text-foreground dark:text-zinc-100' : ''}
              />
            </div>
          )
        case 'thinking':
          return (
            <ThinkingBlockRenderer
              key={groupIdx}
              block={block as AgentThinkingBlock}
              isTyping={isTyping}
              isLastBlock={index === blocks.length - 1}
            />
          )
        case 'image':
          return (
            <div key={groupIdx} className="my-2 rounded-lg overflow-hidden border border-border/50">
              <Image src={block.data} alt="message-img" className="max-w-full h-auto" />
            </div>
          )
        case 'subagent':
          return <SubagentBlockRenderer key={groupIdx} block={block.subagent} index={index} />
        default:
          return null
      }
    })
  }

  // 气泡容器样式
  const bubbleClass = isAi
    ? 'w-full max-w-full rounded-2xl px-5 py-4 bg-zinc-100/40 dark:bg-zinc-800/20 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-700/30 shadow-sm hover:shadow-md transition-all duration-500 ring-1 ring-white/20 dark:ring-white/5'
    : 'max-w-full rounded-2xl px-5 py-4 bg-gradient-to-br from-orange-50/90 to-orange-100/80 dark:from-orange-500/10 dark:to-orange-600/5 backdrop-blur-md border border-orange-200/40 dark:border-orange-500/20 text-foreground dark:text-zinc-100 shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-orange-100/50 dark:ring-orange-900/20'

  return (
    <div
      className={`flex flex-col gap-2 w-full max-w-4xl mx-auto px-6 min-w-0 ${isAi ? '' : 'items-end'}`}
    >
      <div className={bubbleClass}>
        <div className="flex flex-col gap-2">
          {renderContentBlocks()}
          {isAi &&
            isTyping &&
            (status === 'streaming' ||
              status === 'waiting' ||
              status === 'thinking' ||
              status === 'retrying') && <BubbleLoadingIndicator />}
        </div>
      </div>
    </div>
  )
}

export default React.memo(MessageBubble)
