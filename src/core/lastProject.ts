import type { ProjectTypeId } from './projectTypes'

const STORAGE_KEY = 'budurasmala:last-project:v1'

/** Which workspace was open last, so a reload or a return visit resumes it. */
export type LastProject = { type: ProjectTypeId; name: string }

/**
 * The matrix editor's autosave key, which predates project types. Someone
 * upgrading has work there but no pointer yet, so it is treated as the last one.
 */
const LEGACY_MATRIX_AUTOSAVE = 'led-pattern-generator:project:v1'

function legacyLastProject(): LastProject | null {
  const raw = localStorage.getItem(LEGACY_MATRIX_AUTOSAVE)
  if (!raw) return null
  const { name } = JSON.parse(raw) as { name?: unknown }
  return { type: 'matrix', name: typeof name === 'string' ? name : 'Untitled' }
}

export function readLastProject(): LastProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return legacyLastProject()
    const parsed = JSON.parse(raw) as Partial<LastProject>
    return typeof parsed.type === 'string' && typeof parsed.name === 'string'
      ? { type: parsed.type, name: parsed.name }
      : null
  } catch {
    return null
  }
}

export function rememberLastProject(last: LastProject) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(last))
  } catch {
    // Private mode or a full quota only costs the resume convenience.
  }
}
