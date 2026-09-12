import type { Frame, Grid, Group } from '../../types'
import { regionOf } from '../grid'
import { has, type CodegenOptions, NO_PASSES } from './options'

/**
 * Patterns are emitted as bit-packed PROGMEM tables rather than as one function
 * per frame with a statement per lit pixel. Measured on arduino:avr:uno, an 8x8
 * pattern costs 10 bytes of Flash this way against 54 as code — so a large
 * pattern library fits roughly five times over.
 *
 * Which frames get their own table is decided by planPatterns(): frames that
 * pack to the same bytes can share one, and every dark frame can point at the
 * same run of zeros. A step holds a plain `const uint8_t*`, so sharing costs
 * nothing at runtime and the engine never learns about it.
 */

/** A C identifier derived from the frame's own name, so the table reads well. */
export function patternSymbol(frame: Frame, index: number, taken: Set<string>): string {
  const cleaned = frame.name
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  let base = cleaned && /^[A-Z]/.test(cleaned) ? `PATTERN_${cleaned}` : `PATTERN_${index + 1}`
  if (base.length > 40) base = base.slice(0, 40).replace(/_+$/, '')
  let name = base
  let n = 2
  while (taken.has(name)) name = `${base}_${n++}`
  taken.add(name)
  return name
}

export function assignPatternNames(frames: Frame[]): Map<string, string> {
  const taken = new Set<string>()
  return new Map(frames.map((frame, i) => [frame.id, patternSymbol(frame, i, taken)]))
}

/** Packs the frame's authored region into `ceil(cols / 8)` bytes per row. */
export function packFrame(frame: Frame, grid: Grid): { rows: number; cols: number; bytes: number[][] } {
  const region = regionOf(frame, grid)
  const stride = Math.ceil(region.cols / 8)
  const bytes: number[][] = []
  for (let r = 0; r < region.rows; r++) {
    const row = new Array<number>(stride).fill(0)
    for (let c = 0; c < region.cols; c++) {
      if (frame.cells[r * grid.cols + c]) row[c >> 3] |= 0x80 >> (c & 7)
    }
    bytes.push(row)
  }
  return { rows: region.rows, cols: region.cols, bytes }
}

const hex = (v: number) => `0x${v.toString(16).padStart(2, '0')}`
const isBlank = (bytes: number[][]) => bytes.every((row) => row.every((b) => b === 0))
const countBits = (bytes: number[][]) =>
  bytes.reduce((n, row) => n + row.reduce((m, b) => m + b.toString(2).split('1').length - 1, 0), 0)

export const BLANK_SYMBOL = 'PATTERN_BLANK'

/** One emitted PROGMEM table, and every frame that reads from it. */
export type PatternTable = {
  symbol: string
  rows: number
  cols: number
  bytes: number[][]
  users: Frame[]
  blank: boolean
}

export type PatternPlan = {
  /** frame id to the symbol its step points at. */
  names: Map<string, string>
  tables: PatternTable[]
  /** Bytes saved against emitting one table per frame. */
  savedBytes: number
}

/**
 * Decides which frames share a table.
 *
 * Sharing is safe because a step points at raw bytes: two frames that pack
 * identically read the same bytes whether they share a table or not. A dark
 * frame is the same argument taken further — every dark frame reads zeros, so
 * they can all read the same zeros, and the shared run is sized for the largest
 * of them since each step only reads its own prefix.
 */
export function planPatterns(
  frames: Frame[],
  grid: Grid,
  options: CodegenOptions = NO_PASSES,
): PatternPlan {
  const dedupe = has(options, 'dedupePatterns')
  const shareBlanks = has(options, 'shareBlanks')

  const taken = new Set<string>()
  const names = new Map<string, string>()
  const tables: PatternTable[] = []
  const byContent = new Map<string, PatternTable>()
  let blankTable: PatternTable | null = null
  let savedBytes = 0

  frames.forEach((frame, index) => {
    const packed = packFrame(frame, grid)
    const size = packed.rows * (packed.bytes[0]?.length ?? 0)

    if (shareBlanks && isBlank(packed.bytes)) {
      if (blankTable) {
        // Keep the widest shape so every sharer's prefix is in range.
        if (size > blankTable.rows * (blankTable.bytes[0]?.length ?? 0)) {
          blankTable.rows = packed.rows
          blankTable.cols = packed.cols
          blankTable.bytes = packed.bytes
        }
        blankTable.users.push(frame)
        names.set(frame.id, blankTable.symbol)
        savedBytes += size
        return
      }
      taken.add(BLANK_SYMBOL)
      blankTable = {
        symbol: BLANK_SYMBOL,
        rows: packed.rows,
        cols: packed.cols,
        bytes: packed.bytes,
        users: [frame],
        blank: true,
      }
      tables.push(blankTable)
      names.set(frame.id, BLANK_SYMBOL)
      return
    }

    if (dedupe) {
      const key = `${packed.rows}x${packed.cols}:${packed.bytes.map((r) => r.join(',')).join('|')}`
      const existing = byContent.get(key)
      if (existing) {
        existing.users.push(frame)
        names.set(frame.id, existing.symbol)
        savedBytes += size
        return
      }
      const symbol = patternSymbol(frame, index, taken)
      const table: PatternTable = { symbol, ...packed, users: [frame], blank: false }
      byContent.set(key, table)
      tables.push(table)
      names.set(frame.id, symbol)
      return
    }

    const symbol = patternSymbol(frame, index, taken)
    tables.push({ symbol, ...packed, users: [frame], blank: false })
    names.set(frame.id, symbol)
  })

  return { names, tables, savedBytes }
}

export function emitPattern(frame: Frame, grid: Grid, symbol: string): string {
  const { rows, cols, bytes } = packFrame(frame, grid)
  // One source line per panel row keeps the table readable and hand-editable.
  const body = bytes.map((row) => `  ${row.map(hex).join(', ')},`).join('\n')
  return [
    `// ${frame.name} — ${rows}x${cols}, ${countBits(bytes)} lit`,
    `const uint8_t ${symbol}[] PROGMEM = {`,
    body,
    `};`,
  ].join('\n')
}

function emitTable(table: PatternTable): string {
  const body = table.bytes.map((row) => `  ${row.map(hex).join(', ')},`).join('\n')
  const shape = `${table.rows}x${table.cols}`
  const header = table.blank
    ? `// Dark — ${shape}, shared by ${table.users.length} frame${table.users.length === 1 ? '' : 's'}`
    : table.users.length > 1
      ? `// ${table.users[0].name} — ${shape}, ${countBits(table.bytes)} lit` +
        `\n// Also used by ${table.users.slice(1).map((f) => f.name).join(', ')}`
      : `// ${table.users[0].name} — ${shape}, ${countBits(table.bytes)} lit`
  return [header, `const uint8_t ${table.symbol}[] PROGMEM = {`, body, `};`].join('\n')
}

export function emitPatterns(frames: Frame[], grid: Grid, names: Map<string, string>): string {
  if (frames.length === 0) return ''
  return frames
    .map((frame) => emitPattern(frame, grid, names.get(frame.id) ?? 'PATTERN'))
    .join('\n\n')
}

export function emitPlannedPatterns(plan: PatternPlan): string {
  if (plan.tables.length === 0) return ''
  return plan.tables.map(emitTable).join('\n\n')
}

/** Frames actually placed on the timeline, in play order, de-duplicated. */
export function playedFrames(frames: Frame[], groups: Group[]): Frame[] {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const seen = new Set<string>()
  const out: Frame[] = []
  for (const group of groups) {
    for (const id of group.frameIds) {
      const frame = byId.get(id)
      if (frame && !seen.has(id)) {
        seen.add(id)
        out.push(frame)
      }
    }
  }
  return out
}
