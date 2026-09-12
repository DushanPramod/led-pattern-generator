/**
 * A JS mirror of the engine that codegen emits, operation for operation.
 *
 * The generated C cannot run here — there is no AVR in the loop — so this
 * stands in for it: every function matches its counterpart in codegen/engine.ts
 * exactly, and its output is diffed against src/lib/simulate.ts, the behavioural
 * spec. A mismatch means the bit-packing, carry propagation, tiling or mirroring
 * in the emitter is wrong.
 *
 * It takes the same CodegenOptions the emitter does, so each optimisation pass
 * that changes the engine is modelled here too and stays under the same diff.
 * Keeping it in one place means the fuzz script, the optimizer's own gate and
 * the UI check against the same model rather than three drifting copies.
 */
import type { Frame, Grid, Group } from '../../types'
import { packFrame, type PatternPlan } from '../codegen/designs'
import { has, NO_PASSES, type CodegenOptions } from '../codegen/options'
import { regionOf, sourceCols } from '../grid'
import { mirrorApplies, needsPreload } from '../simulate'

/** One pattern exactly as it reaches PROGMEM: flat, bit-packed, row-major. */
export type PatternData = { bytes: Uint8Array; rows: number; cols: number }

/** The emitter's packFrame, flattened the way the PROGMEM table is laid out. */
export function flatPack(frame: Frame, grid: Grid): PatternData {
  const { rows, cols, bytes } = packFrame(frame, grid)
  const stride = bytes[0]?.length ?? 0
  const flat = new Uint8Array(rows * stride)
  for (let r = 0; r < rows; r++) for (let b = 0; b < stride; b++) flat[r * stride + b] = bytes[r][b]
  return { bytes: flat, rows, cols }
}

export function makeEngine(grid: Grid, options: CodegenOptions = NO_PASSES) {
  const progmem = has(options, 'progmemPatternRead')
  const PANEL_ROWS = grid.rows
  const PANEL_COLS = grid.cols
  const PATTERN_COLS = sourceCols(grid)
  const FRAME_BYTES_PER_ROW = Math.ceil(PANEL_COLS / 8)
  const PATTERN_BYTES_PER_ROW = Math.ceil(PATTERN_COLS / 8)
  const PAD = (8 - (PANEL_COLS % 8)) % 8

  const frameBuffer = Array.from({ length: PANEL_ROWS }, () => new Uint8Array(FRAME_BYTES_PER_ROW))
  // Only one of these exists in the emitted sketch: the RAM buffer, or the
  // descriptor that lets patternPixel() address PROGMEM directly.
  const pattern = Array.from({ length: PANEL_ROWS }, () => new Uint8Array(PATTERN_BYTES_PER_ROW))
  let patternData: Uint8Array = new Uint8Array(0)
  let patternRows = 1
  let patternCols = 1
  let patternStride = 1
  let patternMirrored = false

  /**
   * The two modulos are the tiling loadPattern() used to materialise, and the
   * mirror fold replaces its in-place reflection. See emitProgmemBitHelpers.
   */
  const progmemPatternPixel = (row: number, col: number) => {
    let c =
      patternMirrored && col >= PATTERN_COLS - Math.floor(PATTERN_COLS / 2)
        ? PATTERN_COLS - 1 - col
        : col
    c %= patternCols
    const index = (row % patternRows) * patternStride + (c >> 3)
    return !!(patternData[index] & (0x80 >> (c & 7)))
  }
  const bufferPatternPixel = (row: number, col: number) =>
    !!(pattern[row][col >> 3] & (0x80 >> (col & 7)))
  const patternPixel = progmem ? progmemPatternPixel : bufferPatternPixel
  const framePixel = (row: number, col: number) =>
    !!(frameBuffer[row][col >> 3] & (0x80 >> (col & 7)))
  const setPatternPixel = (row: number, col: number, on: boolean) => {
    const mask = 0x80 >> (col & 7)
    if (on) pattern[row][col >> 3] |= mask
    else pattern[row][col >> 3] &= ~mask & 0xff
  }
  const setFramePixel = (row: number, col: number, on: boolean) => {
    const mask = 0x80 >> (col & 7)
    if (on) frameBuffer[row][col >> 3] |= mask
    else frameBuffer[row][col >> 3] &= ~mask & 0xff
  }

  const trimRow = (row: number) => {
    if (PAD > 0) frameBuffer[row][FRAME_BYTES_PER_ROW - 1] &= (0xff << PAD) & 0xff
  }

  function loadPattern(data: Uint8Array, tileRows: number, tileCols: number) {
    if (progmem) {
      patternData = data
      patternRows = tileRows
      patternCols = tileCols
      patternStride = Math.ceil(tileCols / 8)
      patternMirrored = false
      return
    }
    const stride = Math.ceil(tileCols / 8)
    for (const row of pattern) row.fill(0)
    for (let row = 0; row < tileRows; row++) {
      for (let col = 0; col < tileCols; col++) {
        const packed = data[row * stride + (col >> 3)]
        setPatternPixel(row, col, !!(packed & (0x80 >> (col & 7))))
      }
    }
    for (let row = tileRows; row < PANEL_ROWS; row++) {
      for (let col = 0; col < tileCols; col++) {
        setPatternPixel(row, col, patternPixel(row % tileRows, col))
      }
    }
    for (let col = tileCols; col < PATTERN_COLS; col++) {
      for (let row = 0; row < PANEL_ROWS; row++) {
        setPatternPixel(row, col, patternPixel(row, col % tileCols))
      }
    }
  }

  function mirrorPattern() {
    if (progmem) {
      patternMirrored = true
      return
    }
    for (let row = 0; row < PANEL_ROWS; row++) {
      for (let col = 0; col < Math.floor(PATTERN_COLS / 2); col++) {
        setPatternPixel(row, PATTERN_COLS - 1 - col, patternPixel(row, col))
      }
    }
  }

  function writePanelRow(panelRow: number, patternRow: number, mirrored: boolean) {
    for (let col = 0; col < PANEL_COLS; col++) {
      const source = mirrored && col >= PATTERN_COLS ? PANEL_COLS - 1 - col : col % PATTERN_COLS
      setFramePixel(panelRow, col, patternPixel(patternRow, source))
    }
  }

  function writePanelColumn(panelCol: number, patternCol: number) {
    for (let row = 0; row < PANEL_ROWS; row++) {
      setFramePixel(row, panelCol, patternPixel(row, patternCol))
    }
  }

  function fillPanelFromPattern(mirrored: boolean) {
    for (let row = 0; row < PANEL_ROWS; row++) writePanelRow(row, row, mirrored)
  }

  const shiftPanelUp = () => {
    for (let row = 0; row + 1 < PANEL_ROWS; row++) frameBuffer[row].set(frameBuffer[row + 1])
  }
  const shiftPanelDown = () => {
    for (let row = PANEL_ROWS - 1; row > 0; row--) frameBuffer[row].set(frameBuffer[row - 1])
  }

  function shiftRowLeft(row: number) {
    for (let b = 0; b < FRAME_BYTES_PER_ROW; b++) {
      const next = b + 1 < FRAME_BYTES_PER_ROW ? frameBuffer[row][b + 1] : 0
      frameBuffer[row][b] = ((frameBuffer[row][b] << 1) | (next >> 7)) & 0xff
    }
    trimRow(row)
  }

  function shiftRowRight(row: number) {
    for (let b = FRAME_BYTES_PER_ROW - 1; b >= 0; b--) {
      const previous = b > 0 ? frameBuffer[row][b - 1] : 0
      frameBuffer[row][b] = ((frameBuffer[row][b] >> 1) | ((previous << 7) & 0xff)) & 0xff
    }
    trimRow(row)
  }

  const shiftPanelLeft = () => {
    for (let row = 0; row < PANEL_ROWS; row++) shiftRowLeft(row)
  }
  const shiftPanelRight = () => {
    for (let row = 0; row < PANEL_ROWS; row++) shiftRowRight(row)
  }

  function scrollBands(bandCount: number, directions: number) {
    const bandHeight = Math.floor(PANEL_ROWS / bandCount)
    for (let band = 0; band < bandCount; band++) {
      const rightwards = !!(directions & (1 << band))
      for (let offset = 0; offset < bandHeight; offset++) {
        const row = band * bandHeight + offset
        if (rightwards) {
          const carry = framePixel(row, PANEL_COLS - 1)
          shiftRowRight(row)
          setFramePixel(row, 0, carry)
        } else {
          const carry = framePixel(row, 0)
          shiftRowLeft(row)
          setFramePixel(row, PANEL_COLS - 1, carry)
        }
      }
    }
  }

  function scrollBandsVertical(bandCount: number, directions: number) {
    const bandWidth = Math.floor(PANEL_COLS / bandCount)
    for (let band = 0; band < bandCount; band++) {
      const downwards = !!(directions & (1 << band))
      for (let offset = 0; offset < bandWidth; offset++) {
        const col = band * bandWidth + offset
        if (downwards) {
          const carry = framePixel(PANEL_ROWS - 1, col)
          for (let row = PANEL_ROWS - 1; row > 0; row--) {
            setFramePixel(row, col, framePixel(row - 1, col))
          }
          setFramePixel(0, col, carry)
        } else {
          const carry = framePixel(0, col)
          for (let row = 0; row + 1 < PANEL_ROWS; row++) {
            setFramePixel(row, col, framePixel(row + 1, col))
          }
          setFramePixel(PANEL_ROWS - 1, col, carry)
        }
      }
    }
  }

  /** Unpacks the bit-packed frame buffer into one byte per pixel, for diffing. */
  function snapshot(): Uint8Array {
    const out = new Uint8Array(PANEL_ROWS * PANEL_COLS)
    for (let r = 0; r < PANEL_ROWS; r++) {
      for (let c = 0; c < PANEL_COLS; c++) out[r * PANEL_COLS + c] = framePixel(r, c) ? 1 : 0
    }
    return out
  }

  return {
    PANEL_ROWS,
    PANEL_COLS,
    PATTERN_COLS,
    loadPattern,
    mirrorPattern,
    writePanelRow,
    writePanelColumn,
    fillPanelFromPattern,
    shiftPanelUp,
    shiftPanelDown,
    shiftPanelLeft,
    shiftPanelRight,
    scrollBands,
    scrollBandsVertical,
    snapshot,
  }
}

export type Engine = ReturnType<typeof makeEngine>

export const bandMask = (directions: boolean[]): number =>
  directions.reduce((mask, forward, i) => mask | (forward ? 1 << i : 0), 0)

/**
 * How a frame's pattern reaches the engine. Passes that share, pool or re-encode
 * tables change what a step points at, so the resolver is injectable and the
 * model plays back whatever the emitter actually decided.
 */
export type PatternResolver = (frame: Frame, grid: Grid) => PatternData

/**
 * What a step reads once the plan has decided which frames share a table.
 *
 * The bytes are the whole shared table, but the rows and cols are the step`s
 * own — loadPattern() computes its stride from the step, so a frame pointing
 * into a larger shared run still reads only its own prefix. Routing the check
 * through this is what makes a mis-mapped symbol visible: comparing against
 * the frame`s own bytes would agree with itself no matter where the step
 * actually pointed.
 */
export function planResolver(plan: PatternPlan): PatternResolver {
  const bySymbol = new Map(plan.tables.map((t) => [t.symbol, t]))
  return (frame, grid) => {
    const symbol = plan.names.get(frame.id)
    const table = symbol ? bySymbol.get(symbol) : undefined
    if (!table) return flatPack(frame, grid)
    const stride = table.bytes[0]?.length ?? 0
    const flat = new Uint8Array(table.rows * stride)
    for (let r = 0; r < table.rows; r++)
      for (let b = 0; b < stride; b++) flat[r * stride + b] = table.bytes[r][b]
    const region = regionOf(frame, grid)
    return { bytes: flat, rows: region.rows, cols: region.cols }
  }
}

/** Plays a timeline through the model, exactly as playStep() and loop() would. */
export function runEngine(
  frames: Frame[],
  groups: Group[],
  grid: Grid,
  options: CodegenOptions = NO_PASSES,
  resolve: PatternResolver = flatPack,
): Uint8Array[] {
  const engine = makeEngine(grid, options)
  const byId = new Map(frames.map((f) => [f.id, f]))
  const out: Uint8Array[] = []

  for (const group of groups) {
    for (let pass = 0; pass < Math.max(1, group.repeat); pass++) {
      for (const id of group.frameIds) {
        const frame = byId.get(id)
        if (!frame) continue
        const packed = resolve(frame, grid)
        const mirrored = mirrorApplies(frame, grid)

        engine.loadPattern(packed.bytes, packed.rows, packed.cols)
        if (mirrored && !grid.halfWidth) engine.mirrorPattern()
        if (needsPreload(frame)) engine.fillPanelFromPattern(mirrored)

        const motion = frame.motion
        const steps = Math.max(1, motion.steps)
        for (let step = 0; step < steps; step++) {
          if (motion.kind === 'scroll') {
            if (motion.updown > 0) {
              engine.shiftPanelUp()
              engine.writePanelRow(engine.PANEL_ROWS - 1, step % engine.PANEL_ROWS, mirrored)
            }
            if (motion.updown < 0) {
              engine.shiftPanelDown()
              engine.writePanelRow(0, engine.PANEL_ROWS - 1 - (step % engine.PANEL_ROWS), mirrored)
            }
            if (motion.leftright > 0) {
              engine.shiftPanelRight()
              engine.writePanelColumn(0, engine.PATTERN_COLS - 1 - (step % engine.PATTERN_COLS))
            }
            if (motion.leftright < 0) {
              engine.shiftPanelLeft()
              engine.writePanelColumn(engine.PANEL_COLS - 1, step % engine.PATTERN_COLS)
            }
            out.push(engine.snapshot())
          } else if (motion.kind === 'band') {
            // runBands holds first, then moves.
            out.push(engine.snapshot())
            const turn =
              motion.axis === 'vertical' ? engine.scrollBandsVertical : engine.scrollBands
            turn(motion.directions.length, bandMask(motion.directions))
          } else {
            out.push(engine.snapshot())
          }
        }
      }
    }
  }
  return out
}
