import React, { useEffect } from 'react'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { Theme, ThemeProviderContext } from '@renderer/hooks/use-theme'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { config } = useConfigStore()
  const theme = config?.theme || 'light'
  const fontSize = config?.fontSize || 14

  useEffect(() => {
    const root = window.document.documentElement

    const applyTheme = (targetTheme: Theme) => {
      root.classList.remove('light', 'dark')
      if (targetTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        root.classList.add(systemTheme)
      } else {
        root.classList.add(targetTheme)
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    return undefined
  }, [theme])

  useEffect(() => {
    const root = window.document.documentElement
    root.style.fontSize = `${fontSize}px`
  }, [fontSize])

  return <ThemeProviderContext.Provider value={{ theme }}>{children}</ThemeProviderContext.Provider>
}
