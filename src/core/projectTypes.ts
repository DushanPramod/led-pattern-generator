import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * Every kind of circuit the app can generate code for. Adding one means a new
 * folder under `src/project-types/`, a definition exported from it, and an
 * entry here and in `registry.ts`.
 */
export type ProjectTypeId = 'matrix' | 'pixel'

/** What the user tells us about a project, whatever kind of circuit it is. */
export type ProjectMeta = {
  name: string
  description: string
}

/**
 * The saved-project file. The envelope is the same for every project type so a
 * file can be opened from the landing page before we know which editor it needs;
 * `data` is owned entirely by that type.
 */
export type ProjectFile = {
  format: typeof PROJECT_FILE_FORMAT
  formatVersion: 1
  type: ProjectTypeId
  meta: ProjectMeta
  data: unknown
}

export const PROJECT_FILE_FORMAT = 'budurasmala-project'

export interface ProjectTypeDefinition {
  id: ProjectTypeId
  /** Shown in the type dropdown and the workspace header. */
  label: string
  /** One line under the label in the dropdown. */
  summary: string
  /** Route the workspace lives at, e.g. `/matrix`. */
  path: string
  /**
   * The editor. It picks up a newly created or opened project with
   * `useIncomingProjectFile`, and otherwise restores its own autosave.
   */
  Workspace: LazyExoticComponent<ComponentType>
  /** File-ready `data` for a brand-new project. */
  createData(meta: ProjectMeta): unknown
  /** Cheap shape check run when a file claiming this type is opened. */
  isValidData(data: unknown): boolean
  /**
   * Recognises a file saved before the shared envelope existed and wraps it.
   * Only types that predate the envelope need this.
   */
  fromLegacyFile?(raw: unknown): ProjectFile | null
}
