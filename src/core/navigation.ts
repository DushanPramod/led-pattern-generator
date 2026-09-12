import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { parseProjectFile } from './projectFile'
import type { ProjectFile, ProjectTypeId } from './projectTypes'
import { getProjectType } from './registry'
import { rememberLastProject } from './lastProject'

type IncomingState = { file?: ProjectFile } | null
/** Router state for `/` that means "the user asked for the landing page". */
export type LandingState = { home?: boolean } | null

/** Sends a project to its workspace, which picks it up with `useIncomingProjectFile`. */
export function useOpenProjectFile() {
  const navigate = useNavigate()

  const openFile = useCallback(
    (file: ProjectFile) => {
      const definition = getProjectType(file.type)
      if (!definition) return
      rememberLastProject({ type: file.type, name: file.meta.name })
      navigate(definition.path, { state: { file } satisfies IncomingState })
    },
    [navigate],
  )

  /** Reads a file from disk and opens it; throws a user-readable Error on failure. */
  const openFromDisk = useCallback(
    async (blob: File) => openFile(parseProjectFile(await blob.text())),
    [openFile],
  )

  const goHome = useCallback(
    () => navigate('/', { state: { home: true } satisfies LandingState }),
    [navigate],
  )

  return { openFile, openFromDisk, goHome }
}

/**
 * The project handed to this workspace by the landing page or Open, if any.
 *
 * The value is captured on first render and the router state is cleared, so a
 * reload restores from the workspace's autosave rather than reapplying the file.
 * A file opened while the workspace is already mounted bumps `key` so the
 * caller can remount its store.
 */
export function useIncomingProjectFile(type: ProjectTypeId) {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as IncomingState
  const pending = state?.file?.type === type ? state.file : undefined
  const [incoming, setIncoming] = useState(() => ({ file: pending, key: 0 }))
  if (pending && pending !== incoming.file) setIncoming({ file: pending, key: incoming.key + 1 })

  useEffect(() => {
    if (pending) navigate(location.pathname, { replace: true, state: null })
  }, [pending, navigate, location.pathname])

  return incoming
}
