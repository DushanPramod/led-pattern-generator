import { Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { useTheme } from '../state/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
