import { House } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOpenProjectFile } from '@/core/navigation'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/button'

/**
 * The bar across the top of every page. Workspaces pass their project name and
 * type as the title, and their own actions (undo, save, …) as children.
 */
export function AppHeader({
  title,
  subtitle,
  showHome = true,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  showHome?: boolean
  children?: ReactNode
}) {
  const { goHome } = useOpenProjectFile()
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {showHome && (
          <Button type="button" variant="ghost" size="icon" onClick={goHome} title="Home — new or open project">
            <House />
          </Button>
        )}
        <h1 className="m-0 flex min-w-0 items-baseline gap-2.5 text-xl">
          <span className="truncate">{title}</span>
          {subtitle && (
            <small className="text-[0.8rem] font-normal text-muted-foreground">{subtitle}</small>
          )}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <ThemeToggle />
      </div>
    </header>
  )
}
