import { createContext } from 'react'
import type { Frame, Project } from '../types'
import type { Action } from './actions'

export type Store = {
  project: Project
  selectedFrameId: string | null
  selectedFrame: Frame | null
  canUndo: boolean
  canRedo: boolean
  dispatch: (action: Action) => void
}

export const ProjectContext = createContext<Store | null>(null)
