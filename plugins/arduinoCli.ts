import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Connect, Plugin, ViteDevServer } from 'vite'

const run = promisify(execFile)

/**
 * Exposes arduino-cli to the app during local development only.
 *
 * A browser cannot run a compiler, and the production build is a static site,
 * so these routes simply do not exist once deployed — the client detects that
 * and falls back to its own memory estimate.
 */

const MARKER = 'led-pattern-generator/arduino'
const BASE = '/api/arduino'
const COMPILE_TIMEOUT = 120_000

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

type Cli = { path: string; version: string }
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
async function findCli(): Promise<Cli | null> {
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

/** arduino-cli prints its JSON report on stdout even when the build fails. */
function parseReport(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf('{')
  if (start === -1) return null
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>
  } catch {
    return null
  }
}

type Section = { name: string; size?: number; max_size?: number }

function sizes(report: Record<string, unknown> | null) {
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

const boardCache = new Map<string, unknown>()

async function listBoards(cli: Cli) {
  const key = 'boards'
  if (boardCache.has(key)) return boardCache.get(key)
  const { stdout } = await run(cli.path, ['board', 'listall', '--format', 'json'], {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = JSON.parse(stdout) as { boards?: Array<{ fqbn?: string; name?: string }> }
  const boards = (parsed.boards ?? [])
    .filter((b): b is { fqbn: string; name: string } => !!b.fqbn && !!b.name)
    .map((b) => ({ fqbn: b.fqbn, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  boardCache.set(key, boards)
  return boards
}

/** Flash/SRAM ceilings come straight from the board's own build properties. */
async function boardLimits(cli: Cli, fqbn: string) {
  const key = `limits:${fqbn}`
  if (boardCache.has(key)) return boardCache.get(key)
  const { stdout } = await run(
    cli.path,
    ['board', 'details', '--fqbn', fqbn, '--format', 'json'],
    { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout) as { build_properties?: string[] }
  const props = new Map<string, string>()
  for (const entry of parsed.build_properties ?? []) {
    const at = entry.indexOf('=')
    if (at > 0) props.set(entry.slice(0, at), entry.slice(at + 1))
  }
  const num = (k: string) => {
    const v = Number(props.get(k))
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const limits = {
    fqbn,
    flashMax: num('upload.maximum_size'),
    sramMax: num('upload.maximum_data_size'),
    mcu: props.get('build.mcu') ?? null,
  }
  boardCache.set(key, limits)
  return limits
}

async function compile(cli: Cli, sketch: string, fqbn: string, name: string) {
  // A sketch folder must be named after its .ino; a stable path lets
  // arduino-cli reuse its build cache between checks.
  const safe = (name.replace(/[^A-Za-z0-9_]/g, '_') || 'LedPattern').slice(0, 48)
  const dir = path.join(os.tmpdir(), 'led-pattern-generator-build', safe)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${safe}.ino`), sketch, 'utf8')

  const args = ['compile', '--fqbn', fqbn, '--format', 'json', '--no-color', dir]
  let stdout = ''
  try {
    stdout = (await run(cli.path, args, { timeout: COMPILE_TIMEOUT, maxBuffer: 32 * 1024 * 1024 })).stdout
  } catch (err) {
    // A failed build exits non-zero but still reports on stdout.
    stdout = (err as { stdout?: string }).stdout ?? ''
    if (!stdout) throw err
  }

  const report = parseReport(stdout)
  const ok = report?.success === true
  return {
    ok,
    fqbn,
    ...sizes(report),
    output: typeof report?.compiler_out === 'string' ? report.compiler_out : '',
    error: ok
      ? ''
      : [report?.error, report?.compiler_err].filter((x) => typeof x === 'string' && x).join('\n\n'),
  }
}

function json(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) {
  const payload = JSON.stringify({ marker: MARKER, ...(body as object) })
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(payload)
}

function readBody(req: Parameters<Connect.NextHandleFunction>[0]): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 8 * 1024 * 1024) reject(new Error('Sketch too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function middleware(server: ViteDevServer) {
  server.middlewares.use(BASE, async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.replace(/\/+$/, '') || '/'

    try {
      const cli = await findCli()

      if (route === '/status') {
        return json(res, 200,
          cli
            ? { available: true, version: cli.version, path: cli.path }
            : {
                available: false,
                message:
                  'arduino-cli not found. Install the Arduino IDE or arduino-cli, or set ARDUINO_CLI_PATH.',
              },
        )
      }

      if (!cli) return json(res, 503, { available: false, error: 'arduino-cli not found' })

      if (route === '/boards') return json(res, 200, { boards: await listBoards(cli) })

      if (route === '/board') {
        const fqbn = url.searchParams.get('fqbn')
        if (!fqbn) return json(res, 400, { error: 'fqbn is required' })
        return json(res, 200, await boardLimits(cli, fqbn))
      }

      if (route === '/compile') {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
        const body = JSON.parse(await readBody(req)) as {
          sketch?: string
          fqbn?: string
          name?: string
        }
        if (!body.sketch || !body.fqbn) return json(res, 400, { error: 'sketch and fqbn required' })
        return json(res, 200, await compile(cli, body.sketch, body.fqbn, body.name ?? 'LedPattern'))
      }

      return next()
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function arduinoCli(): Plugin {
  return {
    name: 'led-pattern-generator:arduino-cli',
    apply: 'serve',
    configureServer: middleware,
    configurePreviewServer: middleware as unknown as Plugin['configurePreviewServer'],
  }
}
