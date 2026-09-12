/**
 * Checks the emitted bit-packed engine against the reference simulator.
 *
 *   node scripts/verify-engine.mjs
 *
 * The generated C cannot be run here — there is no AVR emulator — so instead
 * src/project-types/matrix/lib/optimize/engineModel.ts re-implements the emitted engine in JS,
 * operation for operation, and this diffs every frame it produces against
 * src/project-types/matrix/lib/simulate.ts. That simulator is the behavioural spec: it is
 * byte-per-pixel, far simpler, and was verified function-by-function against
 * the hand-written Matrix*.ino sketches.
 *
 * A mismatch here means the bit-packing, carry propagation, tiling or mirroring
 * in src/project-types/matrix/lib/codegen/engine.ts is wrong.
 *
 * This checks the default emitter only. For the optimisation passes, see
 * scripts/verify-optimizations.mjs, which runs the same corpus per pass.
 */

import { createServer } from 'vite'
import { GRIDS, buildCorpus, diffFrames } from './lib/corpus.mjs'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const sim = await server.ssrLoadModule('/src/project-types/matrix/lib/simulate.ts')
const { sourceCols } = await server.ssrLoadModule('/src/project-types/matrix/lib/grid.ts')
const { runEngine } = await server.ssrLoadModule('/src/project-types/matrix/lib/optimize/engineModel.ts')

const corpus = buildCorpus({ sourceCols })

let compared = 0
const failures = []

for (const { iteration, grid, frames, groups } of corpus) {
  const expected = sim.renderTimeline(frames, groups, grid, 50).map((s) => s.cells)
  const actual = runEngine(frames, groups, grid)
  compared += Math.min(expected.length, actual.length)

  const failure = diffFrames(expected, actual, grid, {
    iteration,
    motions: frames.map((f) => JSON.stringify(f.motion)).join(' | '),
    mirror: frames.map((f) => f.mirror).join(','),
    tiles: frames.map((f) => JSON.stringify(f.tile)).join(' | '),
  })
  if (failure) failures.push(failure)
}

console.log(`${corpus.length} timelines, ${compared} frames compared across ${GRIDS.length} geometries`)
if (failures.length === 0) {
  console.log('PASS — the bit-packed engine matches the reference simulator exactly.')
} else {
  console.log(`FAIL — ${failures.length} mismatching timeline(s):`)
  for (const f of failures.slice(0, 6)) console.log('  ', JSON.stringify(f))
}

await server.close()
process.exit(failures.length === 0 ? 0 : 1)
