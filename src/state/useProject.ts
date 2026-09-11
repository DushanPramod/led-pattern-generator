import { useCallback, useContext } from 'react'
import type { Frame } from '../types'
import { ProjectContext, type Store } from './context'

export function useProject(): Store {
  const store = useContext(ProjectContext)
  if (!store) throw new Error('useProject must be used inside <ProjectProvider>')
  return store
}

/** Convenience wrapper for patching the frame currently being edited. */
export function useFrameActions(frameId: string | null) {
  const { dispatch } = useProject()
  const update = useCallback(
    (patch: Partial<Omit<Frame, 'id' | 'cells'>>) => {
      if (frameId) dispatch({ type: 'updateFrame', id: frameId, patch })
    },
    [dispatch, frameId],
  )
  const setCells = useCallback(
    (cells: Uint8Array, coalesce = false) => {
      if (frameId) dispatch({ type: 'setCells', id: frameId, cells, coalesce })
    },
    [dispatch, frameId],
  )
  return { update, setCells }
}
