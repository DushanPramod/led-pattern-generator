import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'led-pattern-generator:theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (storedTheme()) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      toggle: () =>
        setTheme((current) => {
          const next = current === 'dark' ? 'light' : 'dark'
          localStorage.setItem(STORAGE_KEY, next)
          return next
        }),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
