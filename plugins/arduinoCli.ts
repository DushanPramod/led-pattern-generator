import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { type Cli, compile, compileMany, findCli, listBoards } from './arduinoCliCore.ts'

const run = promisify(execFile)

/**
 * Exposes arduino-cli to the app during local development only.
 *
 * A browser cannot run a compiler, and the production build is a static site,
 * so these routes simply do not exist once deployed — the client detects that
 * and falls back to its own memory estimate.
 *
 * Finding and driving the CLI lives in arduinoCliCore, shared with the
 * optimizer and the flash calibrator, so there is one implementation of
 * "compile this and tell me how big it is" rather than three.
 */

const MARKER = 'led-pattern-generator/arduino'
const BASE = '/api/arduino'
/** One search round at a time; more than this in a single request is a mistake. */
const MAX_BATCH = 32

const boardCache = new Map<string, unknown>()

async function cachedBoards(cli: Cli) {
  const key = 'boards'
  if (boardCache.has(key)) return boardCache.get(key)
  const boards = await listBoards(cli)
  boardCache.set(key, boards)
  return boards
}

/** Flash/SRAM ceilings come straight from the board's own build properties. */
async function boardLimits(cli: Cli, fqbn: string) {
  const key = `limits:${fqbn}`
  if (boardCache.has(key)) return boardCache.get(key)
  const { stdout } = await run(cli.path, ['board', 'details', '--fqbn', fqbn, '--format', 'json'], {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  })
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
      // A search round carries several sketches, so this is roomier than one.
      if (data.length > 64 * 1024 * 1024) reject(new Error('Request too large'))
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
        return json(
          res,
          200,
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

      if (route === '/boards') return json(res, 200, { boards: await cachedBoards(cli) })

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

      /**
       * One round of the optimizer's search.
       *
       * The search itself runs in the browser, where the project and the
       * generator already live; this is only the part a browser cannot do.
       * Taking a whole round at once is what lets the compiles run in parallel.
       */
      if (route === '/compile-batch') {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
        const body = JSON.parse(await readBody(req)) as {
          jobs?: Array<{ id?: string; sketch?: string }>
          fqbn?: string
          name?: string
        }
        const jobs = body.jobs ?? []
        if (!body.fqbn || jobs.length === 0) return json(res, 400, { error: 'jobs and fqbn required' })
        if (jobs.length > MAX_BATCH) return json(res, 400, { error: `at most ${MAX_BATCH} jobs` })
        if (jobs.some((j) => !j.id || !j.sketch)) {
          return json(res, 400, { error: 'every job needs an id and a sketch' })
        }

        const results = await compileMany(
          cli,
          jobs.map((j) => ({
            id: j.id as string,
            sketch: j.sketch as string,
            fqbn: body.fqbn as string,
            name: body.name ?? 'LedPattern',
          })),
          { concurrency: 4 },
        )
        return json(res, 200, {
          results: results.map(({ id, result }) => ({
            id,
            ok: result.ok,
            flash: result.flash,
            sram: result.sram,
            flashMax: result.flashMax,
            sramMax: result.sramMax,
            error: result.error,
            cached: result.cached,
            ms: result.ms,
          })),
        })
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
