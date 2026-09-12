import type { BoardLimits } from './boards'

/**
 * Client for the arduino-cli bridge.
 *
 * A browser cannot run a compiler, so the compiling happens in a small local
 * HTTP server and the page talks to it. There are two of those, speaking the
 * same API, and this file does not care which one answered:
 *
 *   - `npm run dev` mounts it on the dev server itself, at a same-origin path
 *     (plugins/arduinoCli.ts).
 *   - The deployed site has no server of its own, so the user runs the helper
 *     script from `public/bridge/` and it listens on 127.0.0.1.
 *
 * Neither is guaranteed to be there. On the deployed static site the SPA
 * redirect answers every path with index.html, so a 200 is not proof of a
 * bridge — every response is checked for our marker before it counts.
 */

const PATHNAME = '/api/arduino'
const MARKER = 'led-pattern-generator/arduino'

/** Ports the helper script tries, in the order it tries them. */
export const BRIDGE_PORTS = [8787, 8788, 8789, 8790]

/** Long enough for a loaded machine, short enough not to stall the page. */
const PROBE_TIMEOUT_MS = 2500
const STORAGE_KEY = 'led-pattern-generator:bridge-endpoint'

/** Where to send someone who would rather install the compiler themselves. */
export const ARDUINO_CLI_INSTALL_URL = 'https://arduino.github.io/arduino-cli/latest/installation/'

/** Which of the two bridges answered. Only the wording in the UI depends on it. */
export type BridgeKind = 'dev' | 'local'

export type BridgeStatus =
  | { state: 'checking' }
  | { state: 'ready'; via: BridgeKind; endpoint: string; version: string; path: string; bridgeVersion?: string }
  | { state: 'absent'; reason: string; kind: 'no-bridge' | 'no-cli' | 'error'; endpoint?: string }

export type CompileResult = {
  ok: boolean
  fqbn: string
  flash: number | null
  flashMax: number | null
  sram: number | null
  sramMax: number | null
  output: string
  error: string
}

type Marked = { marker?: string } & Record<string, unknown>
type Endpoint = { base: string; via: BridgeKind }

let resolved: Endpoint | null = null
let discovery: Promise<Endpoint | null> | null = null

// ---------------------------------------------------------------------------
// Talking to whichever bridge is there
// ---------------------------------------------------------------------------

/**
 * The custom header is not read by anyone; it is there to make the request
 * non-simple, so a browser must preflight it. A page on another site then
 * cannot reach the local bridge at all without being allowed by name.
 */
function headersFor(init?: RequestInit): HeadersInit {
  return { 'x-led-bridge': '1', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }
}

/** Resolves only for a genuine bridge response; anything else means "not there". */
async function fetchMarked<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...init, headers: headersFor(init) })
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) throw new Error('bridge-absent')
  const body = (await res.json()) as Marked
  if (body.marker !== MARKER) throw new Error('bridge-absent')
  if (!res.ok && typeof body.error === 'string') throw new Error(body.error)
  return body as T
}

function remember(endpoint: Endpoint | null) {
  resolved = endpoint
  try {
    if (endpoint) localStorage.setItem(STORAGE_KEY, endpoint.base)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private windows and blocked site data are fine; discovery just re-runs.
  }
}

function lastKnown(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** A bridge is "there" even when it reports no compiler; that is a different problem. */
async function probe(candidate: Endpoint): Promise<Endpoint | null> {
  try {
    await fetchMarked(candidate.base, '/status', { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return candidate
  } catch {
    return null
  }
}

/**
 * Whether the same-origin dev route is worth asking about at all.
 *
 * It exists only while a Vite server is serving the app — `npm run dev`, or
 * `npm run preview`, which mounts the same middleware on a production build.
 * On the deployed site the SPA redirect answers that path with index.html, and
 * asking for it just puts a failed request in everyone's console.
 */
function devBridgePossible(): boolean {
  if (import.meta.env.DEV) return true
  const { hostname } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function candidates(): Endpoint[] {
  const local: Endpoint[] = BRIDGE_PORTS.map((port) => ({
    base: `http://127.0.0.1:${port}${PATHNAME}`,
    via: 'local',
  }))
  // Whichever port worked last time goes first, so a reload is one request.
  const previous = lastKnown()
  if (previous) {
    const at = local.findIndex((c) => c.base === previous)
    if (at > 0) local.unshift(...local.splice(at, 1))
  }
  return devBridgePossible() ? [{ base: PATHNAME, via: 'dev' }, ...local] : local
}

/**
 * Finds a bridge, cheaply and quietly.
 *
 * One at a time rather than all at once: a refused connection to a closed port
 * is instant, so racing them saves nothing measurable, and every port that is
 * not the right one leaves a failed request in the browser console. Stopping at
 * the first answer means the ordinary case — the helper on its first port —
 * makes exactly one request and logs nothing.
 */
async function discover(): Promise<Endpoint | null> {
  for (const candidate of candidates()) {
    const found = await probe(candidate)
    if (found) return found
  }
  return null
}

async function endpoint(): Promise<Endpoint | null> {
  if (resolved) return resolved
  if (!discovery) {
    discovery = discover().then((found) => {
      remember(found)
      discovery = null
      return found
    })
  }
  return discovery
}

/** Forgets the bridge that was found, so the next call looks again. */
export function forgetBridge(): void {
  remember(null)
  discovery = null
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const found = await endpoint()
  if (!found) throw new Error('bridge-absent')
  try {
    return await fetchMarked<T>(found.base, path, init)
  } catch (err) {
    // A bridge that has gone away should not poison every later call.
    if (err instanceof Error && err.message === 'bridge-absent') forgetBridge()
    throw err
  }
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

const NO_BRIDGE =
  'No compiler is connected. Compiling runs on your own machine — set up the helper to enable it.'

export async function getStatus(): Promise<BridgeStatus> {
  const found = await endpoint()
  if (!found) return { state: 'absent', reason: NO_BRIDGE, kind: 'no-bridge' }

  try {
    const body = await fetchMarked<{
      available: boolean
      version?: string
      path?: string
      message?: string
      bridge?: { version?: string }
    }>(found.base, '/status')

    if (!body.available) {
      return {
        state: 'absent',
        kind: 'no-cli',
        endpoint: found.base,
        reason: body.message ?? 'A compile bridge is running, but it cannot find arduino-cli.',
      }
    }
    return {
      state: 'ready',
      via: found.via,
      endpoint: found.base,
      version: body.version ?? 'unknown',
      path: body.path ?? '',
      bridgeVersion: body.bridge?.version,
    }
  } catch (err) {
    forgetBridge()
    if (err instanceof Error && err.message !== 'bridge-absent') {
      return { state: 'absent', reason: err.message, kind: 'error' }
    }
    return { state: 'absent', reason: NO_BRIDGE, kind: 'no-bridge' }
  }
}

export async function getBoards(): Promise<Array<{ fqbn: string; name: string }>> {
  const body = await call<{ boards: Array<{ fqbn: string; name: string }> }>('/boards')
  return body.boards
}

export async function getBoardLimits(fqbn: string): Promise<Partial<BoardLimits>> {
  return await call<Partial<BoardLimits>>(`/board?fqbn=${encodeURIComponent(fqbn)}`)
}

export async function compileSketch(
  sketch: string,
  fqbn: string,
  name: string,
): Promise<CompileResult> {
  return await call<CompileResult>('/compile', {
    method: 'POST',
    body: JSON.stringify({ sketch, fqbn, name }),
  })
}

export type BatchCompileReply = {
  id: string
  ok: boolean
  flash: number | null
  sram: number | null
  flashMax: number | null
  sramMax: number | null
  error: string
  cached: boolean
  ms: number
}

/**
 * Compiles a whole search round in one request.
 *
 * The optimiser runs in the browser — it has the project and the generator —
 * and only the compiling has to happen outside. Sending a round at a time is
 * what lets the bridge run four of them at once.
 */
export async function compileBatch(
  jobs: Array<{ id: string; sketch: string }>,
  fqbn: string,
  name: string,
): Promise<BatchCompileReply[]> {
  const body = await call<{ results: BatchCompileReply[] }>('/compile-batch', {
    method: 'POST',
    body: JSON.stringify({ jobs, fqbn, name }),
  })
  return body.results
}
