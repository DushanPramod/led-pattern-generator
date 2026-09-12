import type { ProjectMeta } from '@/core/projectTypes'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import type { Frame, Grid, Group, Hardware, Project, SpeedControl } from '../types'

export const DEFAULT_GRID: Grid = { rows: 8, cols: 32 }

export const DEFAULT_HARDWARE: Hardware = {
  data1: 2,
  str1: 3,
  clock1: 4,
  data2: 5,
  clock2: 6,
  scanOrder: 'ascending',
  columnDriver: 'direct',
  rowDriver: 'direct',
}

/** The hand-written sketches all read a pot on A0 mapped to 10-500 ms. */
export const DEFAULT_SPEED: SpeedControl = {
  useController: true,
  pin: 'A0',
  minMs: 10,
  maxMs: 500,
  // Mid-travel, so the preview starts somewhere near the middle of the range.
  position: 512,
  stepMs: 50,
}

let counter = 0
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`

export function newFrame(grid: Grid, name: string): Frame {
  return {
    id: uid('f'),
    name,
    cells: new Uint8Array(grid.rows * grid.cols),
    tile: { yy: grid.rows, xx: Math.min(grid.rows, grid.cols) },
    mirror: false,
    preload: false,
    motion: { kind: 'scroll', updown: 1, leftright: 0, steps: grid.rows },
    speedFactor: 1,
    speedMs: null,
  }
}

export function newGroup(name: string, frameIds: string[] = []): Group {
  return { id: uid('g'), name, repeat: 1, frameIds }
}

/** A new project: the default panel with one empty frame ready to draw on. */
export function blankProject(meta: ProjectMeta): Project {
  const grid = DEFAULT_GRID
  const frame = newFrame(grid, 'Frame 1')
  return {
    name: meta.name,
    description: meta.description,
    grid,
    hardware: DEFAULT_HARDWARE,
    speed: DEFAULT_SPEED,
    rowColors: Array.from({ length: grid.rows }, () => DEFAULT_LED_COLOR),
    frames: [frame],
    groups: [newGroup('Sequence 1', [frame.id])],
  }
}
