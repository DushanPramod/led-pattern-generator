import { normalizeRowColors } from './colors'
import type { Frame, Grid, Project, SerializedProject } from '../types'

/**
 * Width of the source array. In half-width mode only the left half is authored
 * and the panel repeats or mirrors it, so everything that indexes the source —
 * tiling, drawing bounds, the row/column feeders — works in these columns.
 */
export function sourceCols(grid: Grid): number {
  return grid.halfWidth ? Math.floor(grid.cols / 2) : grid.cols
}

export function canHalfWidth(grid: Grid): boolean {
  return grid.cols % 2 === 0 && grid.cols >= 2
}

export function divisors(n: number): number[] {
  const out: number[] = []
  for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i)
  return out
}

/** Snaps a tile dimension to the nearest divisor, used when the grid is resized. */
export function snapToDivisor(value: number, n: number): number {
  const list = divisors(n)
  return list.reduce((best, d) => (Math.abs(d - value) < Math.abs(best - value) ? d : best), list[0])
}

/** Band counts that split the rows evenly and leave at least 2 rows per band. */
export function bandOptions(rows: number): number[] {
  return divisors(rows).filter((n) => n > 1 && rows / n >= 1 && n <= 8)
}

/** Re-lays a frame's cells onto a new grid, keeping the top-left content. */
export function resizeCells(cells: Uint8Array, from: Grid, to: Grid): Uint8Array {
  const next = new Uint8Array(to.rows * to.cols)
  const rows = Math.min(from.rows, to.rows)
  const cols = Math.min(from.cols, to.cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) next[r * to.cols + c] = cells[r * from.cols + c]
  }
  return next
}

export function shiftCells(
  cells: Uint8Array,
  grid: Grid,
  dr: number,
  dc: number,
  region: { rows: number; cols: number },
): Uint8Array {
  const next = new Uint8Array(cells.length)
  next.set(cells)
  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) next[r * grid.cols + c] = 0
  }
  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      const sr = (((r - dr) % region.rows) + region.rows) % region.rows
      const sc = (((c - dc) % region.cols) + region.cols) % region.cols
      next[r * grid.cols + c] = cells[sr * grid.cols + sc]
    }
  }
  return next
}

/** The part of the panel the user actually draws on. */
export function regionOf(frame: Frame, grid: Grid) {
  return frame.tile === 'full'
    ? { rows: grid.rows, cols: sourceCols(grid) }
    : { rows: frame.tile.yy, cols: frame.tile.xx }
}

/**
 * Names of the frames that would lose lit cells if the panel shrank to `to`.
 * Panel size is a project-wide setting, so a resize touches every frame at
 * once — this is what the setup panel warns with before it lets one through.
 */
export function framesClippedBy(frames: Frame[], from: Grid, to: Grid): string[] {
  if (to.rows >= from.rows && to.cols >= from.cols) return []
  const out: string[] = []
  for (const frame of frames) {
    let lost = false
    for (let r = 0; r < from.rows && !lost; r++) {
      for (let c = 0; c < from.cols; c++) {
        if ((r >= to.rows || c >= to.cols) && frame.cells[r * from.cols + c]) {
          lost = true
          break
        }
      }
    }
    if (lost) out.push(frame.name)
  }
  return out
}

// --- serialisation ---------------------------------------------------------

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

const fromBase64 = (text: string) => {
  const s = atob(text)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

export function serialize(project: Project): SerializedProject {
  return {
    ...project,
    version: 1,
    frames: project.frames.map((f) => ({ ...f, cells: toBase64(f.cells) })),
  }
}

export function deserialize(data: SerializedProject): Project {
  const size = data.grid.rows * data.grid.cols
  return {
    ...data,
    // Projects saved before per-row colours existed come back as plain red.
    rowColors: normalizeRowColors(data.rowColors, data.grid.rows),
    frames: data.frames.map((f) => {
      const cells = new Uint8Array(size)
      const decoded = fromBase64(f.cells)
      cells.set(decoded.subarray(0, size))
      return { ...f, cells }
    }),
  }
}
