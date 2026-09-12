/**
 * Checks that every optimisation pass leaves the LED output untouched.
 *
 *   node scripts/verify-optimizations.mjs
 *
 * An optimisation may change how the sketch is built; it may never change what
 * the panel shows. So each pass — alone, and combined with the others — plays
 * the shared fuzz corpus through a model of the engine it emits, and the result
 * is diffed frame for frame against src/lib/simulate.ts, which is the fixed
 * oracle and is never adjusted to accommodate a pass.
 *
 * Section 1 asserts the two functions the generator and the oracle *share*,
 * since a bug in those would change both sides identically and slip through
 * every diff below.
 */

import { createServer } from 'vite'
import { GRIDS, buildCorpus } from './lib/corpus.mjs'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const sim = await server.ssrLoadModule('/src/lib/simulate.ts')
const { sourceCols } = await server.ssrLoadModule('/src/lib/grid.ts')
const validate = await server.ssrLoadModule('/src/lib/optimize/validate.ts')
const opts = await server.ssrLoadModule('/src/lib/codegen/options.ts')

let failed = 0
const fail = (msg) => {
  failed++
  console.log(`  FAIL ${msg}`)
}

// ---------------------------------------------------------------------------
// 1. The shared blind spot
//
// codegen/loop.ts imports mirrorApplies and needsPreload FROM simulate.ts, so
// generator and oracle agree on them by construction and an equivalence diff
// can never catch an error in either. These are independent statements of what
// the hand-written sketches do, written from ../Matrix20x48 (half-width mirror)
// and ../Matrix8x32 (preload).
// ---------------------------------------------------------------------------

const scroll = (updown, leftright) => ({ kind: 'scroll', updown, leftright, steps: 4 })
const FULL = { rows: 8, cols: 32 }
const HALF = { rows: 20, cols: 48, halfWidth: true }
const frameWith = (mirror, motion, preload = false) => ({
  id: 'x',
  name: 'x',
  cells: new Uint8Array(1),
  tile: 'full',
  mirror,
  preload,
  motion,
})

console.log('mirrorApplies — reflection is a feed-time trick on half-width panels')
const mirrorCases = [
  // [mirror, grid, motion, expected, why]
  [false, FULL, scroll(1, 0), false, 'flag off'],
  [false, HALF, { kind: 'static', steps: 2 }, false, 'flag off, half-width'],
  [true, FULL, scroll(1, 0), true, 'full-width reflects the pattern buffer itself'],
  [true, FULL, scroll(0, -1), true, 'full-width reflects regardless of direction'],
  [true, FULL, { kind: 'static', steps: 2 }, true, 'full-width, held'],
  [true, HALF, scroll(1, 0), true, 'half-width scrolling up feeds whole rows'],
  [true, HALF, scroll(-1, 0), true, 'half-width scrolling down feeds whole rows'],
  [true, HALF, scroll(1, 1), true, 'half-width diagonal still feeds rows'],
  [true, HALF, scroll(0, -1), false, 'half-width sideways feeds columns, cannot reflect'],
  [true, HALF, scroll(0, 1), false, 'half-width sideways feeds columns, cannot reflect'],
  [true, HALF, { kind: 'static', steps: 2 }, true, 'half-width held reflects on fill'],
  [true, HALF, { kind: 'band', directions: [true, false], steps: 3 }, true, 'half-width bands'],
]
for (const [mirror, grid, motion, expected, why] of mirrorCases) {
  const got = sim.mirrorApplies(frameWith(mirror, motion), grid)
  if (got !== expected) fail(`mirrorApplies ${why}: expected ${expected}, got ${got}`)
}

console.log('needsPreload — only scrolls animate in from an empty panel')
const preloadCases = [
  [scroll(1, 0), false, false, 'scrolling in starts dark'],
  [scroll(1, 0), true, true, 'scroll with preload asked for'],
  [{ kind: 'static', steps: 2 }, false, true, 'a held frame must be on screen'],
  [{ kind: 'static', steps: 2 }, true, true, 'held, preload asked for'],
  [{ kind: 'band', directions: [true], steps: 2 }, false, true, 'bands shift what is already shown'],
  [{ kind: 'band', directions: [true], steps: 2 }, true, true, 'bands, preload asked for'],
]
for (const [motion, preload, expected, why] of preloadCases) {
  const got = sim.needsPreload(frameWith(false, motion, preload))
  if (got !== expected) fail(`needsPreload ${why}: expected ${expected}, got ${got}`)
}
console.log(
  `  ${mirrorCases.length + preloadCases.length} shared-function assertions${failed ? '' : ' OK'}`,
)

// ---------------------------------------------------------------------------
// 2. Equivalence per pass
// ---------------------------------------------------------------------------

const corpus = buildCorpus({ sourceCols })

/** Every candidate worth checking: nothing, each pass alone, and both levels. */
function candidates() {
  const implemented = opts.IMPLEMENTED_PASSES
  const out = [{ name: 'default (no passes)', passes: [] }]
  for (const pass of implemented) out.push({ name: pass, passes: [pass] })
  if (implemented.length > 1) {
    const safe = opts.availablePasses('safe')
    const all = opts.availablePasses('aggressive')
    if (safe.length > 1) out.push({ name: 'level: safe', passes: safe })
    if (all.length > safe.length) out.push({ name: 'level: aggressive', passes: all })
  }
  return out
}

console.log(`\nEquivalence — ${corpus.length} timelines across ${GRIDS.length} geometries`)

for (const candidate of candidates()) {
  const options = opts.optionsFor(candidate.passes)
  let compared = 0
  const failures = []

  for (const { iteration, grid, frames, groups } of corpus) {
    // validateTimeline rebuilds the plan for these options, so a frame whose
    // step points at the wrong shared table shows up here rather than agreeing
    // with its own bytes.
    const result = validate.validateTimeline(frames, groups, grid, 50, options)
    compared += result.compared
    if (!result.ok) {
      failures.push({
        iteration,
        grid: `${grid.rows}x${grid.cols}${grid.halfWidth ? ' half' : ''}`,
        detail: validate.describeResult(result),
        motions: frames.map((f) => JSON.stringify(f.motion)).join(' | '),
        tiles: frames.map((f) => JSON.stringify(f.tile)).join(' | '),
      })
    }
  }

  const label = candidate.name.padEnd(24)
  if (failures.length === 0) {
    console.log(`  ${label} ${String(compared).padStart(5)} frames  identical`)
  } else {
    failed++
    console.log(`  ${label} ${String(compared).padStart(5)} frames  ${failures.length} MISMATCH`)
    for (const f of failures.slice(0, 3)) console.log('     ', JSON.stringify(f))
  }
}

// ---------------------------------------------------------------------------

const pending = opts.ALL_PASSES.filter((p) => !opts.IMPLEMENTED_PASSES.includes(p))
if (pending.length > 0) {
  console.log(`\n${pending.length} pass(es) described but not yet implemented, so not checked:`)
  console.log(`  ${pending.join(', ')}`)
}

console.log(failed === 0 ? '\nPASS' : `\nFAIL — ${failed} problem(s)`)
await server.close()
process.exit(failed === 0 ? 0 : 1)
