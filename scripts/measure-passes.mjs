/**
 * Compiles each optimisation pass and reports what it actually saved.
 *
 *   node scripts/measure-passes.mjs
 *   node scripts/measure-passes.mjs --fqbn arduino:avr:mega
 *
 * The flash model is a fit and the linker already strips unreferenced code, so
 * a pass that looks like a saving on paper can be worth nothing in the binary.
 * This asks the compiler instead. Every variant is checked for output
 * equivalence first, so a pass that changes the panel is reported as broken
 * rather than quietly measured.
 */
import { createServer } from 'vite'
import { buildProjects } from './lib/projects.mjs'

const fqbnArg = process.argv.indexOf('--fqbn')
const FQBN = fqbnArg > -1 ? process.argv[fqbnArg + 1] : 'arduino:avr:uno'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
const cg = await server.ssrLoadModule('/src/project-types/matrix/lib/codegen/index.ts')
const opts = await server.ssrLoadModule('/src/project-types/matrix/lib/codegen/options.ts')
const validate = await server.ssrLoadModule('/src/project-types/matrix/lib/optimize/validate.ts')
const { DEFAULT_HARDWARE, DEFAULT_SPEED } = await server.ssrLoadModule('/src/project-types/matrix/state/defaults.ts')
const cli_ = await server.ssrLoadModule('/plugins/arduinoCliCore.ts')

const cli = await cli_.findCli()
if (!cli) {
  console.error('arduino-cli not found. Set ARDUINO_CLI_PATH, or install the Arduino IDE.')
  await server.close()
  process.exit(2)
}
console.log(`arduino-cli ${cli.version}  —  ${FQBN}\n`)

const projects = buildProjects(DEFAULT_HARDWARE, DEFAULT_SPEED)
const passes = opts.IMPLEMENTED_PASSES

// Build every (project, candidate) sketch, gating each on equivalence first.
const jobs = []
const broken = []
for (const project of projects) {
  for (const passSet of [[], ...passes.map((p) => [p]), passes.length > 1 ? passes : null]) {
    if (!passSet) continue
    const options = opts.optionsFor(passSet)
    const label = passSet.length === 0 ? 'baseline' : passSet.join('+')

    const check = validate.validateProject(project, options)
    if (!check.ok) {
      broken.push(`${project.name} / ${label}: ${validate.describeResult(check)}`)
      continue
    }
    jobs.push({
      id: `${project.name}::${label}`,
      sketch: cg.generate(project, options).main,
      fqbn: FQBN,
      name: `${project.name}_${label}`.replace(/[^A-Za-z0-9_]/g, '_'),
    })
  }
}

if (broken.length > 0) {
  console.log('EQUIVALENCE FAILURES — not measured:')
  for (const b of broken) console.log(`  ${b}`)
  console.log('')
}

console.log(`compiling ${jobs.length} sketches, 4 at a time...\n`)
const started = Date.now()
const results = new Map()
await cli_.compileMany(cli, jobs, {
  concurrency: 4,
  onResult: ({ id, result }) => {
    results.set(id, result)
    process.stdout.write('.')
  },
})
console.log(`\n\ndone in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)

const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)

let failures = broken.length
for (const project of projects) {
  const base = results.get(`${project.name}::baseline`)
  if (!base || !base.ok) {
    console.log(`${project.name}: baseline failed to compile`)
    if (base) console.log(base.error.split('\n').slice(0, 4).join('\n'))
    failures++
    continue
  }

  console.log(`${project.name}  —  baseline ${base.flash} B flash, ${base.sram} B SRAM`)
  for (const passSet of [...passes.map((p) => [p]), passes.length > 1 ? passes : null]) {
    if (!passSet) continue
    const label = passSet.join('+')
    const r = results.get(`${project.name}::${label}`)
    if (!r) continue
    if (!r.ok) {
      console.log(`  ${pad(label, 26)} FAILED TO COMPILE`)
      console.log(`    ${r.error.split('\n').slice(0, 3).join('\n    ')}`)
      failures++
      continue
    }
    // The SRAM figure is meant to be exact, not fitted — the generator knows
    // every global it emits. If that ever stops being true, say so loudly.
    const est = cg.estimateMemory(project, opts.optionsFor(passSet)).sramGlobals
    if (est !== r.sram) {
      console.log(`  ${pad(label, 26)} SRAM ESTIMATE OFF — said ${est}, measured ${r.sram}`)
      failures++
    }

    const dFlash = r.flash - base.flash
    const dSram = r.sram - base.sram
    const pct = (d, of) => (of ? ` (${d > 0 ? '+' : ''}${((d / of) * 100).toFixed(0)}%)` : '')
    console.log(
      `  ${pad(label, 26)} flash ${num(dFlash > 0 ? `+${dFlash}` : dFlash, 6)}${pad(pct(dFlash, base.flash), 8)}` +
        `  SRAM ${num(dSram > 0 ? `+${dSram}` : dSram, 5)}${pct(dSram, base.sram)}`,
    )
  }
  console.log('')
}

await server.close()
process.exit(failures === 0 ? 0 : 1)
