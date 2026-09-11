import type { BoardLimits } from './boards'

/**
 * Client for the dev-only arduino-cli bridge in plugins/arduinoCli.ts.
 *
 * The routes exist only under `npm run dev`. On the deployed static site the
 * SPA redirect answers every path with index.html, so a 200 is not proof the
 * bridge is there — every response is checked for our marker before it counts.
 */

const BASE = '/api/arduino'
const MARKER = 'led-pattern-generator/arduino'

export type BridgeStatus =
  | { state: 'checking' }
  | { state: 'ready'; version: string; path: string }
  | { state: 'absent'; reason: string }

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

/** Resolves only for a genuine bridge response; anything else means "not running". */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('bridge-absent')
  }
  const body = (await res.json()) as Marked
  if (body.marker !== MARKER) throw new Error('bridge-absent')
  if (!res.ok && typeof body.error === 'string') throw new Error(body.error)
  return body as T
}

export async function getStatus(): Promise<BridgeStatus> {
  try {
    const body = await call<{ available: boolean; version?: string; path?: string; message?: string }>(
      '/status',
    )
    return body.available
      ? { state: 'ready', version: body.version ?? 'unknown', path: body.path ?? '' }
      : { state: 'absent', reason: body.message ?? 'arduino-cli not found.' }
  } catch (err) {
    return {
      state: 'absent',
      reason:
        err instanceof Error && err.message !== 'bridge-absent'
          ? err.message
          : 'Compiling needs the local dev server — run `npm run dev` to enable it.',
    }
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sketch, fqbn, name }),
  })
}
