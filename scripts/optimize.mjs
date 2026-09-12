/**
 * Finds the smallest build of a project, by compiling candidates and measuring.
 *
 *   node scripts/optimize.mjs                            # the built-in sample projects
 *   node scripts/optimize.mjs --project my.ledproj.json
 *   node scripts/optimize.mjs --level safe --budget 40 --fqbn arduino:avr:uno
 *
 * Every candidate is checked against the reference simulator before it is
 * compiled, so the chosen build is guaranteed to light the same LEDs in the
 * same order as the original.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { buildProjects } from './lib/projects.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}

const FQBN = arg('fqbn', 'arduino:avr:uno')
const LEVEL = arg('level', 'aggressive')
const BUDGET = Number(arg('budget', '60'))
const PROJECT_FILE = arg('project', null)

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const cg = await server.ssrLoadModule('/src/project-types/matrix/lib/codegen/index.ts')
const opts = await server.ssrLoadModule('/src/project-types/matrix/lib/codegen/options.ts')
const searchMod = await server.ssrLoadModule('/src/project-types/matrix/lib/optimize/search.ts')
const gridMod = await server.ssrLoadModule('/src/project-types/matrix/lib/grid.ts')
const { DEFAULT_HARDWARE, DEFAULT_SPEED } = await server.ssrLoadModule('/src/project-types/matrix/state/defaults.ts')
const boards = await server.ssrLoadModule('/src/lib/arduino/boards.ts')
const cliCore = await server.ssrLoadModule('/plugins/arduinoCliCore.ts')

const cli = await cliCore.findCli()
if (!cli) {
  console.error('arduino-cli not found. Set ARDUINO_CLI_PATH, or install the Arduino IDE.')
  await server.close()
  process.exit(2)
}

const projects = PROJECT_FILE
  ? [gridMod.deserialize(JSON.parse(readFileSync(PROJECT_FILE, 'utf8')))]
  : buildProjects(DEFAULT_HARDWARE, DEFAULT_SPEED)

const board = boards.FALLBACK_BOARDS.find((b) => b.fqbn === FQBN)
const limits = board ? { flashMax: board.flashMax, sramMax: board.sramMax } : undefined

console.log(`arduino-cli ${cli.version}  —  ${FQBN}  —  level: ${LEVEL}, budget: ${BUDGET}\n`)

const pad = (s, n) => String(s).padEnd(n)
const signed = (n) => (n > 0 ? `+${n}` : String(n))

let anyFailed = false

for (const project of projects) {
  console.log(`── ${project.name} ${'─'.repeat(Math.max(0, 56 - project.name.length))}`)

  /** Compiles a round, four at a time. */
  const measure = async (requests) => {
    const jobs = requests.map((r) => ({
      id: r.id,
      sketch: cg.generate(project, opts.optionsFor(r.passes)).main,
      fqbn: FQBN,
      name: project.name,
    }))
    const results = await cliCore.compileMany(cli, jobs, { concurrency: 4 })
    return results.map(({ id, result }) => ({
      id,
      ok: result.ok,
      flash: result.flash,
      sram: result.sram,
      error: result.error,
    }))
  }

  const outcome = await searchMod.searchOptimizations(project, measure, {
    level: LEVEL,
    budget: BUDGET,
    limits,
    onProgress: (t) => {
      const delta =
        t.ok && t.deltaSram !== null
          ? `SRAM ${pad(signed(t.deltaSram), 6)} flash ${pad(signed(t.deltaFlash), 7)}`
          : t.ok
            ? `SRAM ${pad(t.sram, 6)} flash ${pad(t.flash, 7)}`
            : `FAILED — ${t.note}`
      console.log(`   ${pad(t.round, 9)} ${pad(t.label, 44)} ${delta}`)
    },
  })

  const a = outcome.analysis
  console.log(
    `\n   frames ${a.frames}, distinct tables ${a.distinctTables}, ` +
      `${a.totalPatternBytes} B of artwork${a.redundantBytes ? `, ${a.redundantBytes} B duplicated` : ''}`,
  )
  for (const p of outcome.applicability.filter((x) => !x.applicable)) {
    console.log(`   not tried: ${p.pass} — ${p.reason}`)
  }
  for (const s of outcome.skipped) {
    console.log(`   skipped ${s.passes.join('+') || '(none)'} — ${s.reason}`)
  }

  if (!outcome.best || !outcome.baseline) {
    console.log('   no result — the baseline did not compile\n')
    anyFailed = true
    continue
  }

  const dSram = outcome.best.sram - outcome.baseline.sram
  const dFlash = outcome.best.flash - outcome.baseline.flash
  const pct = (d, of) => (of ? `${((d / of) * 100).toFixed(0)}%` : '0%')
  console.log(
    `\n   chosen: ${outcome.best.passes.join(' + ') || 'nothing — the default was already smallest'}`,
  )
  console.log(
    `   SRAM  ${outcome.baseline.sram} → ${outcome.best.sram} B  (${signed(dSram)}, ${pct(dSram, outcome.baseline.sram)})`,
  )
  console.log(
    `   Flash ${outcome.baseline.flash} → ${outcome.best.flash} B  (${signed(dFlash)}, ${pct(dFlash, outcome.baseline.flash)})`,
  )
  console.log(`   ${outcome.compiles} compiles in ${(outcome.ms / 1000).toFixed(1)}s\n`)
}

await server.close()
process.exit(anyFailed ? 1 : 0)
