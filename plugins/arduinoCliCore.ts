/**
 * Finding arduino-cli, and compiling with it.
 *
 * Shared by the dev-server route, the flash-model calibrator and the optimizer,
 * which previously each had their own copy of this. The optimizer compiles
 * dozens of variants of the same sketch, so two things matter here that did not
 * before: every compile gets its own build directory keyed by content (the old
 * per-project directory made concurrent variants overwrite each other), and
 * identical work is answered from a cache instead of being run twice.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const COMPILE_TIMEOUT = 180_000
const BUILD_ROOT = path.join(os.tmpdir(), 'led-pattern-generator-build')
/** Build directories to keep. A long search would otherwise fill the temp drive. */
const MAX_BUILD_DIRS = 80

/** Where Arduino IDE 2.x keeps the arduino-cli it bundles, per platform. */
function bundledCliPaths(): string[] {
  const rel = path.join('resources', 'app', 'lib', 'backend', 'resources')
  const exe = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'
  const home = os.homedir()
  const roots: string[] = []

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    roots.push(
      path.join(local, 'Programs', 'Arduino IDE'),
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Arduino IDE'),
    )
  } else if (process.platform === 'darwin') {
    roots.push(
      '/Applications/Arduino IDE.app/Contents',
      path.join(home, 'Applications', 'Arduino IDE.app', 'Contents'),
    )
  } else {
    roots.push('/opt/Arduino IDE', path.join(home, '.local', 'share', 'arduino-ide'))
  }

  return roots.map((root) => path.join(root, rel, exe))
}

export type Cli = { path: string; version: string }
let cached: Cli | null | undefined

async function probe(candidate: string): Promise<Cli | null> {
  try {
    const { stdout } = await run(candidate, ['version', '--format', 'json'], { timeout: 15_000 })
    const parsed = JSON.parse(stdout) as { VersionString?: string; version?: string }
    return { path: candidate, version: parsed.VersionString ?? parsed.version ?? 'unknown' }
  } catch {
    return null
  }
}

/** Env override first, then PATH, then the Arduino IDE bundle. */
export async function findCli(): Promise<Cli | null> {
  if (cached !== undefined) return cached

  const override = process.env.ARDUINO_CLI_PATH ?? process.env.ARDUINO_CLI
  const candidates = [
    ...(override ? [override] : []),
    process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli',
    ...bundledCliPaths().filter((p) => existsSync(p)),
  ]

  for (const candidate of candidates) {
    const found = await probe(candidate)
    if (found) {
      cached = found
      return found
    }
  }
  cached = null
  return null
}

/** Forgets a previous lookup, including a negative one. */
export function resetCliCache(): void {
  cached = undefined
}

/** arduino-cli prints its JSON report on stdout even when the build fails. */
export function parseReport(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf('{')
  if (start === -1) return null
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>
  } catch {
    return null
  }
}

type Section = { name: string; size?: number; max_size?: number }

/** Flash is the `text` section, SRAM globals the `data` section. */
export function sizes(report: Record<string, unknown> | null) {
  const builder = report?.builder_result as { executable_sections_size?: Section[] } | undefined
  const sections = builder?.executable_sections_size ?? []
  const text = sections.find((s) => s.name === 'text')
  const data = sections.find((s) => s.name === 'data')
  return {
    flash: text?.size ?? null,
    flashMax: text?.max_size ?? null,
    sram: data?.size ?? null,
    sramMax: data?.max_size ?? null,
  }
}

export type CompileResult = {
  ok: boolean
  fqbn: string
  flash: number | null
  flashMax: number | null
  sram: number | null
  sramMax: number | null
  output: string
  error: string
  /** True when the result came from the cache rather than the compiler. */
  cached: boolean
  ms: number
}

const sketchHash = (sketch: string, fqbn: string) =>
  createHash('sha1').update(fqbn).update('\0').update(sketch).digest('hex').slice(0, 12)

const safeName = (name: string) =>
  (name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'LedPattern').slice(0, 48)

const resultCache = new Map<string, CompileResult>()
/**
 * Compiles already running, keyed the same way as the cache.
 *
 * The optimizer often asks for the same sketch twice at once — a pass that
 * does not apply to a project produces byte-identical output to the baseline —
 * and since the build directory is keyed by content, two such compiles would
 * otherwise run in the same directory and corrupt each other.
 */
const inFlight = new Map<string, Promise<CompileResult>>()

export function clearCompileCache(): void {
  resultCache.clear()
}

/** Trims the oldest build directories so a long search cannot fill the disk. */
async function pruneBuildDirs(): Promise<void> {
  try {
    const entries = await readdir(BUILD_ROOT, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory())
    if (dirs.length <= MAX_BUILD_DIRS) return
    const withTime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(BUILD_ROOT, d.name)
        try {
          return { full, at: (await stat(full)).mtimeMs }
        } catch {
          return { full, at: 0 }
        }
      }),
    )
    withTime.sort((a, b) => b.at - a.at)
    await Promise.all(
      withTime.slice(MAX_BUILD_DIRS).map((d) => rm(d.full, { recursive: true, force: true })),
    )
  } catch {
    // Pruning is housekeeping; never let it fail a compile.
  }
}

/**
 * Compiles one sketch and reports its size.
 *
 * The directory is keyed by sketch content and board, so variants never collide
 * and a repeated variant reuses the build arduino-cli already did for it.
 */
export async function compile(
  cli: Cli,
  sketch: string,
  fqbn: string,
  name = 'LedPattern',
): Promise<CompileResult> {
  const key = `${fqbn}:${sketchHash(sketch, fqbn)}`
  const hit = resultCache.get(key)
  if (hit) return { ...hit, cached: true }

  const pending = inFlight.get(key)
  if (pending) return { ...(await pending), cached: true }

  const promise = runCompile(cli, sketch, fqbn, name)
  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

async function runCompile(
  cli: Cli,
  sketch: string,
  fqbn: string,
  name: string,
): Promise<CompileResult> {
  const key = `${fqbn}:${sketchHash(sketch, fqbn)}`

  const safe = safeName(name)
  const root = path.join(BUILD_ROOT, sketchHash(sketch, fqbn))
  const dir = path.join(root, safe)
  const buildPath = path.join(root, 'build')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${safe}.ino`), sketch, 'utf8')

  const args = [
    'compile',
    '--fqbn',
    fqbn,
    '--format',
    'json',
    '--no-color',
    '--build-path',
    buildPath,
    dir,
  ]

  const started = Date.now()
  let stdout = ''
  try {
    stdout = (
      await run(cli.path, args, { timeout: COMPILE_TIMEOUT, maxBuffer: 32 * 1024 * 1024 })
    ).stdout
  } catch (err) {
    // A failed build exits non-zero but still reports on stdout.
    stdout = (err as { stdout?: string }).stdout ?? ''
    if (!stdout) throw err
  }

  const report = parseReport(stdout)
  const ok = report?.success === true
  const result: CompileResult = {
    ok,
    fqbn,
    ...sizes(report),
    output: typeof report?.compiler_out === 'string' ? report.compiler_out : '',
    error: ok
      ? ''
      : [report?.error, report?.compiler_err].filter((x) => typeof x === 'string' && x).join('\n\n'),
    cached: false,
    ms: Date.now() - started,
  }

  if (ok) resultCache.set(key, result)
  void pruneBuildDirs()
  return result
}

export type CompileJob = { id: string; sketch: string; fqbn: string; name?: string }
export type CompileJobResult = { id: string; result: CompileResult }

/**
 * Compiles a batch, a few at a time.
 *
 * Measured on an 8-thread machine, four concurrent compiles finish in about the
 * time of one and a half, so the default is four; beyond that they contend.
 */
export async function compileMany(
  cli: Cli,
  jobs: CompileJob[],
  options: { concurrency?: number; onResult?: (r: CompileJobResult) => void } = {},
): Promise<CompileJobResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const out: CompileJobResult[] = []
  let next = 0

  const worker = async () => {
    for (;;) {
      const index = next++
      if (index >= jobs.length) return
      const job = jobs[index]
      const result = await compile(cli, job.sketch, job.fqbn, job.name)
      const entry = { id: job.id, result }
      out[index] = entry
      options.onResult?.(entry)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  return out
}

export async function listBoards(cli: Cli): Promise<Array<{ fqbn: string; name: string }>> {
  const { stdout } = await run(cli.path, ['board', 'listall', '--format', 'json'], {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = parseReport(stdout) as { boards?: Array<{ fqbn?: string; name?: string }> } | null
  return (parsed?.boards ?? [])
    .filter((b): b is { fqbn: string; name: string } => !!b.fqbn && !!b.name)
    .map((b) => ({ fqbn: b.fqbn, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
