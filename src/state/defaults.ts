import { DEFAULT_LED_COLOR } from '../lib/colors'
import type { Frame, Grid, Group, Hardware, Project } from '../types'

export const DEFAULT_GRID: Grid = { rows: 8, cols: 32 }

export const DEFAULT_HARDWARE: Hardware = {
  data1: 2,
  str1: 3,
  clock1: 4,
  data2: 5,
  clock2: 6,
  useSpeedPot: true,
  speedPin: 'A0',
  speedMin: 10,
  speedMax: 500,
  defaultSpeed: 50,
  scanOrder: 'ascending',
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
    speed: null,
  }
}

export function newGroup(name: string, frameIds: string[] = []): Group {
  return { id: uid('g'), name, repeat: 1, frameIds }
}

/** A small starter project so the app is never empty on first load. */
export function starterProject(): Project {
  const grid = DEFAULT_GRID
  const frame = newFrame(grid, 'Hourglass')
  // The 8x8 hourglass from Matrix8x32/D1_13.ino (d7n1).
  const pixels: Array<[number, number]> = [
    [0, 0], [0, 7], [1, 1], [1, 6], [2, 2], [2, 5], [3, 3], [3, 4],
    [4, 3], [4, 4], [5, 2], [5, 5], [6, 1], [6, 6], [7, 0], [7, 7],
  ]
  for (const [r, c] of pixels) frame.cells[r * grid.cols + c] = 1
  frame.tile = { yy: 8, xx: 8 }
  frame.motion = { kind: 'scroll', updown: 1, leftright: 0, steps: 8 }

  const group = newGroup('Scroll up', [frame.id])
  group.repeat = 10

  return {
    name: 'My Pattern',
    grid,
    hardware: DEFAULT_HARDWARE,
    rowColors: Array.from({ length: grid.rows }, () => DEFAULT_LED_COLOR),
    frames: [frame],
    groups: [group],
  }
}
