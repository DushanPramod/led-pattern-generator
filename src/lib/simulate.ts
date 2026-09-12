import type { Frame, Grid, Motion } from '../types'
import { sourceCols } from './grid'
import { frameStepMs } from './speed'

/**
 * TypeScript port of the Arduino engine in Matrix8x32/Matrix8x32.ino, plus the
 * half-width source variant from Matrix20x48/Matrix20x48.ino.
 *
 * The preview runs THIS kernel rather than an idealised animation, so what the
 * user sees on screen is what the generated sketch does on the panel. Keep every
 * function below byte-for-byte equivalent to its counterpart in codegen/engine.ts.
 *
 * Source buffers are always allocated rows x cols; in half-width mode only the
 * leading sourceCols(grid) columns carry meaning.
 */

export type Buffer = Uint8Array

export const idx = (grid: Grid, r: number, c: number) => r * grid.cols + c

export function makeBuffer(grid: Grid): Buffer {
  return new Uint8Array(grid.rows * grid.cols)
}

/** clear8x32() / clear20x24() */
export function clearBuffer(buf: Buffer) {
  buf.fill(0)
}

/**
 * copyToMain(yy, xx) — tiles the top-left yy x xx block IN PLACE across the
 * source array: first down the leading xx columns, then across the source width.
 * Uses integer division, so yy must divide rows and xx must divide the source width.
 */
export function copyToMain(a: Buffer, grid: Grid, yy: number, xx: number) {
  const { rows } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < yy; i++) {
    for (let j = 0; j < xx; j++) {
      for (let r = 1; r < Math.floor(rows / yy); r++) {
        a[idx(grid, i + r * yy, j)] = a[idx(grid, i, j)]
      }
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < xx; j++) {
      for (let r = 1; r < Math.floor(sc / xx); r++) {
        a[idx(grid, i, j + r * xx)] = a[idx(grid, i, j)]
      }
    }
  }
}

/**
 * copyToMainFull() — pushes the source into mainarray. In half-width mode the
 * half is repeated across both halves, or reflected when `mirrored` is set
 * (copyToMainFullMirror()).
 */
export function copyToMainFull(a: Buffer, m: Buffer, grid: Grid, mirrored = false) {
  if (!grid.halfWidth) {
    m.set(a)
    return
  }
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < sc; c++) {
      const v = a[idx(grid, r, c)]
      m[idx(grid, r, c)] = v
      m[idx(grid, r, mirrored ? cols - 1 - c : sc + c)] = v
    }
  }
}

/** mirror() — full-width only; half-width panels reflect at feed time instead. */
export function mirror(a: Buffer, grid: Grid) {
  const { rows, cols } = grid
  const half = Math.floor(cols / 2)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < half; j++) {
      a[idx(grid, i, cols - 1 - j)] = a[idx(grid, i, j)]
    }
  }
}

export function up(m: Buffer, grid: Grid) {
  const { rows, cols } = grid
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) m[idx(grid, i, j)] = m[idx(grid, i + 1, j)]
  }
}

export function down(m: Buffer, grid: Grid) {
  const { rows, cols } = grid
  for (let i = rows - 1; i > 0; i--) {
    for (let j = 0; j < cols; j++) m[idx(grid, i, j)] = m[idx(grid, i - 1, j)]
  }
}

export function moveLeft(m: Buffer, grid: Grid) {
  const { rows, cols } = grid
  for (let j = 0; j < cols - 1; j++) {
    for (let i = 0; i < rows; i++) m[idx(grid, i, j)] = m[idx(grid, i, j + 1)]
  }
}

export function moveRight(m: Buffer, grid: Grid) {
  const { rows, cols } = grid
  for (let j = cols - 1; j > 0; j--) {
    for (let i = 0; i < rows; i++) m[idx(grid, i, j)] = m[idx(grid, i, j - 1)]
  }
}

// The four feeders below index the source modulo its own size, which is what
// makes a short pattern scroll endlessly. In half-width mode that modulo is the
// half width, so the row repeats across the panel as it arrives.

export function setBottomRow(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < cols; i++) m[idx(grid, rows - 1, i)] = a[idx(grid, x % rows, i % sc)]
}

/** setbottomrowMirror() — left half as drawn, right half reflected. */
export function setBottomRowMirror(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < sc; i++) {
    const v = a[idx(grid, x % rows, i)]
    m[idx(grid, rows - 1, i)] = v
    m[idx(grid, rows - 1, cols - 1 - i)] = v
  }
}

export function setTopRow(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < cols; i++) {
    m[idx(grid, 0, i)] = a[idx(grid, rows - 1 - (x % rows), i % sc)]
  }
}

export function setTopRowMirror(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < sc; i++) {
    const v = a[idx(grid, rows - 1 - (x % rows), i)]
    m[idx(grid, 0, i)] = v
    m[idx(grid, 0, cols - 1 - i)] = v
  }
}

export function setLeftColumn(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < rows; i++) m[idx(grid, i, 0)] = a[idx(grid, i, sc - 1 - (x % sc))]
}

export function setRightColumn(m: Buffer, a: Buffer, grid: Grid, x: number) {
  const { rows, cols } = grid
  const sc = sourceCols(grid)
  for (let i = 0; i < rows; i++) m[idx(grid, i, cols - 1)] = a[idx(grid, i, x % sc)]
}

/**
 * multidirection() — splits the rows into directions.length equal bands, each
 * scrolling left (false) or right (true) with wraparound, operating on mainarray.
 */
export function multidirection(m: Buffer, grid: Grid, directions: boolean[]) {
  const { rows, cols } = grid
  const bands = directions.length
  const h = Math.floor(rows / bands)
  for (let rr = 0; rr < bands; rr++) {
    const temp = new Uint8Array(h)
    if (!directions[rr]) {
      for (let i = 0; i < h; i++) temp[i] = m[idx(grid, i + rr * h, 0)]
      for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < h; j++) {
          m[idx(grid, j + rr * h, i)] = m[idx(grid, j + rr * h, i + 1)]
        }
      }
      for (let i = 0; i < h; i++) m[idx(grid, i + rr * h, cols - 1)] = temp[i]
    } else {
      for (let i = 0; i < h; i++) temp[i] = m[idx(grid, i + rr * h, cols - 1)]
      for (let i = cols - 1; i > 0; i--) {
        for (let j = 0; j < h; j++) {
          m[idx(grid, j + rr * h, i)] = m[idx(grid, j + rr * h, i - 1)]
        }
      }
      for (let i = 0; i < h; i++) m[idx(grid, i + rr * h, 0)] = temp[i]
    }
  }
}

/**
 * The same split turned a quarter turn: the columns are divided into
 * directions.length equal bands, each rotating up (false) or down (true) with
 * wraparound.
 */
export function multidirectionVertical(m: Buffer, grid: Grid, directions: boolean[]) {
  const { rows, cols } = grid
  const bands = directions.length
  const w = Math.floor(cols / bands)
  for (let cc = 0; cc < bands; cc++) {
    const temp = new Uint8Array(w)
    if (!directions[cc]) {
      for (let i = 0; i < w; i++) temp[i] = m[idx(grid, 0, i + cc * w)]
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < w; j++) {
          m[idx(grid, i, j + cc * w)] = m[idx(grid, i + 1, j + cc * w)]
        }
      }
      for (let i = 0; i < w; i++) m[idx(grid, rows - 1, i + cc * w)] = temp[i]
    } else {
      for (let i = 0; i < w; i++) temp[i] = m[idx(grid, rows - 1, i + cc * w)]
      for (let i = rows - 1; i > 0; i--) {
        for (let j = 0; j < w; j++) {
          m[idx(grid, i, j + cc * w)] = m[idx(grid, i - 1, j + cc * w)]
        }
      }
      for (let i = 0; i < w; i++) m[idx(grid, 0, i + cc * w)] = temp[i]
    }
  }
}

// ---------------------------------------------------------------------------
// Timeline rendering
// ---------------------------------------------------------------------------

/**
 * Reflection is applied at feed time on a half-width panel, and to the source
 * array itself on a full-width one — so only vertical scrolls can mirror in
 * half-width mode, where each fed row spans the whole panel.
 */
export function mirrorIsFeedTime(grid: Grid): boolean {
  return !!grid.halfWidth
}

export function mirrorApplies(frame: Frame, grid: Grid): boolean {
  if (!frame.mirror) return false
  if (!grid.halfWidth) return true
  return frame.motion.kind !== 'scroll' || frame.motion.updown !== 0
}

/** Cells outside the tile region are ignored, exactly as codegen emits them. */
export function sourceFor(frame: Frame, grid: Grid): Buffer {
  const a = makeBuffer(grid)
  const sc = sourceCols(grid)
  if (frame.tile === 'full') {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < sc; c++) a[idx(grid, r, c)] = frame.cells[idx(grid, r, c)]
    }
  } else {
    const { yy, xx } = frame.tile
    for (let i = 0; i < yy; i++) {
      for (let j = 0; j < xx; j++) a[idx(grid, i, j)] = frame.cells[idx(grid, i, j)]
    }
    copyToMain(a, grid, yy, xx)
  }
  if (frame.mirror && !grid.halfWidth) mirror(a, grid)
  return a
}

/** What the panel shows once the source is pushed out in full — for previews. */
export function panelView(frame: Frame, grid: Grid): Buffer {
  const a = sourceFor(frame, grid)
  const m = makeBuffer(grid)
  copyToMainFull(a, m, grid, mirrorApplies(frame, grid))
  return m
}

export function motionSteps(motion: Motion): number {
  return Math.max(1, motion.steps)
}

/** True when the frame must push its source into mainarray before animating. */
export function needsPreload(frame: Frame): boolean {
  return frame.motion.kind !== 'scroll' || frame.preload
}

/**
 * Advances `m` by one step of `motion`. `step` is the loop counter `hh`/`z` from
 * pt()/pt_2() and drives the modulo indexing of the row/column feeders.
 */
export function advance(
  m: Buffer,
  a: Buffer,
  grid: Grid,
  motion: Motion,
  step: number,
  mirrored: boolean,
) {
  if (motion.kind === 'static') return
  if (motion.kind === 'band') {
    if (motion.axis === 'vertical') multidirectionVertical(m, grid, motion.directions)
    else multidirection(m, grid, motion.directions)
    return
  }
  if (motion.updown === 1) {
    up(m, grid)
    if (mirrored) setBottomRowMirror(m, a, grid, step)
    else setBottomRow(m, a, grid, step)
  }
  if (motion.updown === -1) {
    down(m, grid)
    if (mirrored) setTopRowMirror(m, a, grid, step)
    else setTopRow(m, a, grid, step)
  }
  if (motion.leftright === 1) {
    moveRight(m, grid)
    setLeftColumn(m, a, grid, step)
  }
  if (motion.leftright === -1) {
    moveLeft(m, grid)
    setRightColumn(m, a, grid, step)
  }
}

export type RenderedStep = {
  cells: Buffer
  frameId: string
  frameName: string
  /** Hold time in ms for this step. */
  delay: number
  groupId: string
  iteration: number
}

/** Expands the groups/frames timeline into the exact sequence of panel states. */
export function renderTimeline(
  frames: Frame[],
  groups: { id: string; repeat: number; frameIds: string[] }[],
  grid: Grid,
  baseSpeed: number,
  maxSteps = 4000,
): RenderedStep[] {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const m = makeBuffer(grid)
  const out: RenderedStep[] = []

  for (const group of groups) {
    for (let it = 0; it < Math.max(1, group.repeat); it++) {
      for (const fid of group.frameIds) {
        const frame = byId.get(fid)
        if (!frame) continue
        const a = sourceFor(frame, grid)
        const mirrored = mirrorApplies(frame, grid)
        if (needsPreload(frame)) copyToMainFull(a, m, grid, mirrored)
        const steps = motionSteps(frame.motion)
        // The same integer maths the sketch does, so the preview holds each
        // step for exactly as long as the panel will.
        const delay = frameStepMs(baseSpeed, frame)
        // The two motion families render at opposite ends of a step, and the
        // generated C is the authority on which. runScroll() shifts and feeds a
        // row, *then* holds; runBands() holds first and shifts afterwards, so
        // its first visible frame is the unshifted one.
        const rendersBeforeMoving = frame.motion.kind === 'band'
        for (let s = 0; s < steps; s++) {
          if (!rendersBeforeMoving) advance(m, a, grid, frame.motion, s, mirrored)
          out.push({
            cells: m.slice(),
            frameId: frame.id,
            frameName: frame.name,
            delay,
            groupId: group.id,
            iteration: it,
          })
          if (rendersBeforeMoving) advance(m, a, grid, frame.motion, s, mirrored)
          if (out.length >= maxSteps) return out
        }
      }
    }
  }
  return out
}
