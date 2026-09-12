import { useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { Frame, Grid, Group, Project, SerializedProject } from '../types'
import { canHalfWidth, deserialize, resizeCells, serialize, snapToDivisor, sourceCols } from '../lib/grid'
import { normalizeRowColors } from '../lib/colors'
import { normalizeSpeedControl } from '../lib/speed'
import { newFrame, newGroup, starterProject, uid } from './defaults'
import type { Action } from './actions'
import { ProjectContext, type Store } from './context'

const STORAGE_KEY = 'led-pattern-generator:project:v1'
const HISTORY_LIMIT = 60

type State = {
  project: Project
  selectedFrameId: string | null
  past: Project[]
  future: Project[]
}


/** Pushes the current project onto the undo stack and installs the next one. */
function commit(state: State, project: Project): State {
  return {
    ...state,
    project,
    past: [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
  }
}

function mapFrame(project: Project, id: string, fn: (f: Frame) => Frame): Project {
  return { ...project, frames: project.frames.map((f) => (f.id === id ? fn(f) : f)) }
}

/** Rescales every frame, tile and band count when the panel size changes. */
function applyGrid(project: Project, grid: Grid): Project {
  const from = project.grid
  const sc = sourceCols(grid)
  const frames = project.frames.map((frame) => {
    const cells = resizeCells(frame.cells, from, grid)
    const tile =
      frame.tile === 'full'
        ? ('full' as const)
        : {
            yy: snapToDivisor(Math.min(frame.tile.yy, grid.rows), grid.rows),
            // Tiles repeat within the source array, which is narrower in half-width mode.
            xx: snapToDivisor(Math.min(frame.tile.xx, sc), sc),
          }
    let motion = frame.motion
    if (motion.kind === 'band') {
      const bands = motion.directions.length
      if (grid.rows % bands !== 0) {
        const next = snapToDivisor(bands, grid.rows)
        motion = {
          kind: 'band',
          steps: motion.steps,
          directions: Array.from({ length: next }, (_, i) => motion.kind === 'band' && !!motion.directions[i]),
        }
      }
    }
    return { ...frame, cells, tile, motion }
  })
  return { ...project, grid, frames, rowColors: normalizeRowColors(project.rowColors, grid.rows) }
}

function reducer(state: State, action: Action): State {
  const { project } = state

  switch (action.type) {
    case 'setName':
      return commit(state, { ...project, name: action.name })

    case 'setGrid': {
      const rows = Math.max(1, Math.min(64, Math.round(action.grid.rows)))
      const cols = Math.max(1, Math.min(128, Math.round(action.grid.cols)))
      const next: Grid = { rows, cols, halfWidth: action.grid.halfWidth }
      // An odd column count has no half to mirror, so the mode turns itself off.
      if (!canHalfWidth(next)) next.halfWidth = false
      const cur = project.grid
      if (rows === cur.rows && cols === cur.cols && !!next.halfWidth === !!cur.halfWidth) {
        return state
      }
      return commit(state, applyGrid(project, next))
    }

    case 'setHardware':
      return commit(state, { ...project, hardware: { ...project.hardware, ...action.patch } })

    // Speed is one project-level decision with two shapes, so the values for
    // the shape that is off are kept rather than cleared: turning the
    // controller off and on again brings its range and position back.
    case 'setSpeed': {
      const next = { ...project, speed: normalizeSpeedControl({ ...project.speed, ...action.patch }) }
      // Sweeping the controller coalesces into one undo entry, the way a brush
      // stroke does, rather than one per pixel of travel.
      return action.coalesce ? { ...state, project: next } : commit(state, next)
    }

    case 'setRowColors':
      return commit(state, {
        ...project,
        rowColors: normalizeRowColors(action.colors, project.grid.rows),
      })

    // Which optimisations are applied is a property of the project, so it is
    // saved, exported and undoable like anything else the user chose.
    case 'setOptimization':
      return commit(state, { ...project, optimization: action.optimization })

    case 'selectFrame':
      return { ...state, selectedFrameId: action.id }

    case 'addFrame': {
      const frame = newFrame(project.grid, `Frame ${project.frames.length + 1}`)
      const groupId = action.groupId ?? project.groups.at(-1)?.id
      const groups = project.groups.length
        ? project.groups.map((g) =>
            g.id === groupId ? { ...g, frameIds: [...g.frameIds, frame.id] } : g,
          )
        : [newGroup('Sequence 1', [frame.id])]
      const next = commit(state, { ...project, frames: [...project.frames, frame], groups })
      return { ...next, selectedFrameId: frame.id }
    }

    case 'duplicateFrame': {
      const source = project.frames.find((f) => f.id === action.id)
      if (!source) return state
      const copy: Frame = { ...source, id: uid('f'), name: `${source.name} copy`, cells: source.cells.slice() }
      const index = project.frames.findIndex((f) => f.id === action.id)
      const frames = [...project.frames]
      frames.splice(index + 1, 0, copy)
      const groups = project.groups.map((g) => {
        const at = g.frameIds.indexOf(action.id)
        if (at === -1) return g
        const frameIds = [...g.frameIds]
        frameIds.splice(at + 1, 0, copy.id)
        return { ...g, frameIds }
      })
      const next = commit(state, { ...project, frames, groups })
      return { ...next, selectedFrameId: copy.id }
    }

    case 'deleteFrame': {
      const frames = project.frames.filter((f) => f.id !== action.id)
      const groups = project.groups.map((g) => ({
        ...g,
        frameIds: g.frameIds.filter((id) => id !== action.id),
      }))
      const next = commit(state, { ...project, frames, groups })
      return {
        ...next,
        selectedFrameId: state.selectedFrameId === action.id ? (frames[0]?.id ?? null) : state.selectedFrameId,
      }
    }

    case 'updateFrame':
      return commit(state, mapFrame(project, action.id, (f) => ({ ...f, ...action.patch })))

    case 'setCells': {
      const next = mapFrame(project, action.id, (f) => ({ ...f, cells: action.cells }))
      // Coalesce a whole drag stroke into one undo entry.
      return action.coalesce ? { ...state, project: next } : commit(state, next)
    }

    case 'applyDesign':
      return commit(
        state,
        mapFrame(project, action.id, (f) => ({
          ...f,
          cells: action.cells,
          tile: action.tile,
          name: action.name ?? f.name,
        })),
      )

    case 'addGroup': {
      const group = newGroup(`Sequence ${project.groups.length + 1}`)
      return commit(state, { ...project, groups: [...project.groups, group] })
    }

    case 'updateGroup':
      return commit(state, {
        ...project,
        groups: project.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      })

    case 'duplicateGroup': {
      const at = project.groups.findIndex((g) => g.id === action.id)
      if (at === -1) return state
      const source = project.groups[at]
      // The copy gets frames of its own rather than reusing the ids: a frame
      // belongs to one sequence, so sharing them would mean editing, moving or
      // deleting a frame in the original reached into the copy as well. The
      // emitter shares one PROGMEM table between identical patterns, so the
      // copied artwork costs nothing until it is drawn differently.
      const copies = source.frameIds.flatMap((fid) => {
        const frame = project.frames.find((f) => f.id === fid)
        return frame ? [{ ...frame, id: uid('f'), cells: frame.cells.slice() }] : []
      })
      const group: Group = {
        ...source,
        id: uid('g'),
        name: `${source.name} copy`,
        frameIds: copies.map((f) => f.id),
      }
      const groups = [...project.groups]
      groups.splice(at + 1, 0, group)
      // Keep the frame list roughly in timeline order by landing the copies
      // just after the last frame the source sequence plays.
      const last = source.frameIds.reduce(
        (max, fid) => Math.max(max, project.frames.findIndex((f) => f.id === fid)),
        -1,
      )
      const frames = [...project.frames]
      frames.splice(last + 1, 0, ...copies)
      const next = commit(state, { ...project, frames, groups })
      return { ...next, selectedFrameId: copies[0]?.id ?? state.selectedFrameId }
    }

    case 'deleteGroup':
      return commit(state, { ...project, groups: project.groups.filter((g) => g.id !== action.id) })

    case 'moveFrame': {
      const groups = project.groups.map((g) => ({
        ...g,
        frameIds: g.frameIds.filter((id) => id !== action.frameId),
      }))
      const target = groups.find((g) => g.id === action.toGroupId)
      if (!target) return state
      const at = Math.max(0, Math.min(target.frameIds.length, action.toIndex))
      target.frameIds = [...target.frameIds.slice(0, at), action.frameId, ...target.frameIds.slice(at)]
      return commit(state, { ...project, groups })
    }

    case 'moveGroup': {
      const from = project.groups.findIndex((g) => g.id === action.id)
      const to = from + action.delta
      if (from === -1 || to < 0 || to >= project.groups.length) return state
      const groups = [...project.groups]
      const [moved] = groups.splice(from, 1)
      groups.splice(to, 0, moved)
      return commit(state, { ...project, groups })
    }

    case 'moveGroupTo': {
      const from = project.groups.findIndex((g) => g.id === action.id)
      if (from === -1) return state
      const groups = [...project.groups]
      const [moved] = groups.splice(from, 1)
      // toIndex is a slot in the list as the user saw it, with the dragged
      // sequence still in place, so dropping below its old home shifts down one.
      const to = Math.max(0, Math.min(groups.length, action.toIndex > from ? action.toIndex - 1 : action.toIndex))
      if (to === from) return state
      groups.splice(to, 0, moved)
      return commit(state, { ...project, groups })
    }

    case 'loadProject':
      return {
        project: {
          ...action.project,
          rowColors: normalizeRowColors(action.project.rowColors, action.project.grid.rows),
        },
        selectedFrameId: action.project.frames[0]?.id ?? null,
        past: [],
        future: [],
      }

    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
      }
    }

    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        ...state,
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: rest,
      }
    }

    default:
      return state
  }
}

function loadInitial(): State {
  let project = starterProject()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) project = deserialize(JSON.parse(raw) as SerializedProject)
  } catch {
    // Corrupt or absent saved state just falls back to the starter project.
  }
  return { project, selectedFrameId: project.frames[0]?.id ?? null, past: [], future: [] }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(state.project)))
      } catch {
        // Quota or private-mode failures are not worth interrupting the user.
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [state.project])

  const value = useMemo<Store>(
    () => ({
      project: state.project,
      selectedFrameId: state.selectedFrameId,
      selectedFrame: state.project.frames.find((f) => f.id === state.selectedFrameId) ?? null,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      dispatch,
    }),
    [state],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
