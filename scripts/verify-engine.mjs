/**
 * Checks the emitted bit-packed engine against the reference simulator.
 *
 *   node scripts/verify-engine.mjs
 *
 * The generated C cannot be run here — there is no AVR emulator — so instead
 * this file re-implements the emitted engine in JS, operation for operation,
 * and compares every frame it produces against src/lib/simulate.ts. That
 * simulator is the behavioural spec: it is byte-per-pixel, far simpler, and was
 * verified function-by-function against the hand-written Matrix*.ino sketches.
 *
 * A mismatch here means the bit-packing, carry propagation, tiling or mirroring
 * in src/lib/codegen/engine.ts is wrong. Keep this file in step with it.
 */

import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const sim = await server.ssrLoadModule('/src/lib/simulate.ts')
const { regionOf, sourceCols } = await server.ssrLoadModule('/src/lib/grid.ts')

// ---------------------------------------------------------------------------
// A JS mirror of the emitted C. Each function matches its counterpart exactly.
// ---------------------------------------------------------------------------

function makeEngine(grid) {
  const PANEL_ROWS = grid.rows
  const PANEL_COLS = grid.cols
  const PATTERN_COLS = sourceCols(grid)
  const FRAME_BYTES_PER_ROW = Math.ceil(PANEL_COLS / 8)
  const PATTERN_BYTES_PER_ROW = Math.ceil(PATTERN_COLS / 8)
  const PAD = (8 - (PANEL_COLS % 8)) % 8

  const frameBuffer = Array.from({ length: PANEL_ROWS }, () => new Uint8Array(FRAME_BYTES_PER_ROW))
  const pattern = Array.from({ length: PANEL_ROWS }, () => new Uint8Array(PATTERN_BYTES_PER_ROW))

  const patternPixel = (row, col) => !!(pattern[row][col >> 3] & (0x80 >> (col & 7)))
  const framePixel = (row, col) => !!(frameBuffer[row][col >> 3] & (0x80 >> (col & 7)))
  const setPatternPixel = (row, col, on) => {
    const mask = 0x80 >> (col & 7)
    if (on) pattern[row][col >> 3] |= mask
    else pattern[row][col >> 3] &= ~mask & 0xff
  }
  const setFramePixel = (row, col, on) => {
    const mask = 0x80 >> (col & 7)
    if (on) frameBuffer[row][col >> 3] |= mask
    else frameBuffer[row][col >> 3] &= ~mask & 0xff
  }

  const trimRow = (row) => {
    if (PAD > 0) frameBuffer[row][FRAME_BYTES_PER_ROW - 1] &= (0xff << PAD) & 0xff
  }

  function loadPattern(data, tileRows, tileCols) {
    const stride = Math.ceil(tileCols / 8)
    for (const row of pattern) row.fill(0)
    for (let row = 0; row < tileRows; row++) {
      for (let col = 0; col < tileCols; col++) {
        const packed = data[row * stride + (col >> 3)]
        setPatternPixel(row, col, !!(packed & (0x80 >> (col & 7))))
      }
    }
    for (let row = tileRows; row < PANEL_ROWS; row++) {
      for (let col = 0; col < tileCols; col++) {
        setPatternPixel(row, col, patternPixel(row % tileRows, col))
      }
    }
    for (let col = tileCols; col < PATTERN_COLS; col++) {
      for (let row = 0; row < PANEL_ROWS; row++) {
        setPatternPixel(row, col, patternPixel(row, col % tileCols))
      }
    }
  }

  function mirrorPattern() {
    for (let row = 0; row < PANEL_ROWS; row++) {
      for (let col = 0; col < Math.floor(PATTERN_COLS / 2); col++) {
        setPatternPixel(row, PATTERN_COLS - 1 - col, patternPixel(row, col))
      }
    }
  }

  function writePanelRow(panelRow, patternRow, mirrored) {
    for (let col = 0; col < PANEL_COLS; col++) {
      const source = mirrored && col >= PATTERN_COLS ? PANEL_COLS - 1 - col : col % PATTERN_COLS
      setFramePixel(panelRow, col, patternPixel(patternRow, source))
    }
  }

  function writePanelColumn(panelCol, patternCol) {
    for (let row = 0; row < PANEL_ROWS; row++) {
      setFramePixel(row, panelCol, patternPixel(row, patternCol))
    }
  }

  function fillPanelFromPattern(mirrored) {
    for (let row = 0; row < PANEL_ROWS; row++) writePanelRow(row, row, mirrored)
  }

  const shiftPanelUp = () => {
    for (let row = 0; row + 1 < PANEL_ROWS; row++) frameBuffer[row].set(frameBuffer[row + 1])
  }
  const shiftPanelDown = () => {
    for (let row = PANEL_ROWS - 1; row > 0; row--) frameBuffer[row].set(frameBuffer[row - 1])
  }

  function shiftRowLeft(row) {
    for (let b = 0; b < FRAME_BYTES_PER_ROW; b++) {
      const next = b + 1 < FRAME_BYTES_PER_ROW ? frameBuffer[row][b + 1] : 0
      frameBuffer[row][b] = ((frameBuffer[row][b] << 1) | (next >> 7)) & 0xff
    }
    trimRow(row)
  }

  function shiftRowRight(row) {
    for (let b = FRAME_BYTES_PER_ROW - 1; b >= 0; b--) {
      const previous = b > 0 ? frameBuffer[row][b - 1] : 0
      frameBuffer[row][b] = ((frameBuffer[row][b] >> 1) | ((previous << 7) & 0xff)) & 0xff
    }
    trimRow(row)
  }

  const shiftPanelLeft = () => {
    for (let row = 0; row < PANEL_ROWS; row++) shiftRowLeft(row)
  }
  const shiftPanelRight = () => {
    for (let row = 0; row < PANEL_ROWS; row++) shiftRowRight(row)
  }

  function scrollBands(bandCount, directions) {
    const bandHeight = Math.floor(PANEL_ROWS / bandCount)
    for (let band = 0; band < bandCount; band++) {
      const rightwards = !!(directions & (1 << band))
      for (let offset = 0; offset < bandHeight; offset++) {
        const row = band * bandHeight + offset
        if (rightwards) {
          const carry = framePixel(row, PANEL_COLS - 1)
          shiftRowRight(row)
          setFramePixel(row, 0, carry)
        } else {
          const carry = framePixel(row, 0)
          shiftRowLeft(row)
          setFramePixel(row, PANEL_COLS - 1, carry)
        }
      }
    }
  }

  /** Unpacks the bit-packed frame buffer into one byte per pixel, for diffing. */
  function snapshot() {
    const out = new Uint8Array(PANEL_ROWS * PANEL_COLS)
    for (let r = 0; r < PANEL_ROWS; r++) {
      for (let c = 0; c < PANEL_COLS; c++) out[r * PANEL_COLS + c] = framePixel(r, c) ? 1 : 0
    }
    return out
  }

  return {
    PANEL_ROWS,
    PANEL_COLS,
    PATTERN_COLS,
    loadPattern,
    mirrorPattern,
    writePanelRow,
    writePanelColumn,
    fillPanelFromPattern,
    shiftPanelUp,
    shiftPanelDown,
    shiftPanelLeft,
    shiftPanelRight,
    scrollBands,
    snapshot,
  }
}

/** Packs a frame's authored region the way codegen/designs.ts does. */
function packFrame(frame, grid) {
  const region = regionOf(frame, grid)
  const stride = Math.ceil(region.cols / 8)
  const bytes = new Uint8Array(region.rows * stride)
  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      if (frame.cells[r * grid.cols + c]) bytes[r * stride + (c >> 3)] |= 0x80 >> (c & 7)
    }
  }
  return { bytes, rows: region.rows, cols: region.cols }
}

/** Plays a timeline through the mirror, exactly as playStep()/loop() would. */
function runEngine(frames, groups, grid) {
  const engine = makeEngine(grid)
  const byId = new Map(frames.map((f) => [f.id, f]))
  const out = []

  for (const group of groups) {
    for (let pass = 0; pass < Math.max(1, group.repeat); pass++) {
      for (const id of group.frameIds) {
        const frame = byId.get(id)
        if (!frame) continue
        const packed = packFrame(frame, grid)
        const mirrored = sim.mirrorApplies(frame, grid)

        engine.loadPattern(packed.bytes, packed.rows, packed.cols)
        if (mirrored && !grid.halfWidth) engine.mirrorPattern()
        if (sim.needsPreload(frame)) engine.fillPanelFromPattern(mirrored)

        const motion = frame.motion
        const steps = Math.max(1, motion.steps)
        for (let step = 0; step < steps; step++) {
          if (motion.kind === 'scroll') {
            if (motion.updown > 0) {
              engine.shiftPanelUp()
              engine.writePanelRow(engine.PANEL_ROWS - 1, step % engine.PANEL_ROWS, mirrored)
            }
            if (motion.updown < 0) {
              engine.shiftPanelDown()
              engine.writePanelRow(0, engine.PANEL_ROWS - 1 - (step % engine.PANEL_ROWS), mirrored)
            }
            if (motion.leftright > 0) {
              engine.shiftPanelRight()
              engine.writePanelColumn(0, engine.PATTERN_COLS - 1 - (step % engine.PATTERN_COLS))
            }
            if (motion.leftright < 0) {
              engine.shiftPanelLeft()
              engine.writePanelColumn(engine.PANEL_COLS - 1, step % engine.PATTERN_COLS)
            }
            out.push(engine.snapshot())
          } else if (motion.kind === 'band') {
            // runBands holds first, then moves.
            out.push(engine.snapshot())
            engine.scrollBands(motion.directions.length, bandMask(motion.directions))
          } else {
            out.push(engine.snapshot())
          }
        }
      }
    }
  }
  return out
}

const bandMask = (directions) =>
  directions.reduce((mask, right, i) => mask | (right ? 1 << i : 0), 0)

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

let seed = 12345
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (xs) => xs[Math.floor(rand() * xs.length) % xs.length]

const GRIDS = [
  { rows: 8, cols: 32 },
  { rows: 16, cols: 48 },
  { rows: 20, cols: 48, halfWidth: true },
  { rows: 16, cols: 32, halfWidth: true },
  { rows: 12, cols: 30 }, // deliberately not a multiple of 8
  { rows: 10, cols: 20 },
  { rows: 8, cols: 12 },
]

const divisors = (n) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0)

function randomFrame(grid, id) {
  const sc = sourceCols(grid)
  const tile =
    rand() < 0.5 ? 'full' : { yy: pick(divisors(grid.rows)), xx: pick(divisors(sc)) }
  const bandChoices = divisors(grid.rows).filter((n) => n > 1 && n <= 8)
  const kind = pick(['scroll', 'scroll', 'scroll', 'static', bandChoices.length ? 'band' : 'static'])
  let motion
  if (kind === 'static') motion = { kind: 'static', steps: 1 + Math.floor(rand() * 5) }
  else if (kind === 'band') {
    const n = pick(bandChoices)
    motion = {
      kind: 'band',
      directions: Array.from({ length: n }, () => rand() < 0.5),
      steps: 1 + Math.floor(rand() * 8),
    }
  } else {
    motion = {
      kind: 'scroll',
      updown: pick([-1, 0, 1]),
      leftright: pick([-1, 0, 1]),
      steps: 1 + Math.floor(rand() * 12),
    }
  }
  const cells = new Uint8Array(grid.rows * grid.cols)
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < sc; c++) if (rand() < 0.35) cells[r * grid.cols + c] = 1
  }
  return {
    id,
    name: `F${id}`,
    cells,
    tile,
    mirror: rand() < 0.5,
    preload: rand() < 0.5,
    motion,
    speed: null,
  }
}

let cases = 0
let compared = 0
const failures = []

for (let iteration = 0; iteration < 400; iteration++) {
  const grid = GRIDS[iteration % GRIDS.length]
  const frameCount = 1 + Math.floor(rand() * 3)
  const frames = Array.from({ length: frameCount }, (_, i) => randomFrame(grid, `f${i}`))
  const groups = [{ id: 'g', repeat: 1 + Math.floor(rand() * 2), frameIds: frames.map((f) => f.id) }]

  const expected = sim.renderTimeline(frames, groups, grid, 50).map((s) => s.cells)
  const actual = runEngine(frames, groups, grid)
  cases++

  if (expected.length !== actual.length) {
    failures.push({ iteration, grid, reason: `step count ${actual.length} vs ${expected.length}` })
    continue
  }
  for (let i = 0; i < expected.length; i++) {
    compared++
    let diff = -1
    for (let k = 0; k < expected[i].length; k++) {
      if ((expected[i][k] ? 1 : 0) !== actual[i][k]) {
        diff = k
        break
      }
    }
    if (diff >= 0) {
      failures.push({
        iteration,
        grid: `${grid.rows}x${grid.cols}${grid.halfWidth ? ' half' : ''}`,
        step: i,
        cell: `r${Math.floor(diff / grid.cols)} c${diff % grid.cols}`,
        motions: frames.map((f) => JSON.stringify(f.motion)).join(' | '),
        mirror: frames.map((f) => f.mirror).join(','),
        tiles: frames.map((f) => JSON.stringify(f.tile)).join(' | '),
      })
      break
    }
  }
}

console.log(`${cases} timelines, ${compared} frames compared across ${GRIDS.length} geometries`)
if (failures.length === 0) {
  console.log('PASS — the bit-packed engine matches the reference simulator exactly.')
} else {
  console.log(`FAIL — ${failures.length} mismatching timeline(s):`)
  for (const f of failures.slice(0, 6)) console.log('  ', JSON.stringify(f))
}

await server.close()
process.exit(failures.length === 0 ? 0 : 1)
