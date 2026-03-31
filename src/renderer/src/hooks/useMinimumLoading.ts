import { useState, useLayoutEffect, useRef } from 'react'

/**
 * Ensures a minimum display duration for a loading state to prevent flickering.
 *
 * @param isLoading Actual loading state from a store or prop
 * @param minDuration Minimum duration in milliseconds (default 800ms)
 * @returns boolean Derived state that stays true for at least minDuration
 */
export function useMinimumLoading(isLoading: boolean, minDuration = 800): boolean {
  const [showLoading, setShowLoading] = useState(isLoading)
  const startTimeRef = useRef<number>(0)

  // Sync upward state change during render
  if (isLoading && !showLoading) {
    setShowLoading(true)
  }

  useLayoutEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now()
    } else if (startTimeRef.current > 0) {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, minDuration - elapsed)

      const timer = setTimeout(() => {
        setShowLoading(false)
        startTimeRef.current = 0
      }, remaining)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [isLoading, minDuration])

  return showLoading
}
