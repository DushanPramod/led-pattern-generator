/**
 * The shared fuzz corpus.
 *
 * Both verification scripts draw from this, so "passes the corpus" means the
 * same 400 timelines every time and across every optimisation pass. The LCG is
 * seeded, so a failure reported by one script reproduces exactly in the other.
 */

/** Geometries worth covering, including the awkward ones. */
export const GRIDS = [
  { rows: 8, cols: 32 },
  { rows: 16, cols: 48 },
  { rows: 20, cols: 48, halfWidth: true },
  { rows: 16, cols: 32, halfWidth: true },
  { rows: 12, cols: 30 }, // deliberately not a multiple of 8
  { rows: 10, cols: 20 },
  { rows: 8, cols: 12 },
]

export function makeRng(seed = 12345) {
  let state = seed
  return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

const divisors = (n) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0)

function randomFrame(grid, id, rand, sourceCols) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length) % xs.length]
  const sc = sourceCols(grid)
  const tile = rand() < 0.5 ? 'full' : { yy: pick(divisors(grid.rows)), xx: pick(divisors(sc)) }
  // Both band axes, each with the counts that divide the side it runs across.
  const bandAxes = [
    ['horizontal', divisors(grid.rows).filter((n) => n > 1 && n <= 8)],
    ['vertical', divisors(grid.cols).filter((n) => n > 1 && n <= 8)],
  ].filter(([, choices]) => choices.length > 0)
  const kind = pick(['scroll', 'scroll', 'scroll', 'static', bandAxes.length ? 'band' : 'static'])
  let motion
  if (kind === 'static') motion = { kind: 'static', steps: 1 + Math.floor(rand() * 5) }
  else if (kind === 'band') {
    const [axis, choices] = pick(bandAxes)
    const n = pick(choices)
    motion = {
      kind: 'band',
      axis,
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
    speedFactor: 1,
    speedMs: null,
  }
}

/**
 * Builds the corpus. `sourceCols` is injected rather than imported so this file
 * stays plain ESM and the caller keeps ownership of the Vite SSR server.
 */
export function buildCorpus({ sourceCols, count = 400, seed = 12345 }) {
  const rand = makeRng(seed)
  const out = []
  for (let iteration = 0; iteration < count; iteration++) {
    const grid = GRIDS[iteration % GRIDS.length]
    const frameCount = 1 + Math.floor(rand() * 3)
    const frames = Array.from({ length: frameCount }, (_, i) =>
      randomFrame(grid, `f${i}`, rand, sourceCols),
    )
    const groups = [
      { id: 'g', repeat: 1 + Math.floor(rand() * 2), frameIds: frames.map((f) => f.id) },
    ]
    out.push({ iteration, grid, frames, groups })
  }
  return out
}

/**
 * Compares two frame sequences. Returns null when identical, otherwise the
 * first divergence with enough context to reproduce it by hand.
 */
export function diffFrames(expected, actual, grid, context = {}) {
  if (expected.length !== actual.length) {
    return { ...context, reason: `step count ${actual.length} vs ${expected.length}` }
  }
  for (let i = 0; i < expected.length; i++) {
    for (let k = 0; k < expected[i].length; k++) {
      if ((expected[i][k] ? 1 : 0) !== (actual[i][k] ? 1 : 0)) {
        return {
          ...context,
          grid: `${grid.rows}x${grid.cols}${grid.halfWidth ? ' half' : ''}`,
          step: i,
          cell: `r${Math.floor(k / grid.cols)} c${k % grid.cols}`,
        }
      }
    }
  }
  return null
}
