import type { Frame, Grid, Group } from '../../types'
import { regionOf } from '../grid'

/**
 * Patterns are emitted as bit-packed PROGMEM tables rather than as one function
 * per frame with a statement per lit pixel. Measured on arduino:avr:uno, an 8x8
 * pattern costs 10 bytes of Flash this way against 54 as code — so a large
 * pattern library fits roughly five times over.
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

export function emitPattern(frame: Frame, grid: Grid, symbol: string): string {
  const { rows, cols, bytes } = packFrame(frame, grid)
  const lit = bytes.reduce(
    (n, row) => n + row.reduce((m, b) => m + b.toString(2).split('1').length - 1, 0),
    0,
  )
  // One source line per panel row keeps the table readable and hand-editable.
  const body = bytes.map((row) => `  ${row.map(hex).join(', ')},`).join('\n')
  return [
    `// ${frame.name} — ${rows}x${cols}, ${lit} lit`,
    `const uint8_t ${symbol}[] PROGMEM = {`,
    body,
    `};`,
  ].join('\n')
}

export function emitPatterns(frames: Frame[], grid: Grid, names: Map<string, string>): string {
  if (frames.length === 0) return ''
  return frames
    .map((frame) => emitPattern(frame, grid, names.get(frame.id) ?? 'PATTERN'))
    .join('\n\n')
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
