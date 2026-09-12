import { lazy } from 'react'
import { buildProjectFile } from '@/core/projectFile'
import type { ProjectTypeDefinition } from '@/core/projectTypes'
import { serialize } from './lib/grid'
import { blankProject } from './state/defaults'

/** A saved matrix project's `data` block, checked just enough to hand to `deserialize`. */
function isMatrixData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const { grid, frames } = data as { grid?: { rows?: unknown; cols?: unknown }; frames?: unknown }
  return typeof grid?.rows === 'number' && typeof grid.cols === 'number' && Array.isArray(frames)
}

export const matrixType: ProjectTypeDefinition = {
  id: 'matrix',
  label: 'Matrix Budurasmala',
  summary: 'Shift-register LED matrix panel, drawn frame by frame',
  path: '/matrix',
  Workspace: lazy(() => import('./MatrixWorkspace')),
  createData: (meta) => serialize(blankProject(meta)),
  isValidData: isMatrixData,
  // Files saved by the single-purpose LED Pattern Generator were the bare
  // serialized project, with no envelope around it.
  fromLegacyFile: (raw) => {
    if (!isMatrixData(raw)) return null
    const { name, description } = raw as { name?: unknown; description?: unknown }
    return buildProjectFile(
      'matrix',
      {
        name: typeof name === 'string' ? name : 'Untitled',
        description: typeof description === 'string' ? description : '',
      },
      raw,
    )
  },
}
