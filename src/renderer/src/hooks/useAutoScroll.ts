import { useEffect, useRef, useState, useCallback } from 'react'

interface UseAutoScrollOptions {
  offset?: number // 距离底部多少像素内判定为触底
  behavior?: ScrollBehavior
}

export const useAutoScroll = (dependency: any, options: UseAutoScrollOptions = {}) => {
  const { offset = 150, behavior = 'smooth' } = options
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAutoScrolling = useRef(false)

  // 检查是否在底部
  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true

    // scrollHeight - scrollTop - clientHeight <= offset
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    return scrollBottom <= offset
  }, [offset])

  // 滚动到底部
  const scrollToBottom = useCallback(
    (forceBehavior?: ScrollBehavior) => {
      const container = scrollContainerRef.current
      if (!container) return

      isAutoScrolling.current = true
      container.scrollTo({
        top: container.scrollHeight,
        behavior: forceBehavior || behavior
      })

      // 滚动完成后更新状态
      setTimeout(() => {
        isAutoScrolling.current = false
        setIsAtBottom(true)
      }, 100)
    },
    [behavior]
  )

  // 监听手动滚动
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (isAutoScrolling.current) return
      const atBottom = checkIsAtBottom()
      if (atBottom !== isAtBottom) {
        setIsAtBottom(atBottom)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkIsAtBottom, isAtBottom])

  // 依赖项变化时自动滚动（如果处于底部）
  useEffect(() => {
    if (isAtBottom) {
      // 使用 requestAnimationFrame 确保在 DOM 更新后滚动
      requestAnimationFrame(() => {
        scrollToBottom('auto')
      })
    }
  }, [dependency, isAtBottom, scrollToBottom])

  return {
    scrollContainerRef,
    isAtBottom,
    scrollToBottom
  }
}
