import React from 'react'
import { AgentToolCallBlock, ToolResultMessage } from '@shared/types/agent'
import ToolBlock from '../ToolBlock'

interface ToolInteractionProps {
  blocks: AgentToolCallBlock[]
  allResults?: Map<string, ToolResultMessage>
}

/**
 * 工具调用交互组件
 * 直接渲染 ToolBlock 列表，避免过深的折叠嵌套
 */
const ToolInteraction: React.FC<ToolInteractionProps> = ({ blocks, allResults }) => {
  if (blocks.length === 0) return null

  return (
    <div className="flex flex-col gap-2 my-2 w-full">
      {blocks.map((block, index) => {
        const tid = block.id || (block as { toolCallId?: string }).toolCallId
        const result = tid ? allResults?.get(tid) : undefined

        const resultText = (() => {
          if (!result?.content) return undefined
          if (Array.isArray(result.content)) {
            return result.content
              .map((c) =>
                typeof c === 'string' ? c : (c as { text?: string }).text || JSON.stringify(c)
              )
              .join('\n')
          }
          return String(result.content) || ' '
        })()

        const toolStatus = result
          ? result.isError
            ? ('error' as const)
            : ('success' as const)
          : ('loading' as const)

        return (
          <ToolBlock
            key={tid || `${block.name}-${index}`}
            name={block.name}
            input={block.arguments}
            result={resultText}
            status={toolStatus}
          />
        )
      })}
    </div>
  )
}

export default React.memo(ToolInteraction)
