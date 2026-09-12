import type { OptimizationLevel, PassId } from './lib/codegen/options'

export type Grid = {
  rows: number
  cols: number
  /**
   * Half-width source mode, as used by Matrix20x48: the source array is only
   * cols/2 wide and is repeated (or mirrored) across the panel, halving the
   * SRAM the pattern costs. Requires an even column count.
   */
  halfWidth?: boolean
}

export type ScanOrder = 'ascending' | 'descending'

/**
 * What sits between a column register output and the column (the LED anodes).
 * `direct` wires the output straight to the column resistor; `pnp` puts a PNP
 * high-side switch in between, which turns on when its base is pulled LOW — so
 * the sketch has to clock inverted column bits.
 */
export type ColumnDriver = 'direct' | 'pnp'

/**
 * What sits between a row register output and the row (the LED cathodes).
 * `direct` lets the register sink the row itself, active-low; `npn` puts an NPN
 * low-side switch in between, which turns on when its base is driven HIGH — so
 * row select becomes active-high.
 */
export type RowDriver = 'direct' | 'npn'

export type Hardware = {
  data1: number
  str1: number
  clock1: number
  data2: number
  clock2: number
  scanOrder: ScanOrder
  /**
   * Optional, so a project saved before transistor drivers existed loads as
   * `direct` and keeps generating exactly the sketch it did.
   */
  columnDriver?: ColumnDriver
  rowDriver?: RowDriver
}

/**
 * How fast the panel steps, for the whole project.
 *
 * A build either has an analog preset controller fitted — a pot on an analog
 * pin, read continuously so the speed follows the knob while the pattern plays
 * — or it does not, in which case one fixed step delay is compiled in. Both
 * sets of fields are kept either way, so turning the controller off and on
 * again does not lose what was configured.
 *
 * Whichever applies gives the *base* step delay; each frame then plays at a
 * multiple of it (see `Frame.speedFactor`).
 */
export type SpeedControl = {
  /** Is a preset controller fitted? Decides the whole shape of the timing code. */
  useController: boolean
  /** Analog pin it is wired to, e.g. `A0`. */
  pin: string
  /** The millisecond range the raw reading maps onto — both ends 1-5000 ms. */
  minMs: number
  maxMs: number
  /**
   * Where the knob currently sits, as a raw 0-1023 reading. The panel is not
   * here to be read, so this is what the preview plays at and what the sketch
   * starts at before its first live reading.
   */
  position: number
  /** The step delay when no controller is fitted, 1-5000 ms. */
  stepMs: number
}

export type Tile = { yy: number; xx: number } | 'full'

/**
 * Which way a band motion splits the panel, and so which way its bands travel.
 * `horizontal` stripes the rows and rotates each left or right; `vertical`
 * stripes the columns and rotates each up or down.
 */
export type BandAxis = 'horizontal' | 'vertical'

export type Motion =
  | { kind: 'static'; steps: number }
  | { kind: 'scroll'; updown: -1 | 0 | 1; leftright: -1 | 0 | 1; steps: number }
  /**
   * Equal stripes that move independently, one `directions` entry each:
   * false is the ← left / ↑ up way, true is → right / ↓ down.
   */
  | { kind: 'band'; axis: BandAxis; directions: boolean[]; steps: number }

export type Frame = {
  id: string
  name: string
  cells: Uint8Array
  tile: Tile
  mirror: boolean
  /** Emit copyToMainFull() so the pattern fills the panel instantly instead of scrolling in. */
  preload: boolean
  motion: Motion
  /**
   * This frame's speed as a multiple of the project's base step delay: 1 plays
   * at the base rate, 0.5 at half the delay (twice as fast), 2 at double it.
   * Stored as a factor rather than a millisecond count so a project driven by
   * the speed controller keeps its relative timing as the knob is turned.
   */
  speedFactor: number
  /**
   * A step delay in milliseconds that overrides the factor, so this frame holds
   * for a fixed time whatever the base speed is — and, with a controller
   * fitted, whatever the knob is doing. `null` follows the base at
   * `speedFactor`, which is the usual case.
   *
   * The factor is kept alongside rather than cleared, so a frame pinned to a
   * fixed delay and then released returns to the multiple it had.
   */
  speedMs: number | null
}

export type Group = {
  id: string
  name: string
  repeat: number
  frameIds: string[]
}

/**
 * How this project is built for size.
 *
 * Optional, so a project saved before the optimizer existed loads unchanged and
 * SerializedProject stays at version 1. Absent means the plain emitter.
 */
export type OptimizationSettings = {
  level: OptimizationLevel
  /** The passes the search settled on. */
  passes: PassId[]
  /** What the compiler actually reported for that set. */
  measured?: {
    fqbn: string
    flash: number
    sram: number
    baselineFlash: number
    baselineSram: number
    at: number
  }
}

export type Project = {
  name: string
  grid: Grid
  hardware: Hardware
  speed: SpeedControl
  /**
   * Colour of the LEDs fitted on each row, row 0 first, one entry per row.
   * The panel is driven one bit per LED, so this never reaches the sketch as
   * anything but a comment: it describes the board the pattern will run on and
   * makes the editor and preview look like it.
   */
  rowColors: string[]
  frames: Frame[]
  groups: Group[]
  optimization?: OptimizationSettings
}

/** JSON-safe shape used for localStorage + export/import. */
export type SerializedProject = Omit<Project, 'frames'> & {
  version: 2
  frames: Array<Omit<Frame, 'cells'> & { cells: string }>
}
