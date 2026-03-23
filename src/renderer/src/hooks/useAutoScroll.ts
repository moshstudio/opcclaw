import { useEffect, useRef, useState, useCallback } from 'react'

interface UseAutoScrollOptions {
  offset?: number // 距离底部多少像素内判定为触底
  behavior?: ScrollBehavior
}

export const useAutoScroll = (dependency: any, options: UseAutoScrollOptions = {}) => {
  const { offset = 150, behavior = 'auto' } = options
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const rafId = useRef<number | null>(null)

  // 检查是否在底部
  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true

    // scrollHeight - scrollTop - clientHeight <= offset
    // 增加 2px 的超小容差以应对浏览器浮点数计算导致的判定失效
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    return scrollBottom <= offset + 2
  }, [offset])

  // 滚动到底部
  const scrollToBottom = useCallback(
    (forceBehavior?: ScrollBehavior) => {
      const container = scrollContainerRef.current
      if (!container) return

      container.scrollTo({
        top: container.scrollHeight,
        behavior: forceBehavior || behavior
      })
    },
    [behavior]
  )

  // 监听手动滚动
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      setIsAtBottom(checkIsAtBottom())
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkIsAtBottom])

  // 使用 ResizeObserver 监听内容变化 (应对动画和流式输出)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      // 关键：这里不仅依赖之前的 isAtBottom 状态，还实时检查一次。
      // 只要当前位置在阈值内，内容增长时就应该跟随。
      if (isAtBottom || checkIsAtBottom()) {
        if (rafId.current) cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => {
          scrollToBottom('auto')
          // 滚动后立即更新状态
          setIsAtBottom(true)
        })
      }
    })

    const content = container.firstElementChild
    if (content) {
      observer.observe(content)
    }

    return () => {
      observer.disconnect()
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [isAtBottom, scrollToBottom, checkIsAtBottom])

  // 依赖项变化时自动滚动 (比如切换会话或收到新消息)
  useEffect(() => {
    if (isAtBottom || checkIsAtBottom()) {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(() => {
        scrollToBottom('auto')
        setIsAtBottom(true)
      })
    }
  }, [dependency, isAtBottom, scrollToBottom, checkIsAtBottom])

  return {
    scrollContainerRef,
    isAtBottom,
    scrollToBottom
  }
}
