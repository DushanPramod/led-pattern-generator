import { normalizeRowColors } from './colors'
import {
  ADC_RANGE,
  clampFactor,
  clampMs,
  clampPosition,
  normalizeSpeedControl,
  speedRange,
} from './speed'
import { DEFAULT_SPEED } from '../state/defaults'
import type {
  BandAxis,
  Frame,
  Grid,
  Hardware,
  Motion,
  Project,
  SerializedProject,
  SpeedControl,
} from '../types'

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

/**
 * Band counts that split `span` evenly. Capped at 8 because the generated table
 * carries one direction bit per band in a single byte.
 */
export function bandOptions(span: number): number[] {
  return divisors(span).filter((n) => n > 1 && span / n >= 1 && n <= 8)
}

/** What a band motion divides: rows for horizontal bands, columns for vertical. */
export function bandSpan(grid: Grid, axis: BandAxis): number {
  return axis === 'horizontal' ? grid.rows : grid.cols
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
    version: 2,
    frames: project.frames.map((f) => ({ ...f, cells: toBase64(f.cells) })),
  }
}

/**
 * Version 1, where speed lived on the hardware block as a millisecond value per
 * frame. Kept only so saved and exported projects from then still open.
 */
type LegacyProject = Omit<SerializedProject, 'version' | 'speed' | 'hardware' | 'frames'> & {
  version: 1
  speed?: undefined
  hardware: SerializedProject['hardware'] & {
    useSpeedPot?: boolean
    speedPin?: string
    speedMin?: number
    speedMax?: number
    defaultSpeed?: number
  }
  frames: Array<
    Omit<SerializedProject['frames'][number], 'speedFactor' | 'speedMs'> & {
      speed?: number | null
    }
  >
}

/** The knob position that maps to a given delay — the inverse of `potMs()`. */
function positionFor(ms: number, minMs: number, maxMs: number): number {
  if (maxMs === minMs) return 0
  return clampPosition(Math.round(((ms - minMs) * ADC_RANGE) / (maxMs - minMs)))
}

/**
 * Moves a v1 project onto the speed block.
 *
 * The pot is positioned where it would read the old global delay, so a
 * reopened project keeps the timing it was saved with. Per-frame delays need no
 * conversion: they were absolute then and are absolute now.
 */
function migrateSpeed(data: LegacyProject): SpeedControl {
  const hw = data.hardware
  const { minMs, maxMs } = speedRange(hw.speedMin ?? 10, hw.speedMax ?? 500)
  const baseMs = clampMs(hw.defaultSpeed ?? 50)
  const useController = hw.useSpeedPot ?? true
  return {
    useController,
    pin: hw.speedPin ?? 'A0',
    minMs,
    maxMs,
    position: useController ? positionFor(baseMs, minMs, maxMs) : 512,
    stepMs: baseMs,
  }
}

/**
 * A band frame saved before vertical bands existed always striped the rows and
 * rotated them sideways, so that is what a missing axis means.
 */
function normalizeMotion(motion: Motion): Motion {
  if (motion.kind !== 'band') return motion
  return { ...motion, axis: motion.axis === 'vertical' ? 'vertical' : 'horizontal' }
}

export function deserialize(data: SerializedProject | LegacyProject): Project {
  const size = data.grid.rows * data.grid.cols
  const isLegacy = data.version === 1
  const hw = data.hardware
  // Picked field by field so a v1 file's speed keys do not ride along on the
  // hardware block, where nothing would ever read them again.
  const hardware: Hardware = {
    data1: hw.data1,
    str1: hw.str1,
    clock1: hw.clock1,
    data2: hw.data2,
    clock2: hw.clock2,
    scanOrder: hw.scanOrder,
  }

  return {
    ...data,
    hardware,
    // A v2 file always carries one; the fallback covers a hand-edited file.
    speed: normalizeSpeedControl(
      isLegacy ? migrateSpeed(data) : (data.speed ?? DEFAULT_SPEED),
    ),
    // Projects saved before per-row colours existed come back as plain red.
    rowColors: normalizeRowColors(data.rowColors, data.grid.rows),
    frames: data.frames.map((f) => {
      const cells = new Uint8Array(size)
      const decoded = fromBase64(f.cells)
      cells.set(decoded.subarray(0, size))
      // A v1 frame's `speed` was an absolute delay that ignored the dial, which
      // is exactly what `speedMs` is now — so it carries across unchanged
      // rather than being approximated as a factor.
      const stored = f as { speedFactor?: number; speedMs?: number | null; speed?: number | null }
      const speedMs = (isLegacy ? stored.speed : stored.speedMs) ?? null
      return {
        ...f,
        cells,
        motion: normalizeMotion(f.motion),
        speedFactor: clampFactor(stored.speedFactor ?? 1),
        speedMs: speedMs === null ? null : clampMs(speedMs),
      }
    }),
  }
}
