import { readLastProject } from '@/core/lastProject'
import type { LandingState } from '@/core/navigation'
import { getProjectType } from '@/core/registry'

/**
 * Opening the site at `/` resumes the last project. Run once before the router
 * mounts, so afterwards `/` is simply the landing page and Home and Back work.
 * A reload of a landing page reached through Home stays on it.
 */
export function resumeLastProject() {
  if (window.location.pathname !== '/') return
  const routerState = (window.history.state as { usr?: LandingState } | null)?.usr
  if (routerState?.home) return
  const last = readLastProject()
  const path = last && getProjectType(last.type)?.path
  if (path) window.history.replaceState(null, '', path)
}
