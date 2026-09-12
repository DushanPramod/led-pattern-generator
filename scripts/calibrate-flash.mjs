/**
 * Fits the offline Flash/SRAM estimate against real arduino-cli compiles.
 *
 *   node scripts/calibrate-flash.mjs [--fqbn arduino:avr:uno]
 *
 * Generates a spread of sketches, compiles each one for real, then solves for
 * the coefficients in FLASH_MODEL (src/lib/codegen/index.ts) by least squares
 * and prints the block to paste back. Re-run it whenever the emitted engine
 * changes shape, otherwise the offline estimate slowly drifts out of date.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const run = promisify(execFile)
const FQBN = process.argv.includes('--fqbn')
  ? process.argv[process.argv.indexOf('--fqbn') + 1]
  : 'arduino:avr:uno'

function cliCandidates() {
  const rel = path.join('resources', 'app', 'lib', 'backend', 'resources')
  const exe = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'
  const home = os.homedir()
  const roots =
    process.platform === 'win32'
      ? [
          path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', 'Arduino IDE'),
          path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Arduino IDE'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Arduino IDE.app/Contents']
        : ['/opt/Arduino IDE', path.join(home, '.local', 'share', 'arduino-ide')]
  return [
    process.env.ARDUINO_CLI_PATH,
    exe,
    ...roots.map((r) => path.join(r, rel, exe)),
  ].filter(Boolean)
}

async function findCli() {
  for (const candidate of cliCandidates()) {
    if (candidate !== 'arduino-cli' && candidate !== 'arduino-cli.exe' && !existsSync(candidate)) continue
    try {
      await run(candidate, ['version'], { timeout: 15_000 })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  throw new Error('arduino-cli not found. Install the Arduino IDE or set ARDUINO_CLI_PATH.')
}

async function compile(cli, sketch, name) {
  const dir = path.join(os.tmpdir(), 'lpg-calibrate', name)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${name}.ino`), sketch, 'utf8')
  let stdout = ''
  try {
    stdout = (await run(cli, ['compile', '--fqbn', FQBN, '--format', 'json', '--no-color', dir], {
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    })).stdout
  } catch (err) {
    stdout = err.stdout ?? ''
  }
  const report = JSON.parse(stdout.slice(stdout.indexOf('{')))
  if (!report.success) throw new Error(`${name} failed to compile:\n${report.compiler_err}`)
  const sections = report.builder_result.executable_sections_size
  return {
    flash: sections.find((s) => s.name === 'text').size,
    sram: sections.find((s) => s.name === 'data').size,
  }
}

/** Solves A·x = b for a small overdetermined system via normal equations. */
function leastSquares(rows, targets) {
  const n = rows[0].length
  const ata = Array.from({ length: n }, () => new Array(n).fill(0))
  const atb = new Array(n).fill(0)
  rows.forEach((row, r) => {
    for (let i = 0; i < n; i++) {
      atb[i] += row[i] * targets[r]
      for (let j = 0; j < n; j++) ata[i][j] += row[i] * row[j]
    }
  })
  // Gaussian elimination with partial pivoting.
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++) if (Math.abs(ata[r][i]) > Math.abs(ata[pivot][i])) pivot = r
    ;[ata[i], ata[pivot]] = [ata[pivot], ata[i]]
    ;[atb[i], atb[pivot]] = [atb[pivot], atb[i]]
    if (Math.abs(ata[i][i]) < 1e-9) continue
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = ata[r][i] / ata[i][i]
      for (let c = i; c < n; c++) ata[r][c] -= f * ata[i][c]
      atb[r] -= f * atb[i]
    }
  }
  return atb.map((v, i) => (Math.abs(ata[i][i]) < 1e-9 ? 0 : v / ata[i][i]))
}

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const cg = await server.ssrLoadModule('/src/lib/codegen/index.ts')
const defaults = await server.ssrLoadModule('/src/state/defaults.ts')
const loopMod = await server.ssrLoadModule('/src/lib/codegen/loop.ts')
const cli = await findCli()
console.log(`arduino-cli: ${cli}\nboard:       ${FQBN}\n`)

/** Deterministic spread of lit pixels, so samples are reproducible. */
function fill(frame, grid, count, seed) {
  const sc = grid.halfWidth ? grid.cols / 2 : grid.cols
  let n = 0
  for (let i = 0; n < count && i < grid.rows * sc; i++) {
    const r = Math.floor(i / sc)
    const c = i % sc
    if ((r * 13 + c * 7 + seed) % 3 !== 0) continue
    frame.cells[r * grid.cols + c] = 1
    n++
  }
}

function build(grid, designCount, pixelsEach, bandKinds, opts = {}) {
  const frames = []
  for (let i = 0; i < designCount; i++) {
    const f = defaults.newFrame(grid, `F${i}`)
    f.tile = opts.tile ?? 'full'
    f.mirror = !!opts.mirror
    fill(f, grid, pixelsEach, i)
    f.motion =
      i < bandKinds
        ? { kind: 'band', directions: Array.from({ length: i === 0 ? 2 : 4 }, (_, k) => k % 2 === 0), steps: 16 }
        : opts.hold
          ? { kind: 'static', steps: 24 }
          : { kind: 'scroll', updown: 1, leftright: 0, steps: grid.rows }
    frames.push(f)
  }
  return {
    name: 'Cal',
    grid,
    hardware: defaults.DEFAULT_HARDWARE,
    speed: defaults.DEFAULT_SPEED,
    frames,
    groups: [defaults.newGroup('G', frames.map((f) => f.id))],
  }
}

/** A handful of patterns replayed over many steps. */
function reuse(grid, patternCount, pixelsEach, stepCount) {
  const project = build(grid, patternCount, pixelsEach, 0)
  const ids = project.frames.map((f) => f.id)
  project.groups = [
    defaults.newGroup('G', Array.from({ length: stepCount }, (_, i) => ids[i % ids.length])),
  ]
  return project
}

const G8 = { rows: 8, cols: 32 }
const G16 = { rows: 16, cols: 48 }
const G20 = { rows: 20, cols: 48, halfWidth: true }

const specs = [
  ['p0', build(G8, 1, 0, 0)],
  ['p16', build(G8, 1, 16, 0)],
  ['p120', build(G8, 1, 120, 0)],
  ['p250', build(G8, 1, 250, 0)],
  ['d5', build(G8, 5, 40, 0)],
  ['d12', build(G8, 12, 40, 0)],
  ['d20', build(G8, 20, 20, 0)],
  ['b1', build(G8, 3, 30, 1)],
  ['b2', build(G8, 4, 30, 2)],
  ['g16', build(G16, 4, 100, 0)],
  ['g16b', build(G16, 6, 60, 1)],
  ['g20h', build(G20, 4, 80, 0)],
  ['g20hb', build(G20, 6, 60, 2)],
  ['many40', build(G8, 40, 30, 0)],
  ['many80', build(G8, 80, 30, 0)],
  ['mirror1', build(G8, 3, 60, 0, { mirror: true })],
  ['mirror2', build(G16, 5, 80, 0, { mirror: true })],
  ['tiled1', build(G8, 4, 40, 0, { tile: { yy: 4, xx: 8 } })],
  ['tiled2', build(G16, 6, 40, 0, { tile: { yy: 8, xx: 16 } })],
  ['hold1', build(G8, 4, 40, 0, 0, { hold: true })],
  ['holdmix', build(G16, 6, 50, 1, { hold: true })],
  ['tilemirror', build(G20, 5, 40, 0, { tile: { yy: 10, xx: 12 }, mirror: true })],
  ['everything', build(G16, 8, 60, 2, { tile: { yy: 8, xx: 12 }, mirror: true })],
  ['reuse25', reuse(G8, 2, 60, 25)],
  ['reuse70', reuse(G8, 3, 60, 70)],
  ['reuse150', reuse(G8, 4, 60, 150)],
]

const rows = []
const flashTargets = []
const sramResiduals = []
const table = []

for (const [name, project] of specs) {
  const sketch = cg.generate(project)
  const est = cg.estimateMemory(project)
  const bands = new Set(
    project.frames.filter((f) => f.motion.kind === 'band').map((f) => f.motion.directions.length),
  ).size
  const real = await compile(cli, sketch.main, name)

  const stepCount = project.groups.reduce((n, g) => n + g.frameIds.length, 0)
  // The engine only emits the pieces a timeline uses, so each one is priced.
  const needs = loopMod.engineNeeds(project.frames, project.grid, project.groups)
  rows.push([
    1,
    est.patternBytes,
    stepCount,
    bands,
    needs.mirrorPattern || needs.mirrorFeed ? 1 : 0,
    needs.tiled ? 1 : 0,
    needs.hold ? 1 : 0,
    needs.scroll ? 1 : 0,
  ])
  flashTargets.push(real.flash)
  // Does our own accounting match what the core actually reports?
  sramResiduals.push(real.sram - est.sramGlobals)
  table.push({ name, bytes: est.patternBytes, designs: project.frames.length, bands, flash: real.flash, sram: real.sram, sramDelta: real.sram - est.sramGlobals })
  process.stdout.write(`  ${name.padEnd(6)} flash=${String(real.flash).padStart(6)}  sram=${String(real.sram).padStart(5)}\n`)
}

console.log('\nsample    bytes designs bands   flash    sram  sramDelta')
for (const t of table) {
  console.log(
    `  ${t.name.padEnd(7)}${String(t.bytes).padStart(5)}${String(t.designs).padStart(7)}` +
    `${String(t.bands).padStart(6)}${String(t.flash).padStart(8)}${String(t.sram).padStart(8)}` +
    `${String(t.sramDelta).padStart(9)}`,
  )
}

const [base, perPatternByte, perStep, perBandKind, mirrorCost, tilingCost, holdCost, scrollCost] =
  leastSquares(rows, flashTargets)
const predict = (r) =>
  base + r[1] * perPatternByte + r[2] * perStep + r[3] * perBandKind +
  r[4] * mirrorCost + r[5] * tilingCost + r[6] * holdCost + r[7] * scrollCost
const errors = rows.map((r, i) => predict(r) - flashTargets[i])
const absErr = errors.map(Math.abs)
const pctErr = errors.map((e, i) => Math.abs(e / flashTargets[i]) * 100)

console.log('\nFlash model fit:')
console.log(`  max error   ${Math.max(...absErr).toFixed(0)} bytes (${Math.max(...pctErr).toFixed(1)}%)`)
console.log(`  mean error  ${(absErr.reduce((a, b) => a + b, 0) / absErr.length).toFixed(0)} bytes`)
console.log('\nSRAM: core overhead beyond our own globals')
console.log(`  residual after SRAM_CORE_OVERHEAD: ${Math.min(...sramResiduals)}..${Math.max(...sramResiduals)} bytes`)

console.log(`\nPaste into src/lib/codegen/index.ts:

export const FLASH_MODEL = {
  base: ${Math.round(base)},
  perPatternByte: ${perPatternByte.toFixed(2)},
  perStep: ${perStep.toFixed(1)},
  perBandKind: ${Math.round(perBandKind)},
  mirrorCost: ${Math.round(mirrorCost)},
  tilingCost: ${Math.round(tilingCost)},
  holdCost: ${Math.round(holdCost)},
  scrollCost: ${Math.round(scrollCost)},
}
export const FLASH_TOLERANCE = ${(Math.max(...pctErr) / 100).toFixed(2)}
export const SRAM_CORE_OVERHEAD = ${cg.SRAM_CORE_OVERHEAD + Math.max(...sramResiduals)}
`)

// The SRAM figure is only exact if our accounting lands on the same constant
// for every geometry — say so plainly rather than assuming it still holds.
console.log(
  new Set(sramResiduals).size === 1
    ? `SRAM: residual ${sramResiduals[0]} in all ${sramResiduals.length} samples — ${sramResiduals[0] === 0 ? 'the offline figure is exact.' : 'adjust SRAM_CORE_OVERHEAD as printed above.'}`
    : `SRAM: residual varied (${Math.min(...sramResiduals)}..${Math.max(...sramResiduals)}) — the offline figure is approximate.`,
)

await server.close()
