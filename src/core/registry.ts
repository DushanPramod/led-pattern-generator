import { matrixType } from '@/project-types/matrix'
import { pixelType } from '@/project-types/pixel'
import type { ProjectTypeDefinition, ProjectTypeId } from './projectTypes'

/** Every project type, in the order the landing page lists them. */
export const PROJECT_TYPES: readonly ProjectTypeDefinition[] = [matrixType, pixelType]

export function getProjectType(id: string): ProjectTypeDefinition | undefined {
  return PROJECT_TYPES.find((type) => type.id === id)
}

export const DEFAULT_PROJECT_TYPE: ProjectTypeId = 'matrix'
