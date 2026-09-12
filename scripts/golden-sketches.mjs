/**
 * Dumps the generated sketch for a fixed corpus of projects, with a hash.
 *
 * Optimisation work must not change the default output, so this is the anchor:
 * run it before a change and after, and diff. Only `generate(project)` is used,
 * with one argument, so the same script runs against an older checkout.
 *
 *   node scripts/golden-sketches.mjs            # print hashes
 *   node scripts/golden-sketches.mjs --full     # print every sketch
 */
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const { generate } = await server.ssrLoadModule('/src/lib/codegen/index.ts')
const { DEFAULT_HARDWARE, DEFAULT_SPEED } = await server.ssrLoadModule('/src/state/defaults.ts')

const HARDWARE = { ...DEFAULT_HARDWARE }
const SPEED = { ...DEFAULT_SPEED }

/** Deterministic ids — the corpus must hash the same on every run. */
let n = 0
const frame = (grid, name, paint, extra = {}) => {
  const cells = new Uint8Array(grid.rows * grid.cols)
  paint(cells, grid)
  return {
    id: `f${n++}`,
    name,
    cells,
    tile: 'full',
    mirror: false,
    preload: false,
    motion: { kind: 'scroll', updown: 1, leftright: 0, steps: grid.rows },
    speedFactor: 1,
    speedMs: null,
    ...extra,
  }
}

const checker = (cells, grid) => {
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++) if ((r + c) % 2 === 0) cells[r * grid.cols + c] = 1
}
const diagonal = (cells, grid) => {
  for (let r = 0; r < grid.rows; r++) cells[r * grid.cols + (r % grid.cols)] = 1
}
const hourglass = (cells, grid) => {
  for (let r = 0; r < 8; r++) {
    cells[r * grid.cols + r] = 1
    cells[r * grid.cols + (7 - r)] = 1
  }
}
const blank = () => {}

const project = (name, grid, frames, groups) => ({
  name,
  grid,
  hardware: HARDWARE,
  speed: SPEED,
  rowColors: Array.from({ length: grid.rows }, () => '#ff3b30'),
  frames,
  groups,
})

const G8 = { rows: 8, cols: 32 }
const G16 = { rows: 16, cols: 48 }
const GHALF = { rows: 20, cols: 48, halfWidth: true }
const GODD = { rows: 12, cols: 30 }

function corpus() {
  n = 0
  const out = []

  {
    const f = frame(G8, 'Hourglass', hourglass, { tile: { yy: 8, xx: 8 } })
    out.push(project('Starter', G8, [f], [{ id: 'g0', name: 'Scroll up', repeat: 10, frameIds: [f.id] }]))
  }
  {
    const a = frame(G16, 'Checker', checker)
    const b = frame(G16, 'Diagonal', diagonal, { motion: { kind: 'static', steps: 4 }, preload: true })
    out.push(project('Mixed', G16, [a, b], [{ id: 'g0', name: 'Both', repeat: 2, frameIds: [a.id, b.id] }]))
  }
  {
    const a = frame(GHALF, 'HalfMirror', diagonal, { mirror: true })
    out.push(project('HalfWidth', GHALF, [a], [{ id: 'g0', name: 'Run', repeat: 1, frameIds: [a.id] }]))
  }
  {
    const a = frame(GODD, 'Bands', checker, {
      motion: { kind: 'band', axis: 'horizontal', directions: [true, false, true, false], steps: 6 },
    })
    out.push(project('OddCols', GODD, [a], [{ id: 'g0', name: 'Bands', repeat: 3, frameIds: [a.id] }]))
  }
  {
    // Duplicates, a blank and a mirror pair — what the optimizer will chew on.
    const a = frame(G8, 'Twin A', hourglass, { tile: { yy: 8, xx: 8 } })
    const b = frame(G8, 'Twin B', hourglass, { tile: { yy: 8, xx: 8 } })
    const dark = frame(G8, 'Dark', blank, { tile: { yy: 8, xx: 8 }, motion: { kind: 'static', steps: 2 } })
    const d = frame(G8, 'Slope', diagonal, { tile: { yy: 8, xx: 8 } })
    out.push(
      project('Redundant', G8, [a, b, dark, d], [
        { id: 'g0', name: 'All', repeat: 1, frameIds: [a.id, b.id, dark.id, d.id] },
      ]),
    )
  }

  return out
}

const full = process.argv.includes('--full')
let combined = ''
for (const p of corpus()) {
  const sketch = generate(p)
  const hash = createHash('sha256').update(sketch.main).digest('hex').slice(0, 16)
  combined += sketch.main
  console.log(`${p.name.padEnd(12)} ${String(sketch.main.length).padStart(6)} B  ${hash}`)
  if (full) console.log(sketch.main)
}
console.log(`\nCORPUS ${createHash('sha256').update(combined).digest('hex')}`)

await server.close()
