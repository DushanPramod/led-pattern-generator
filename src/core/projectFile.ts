import { PROJECT_TYPES, getProjectType } from './registry'
import {
  PROJECT_FILE_FORMAT,
  type ProjectFile,
  type ProjectMeta,
  type ProjectTypeId,
} from './projectTypes'

/** What the file picker offers; old `.ledproj.json` files are plain JSON too. */
export const PROJECT_FILE_ACCEPT = 'application/json,.json'

/** Shown wherever projects are saved or opened while the file format is still settling. */
export const PROJECT_FILE_COMPATIBILITY_WARNING =
  'This app is still under development. The project file format may change, so files saved now are not guaranteed to open in later versions.'

export function buildProjectFile(type: ProjectTypeId, meta: ProjectMeta, data: unknown): ProjectFile {
  return { format: PROJECT_FILE_FORMAT, formatVersion: 1, type, meta, data }
}

export function newProjectFile(type: ProjectTypeId, meta: ProjectMeta): ProjectFile {
  const definition = getProjectType(type)
  if (!definition) throw new Error(`Unknown project type "${type}".`)
  return buildProjectFile(type, meta, definition.createData(meta))
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Reads a saved project, including files from before the shared envelope. */
export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isObject(raw)) throw new Error('That file is not a saved project.')

  if (raw.format === PROJECT_FILE_FORMAT) {
    const definition = typeof raw.type === 'string' ? getProjectType(raw.type) : undefined
    if (!definition) throw new Error('That project was made with a project type this version does not know.')
    if (!definition.isValidData(raw.data)) throw new Error(`That ${definition.label} project file is damaged.`)
    const meta = isObject(raw.meta) ? raw.meta : {}
    return buildProjectFile(
      definition.id,
      {
        name: typeof meta.name === 'string' ? meta.name : 'Untitled',
        description: typeof meta.description === 'string' ? meta.description : '',
      },
      raw.data,
    )
  }

  for (const definition of PROJECT_TYPES) {
    const legacy = definition.fromLegacyFile?.(raw)
    if (legacy) return legacy
  }
  throw new Error('That file is not a saved project.')
}

export function downloadProjectFile(file: ProjectFile) {
  const slug = file.meta.name.trim().replace(/\s+/g, '-').toLowerCase() || 'project'
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug}.budurasmala.json`
  link.click()
  URL.revokeObjectURL(url)
}
