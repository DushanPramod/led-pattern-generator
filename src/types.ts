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

export type Hardware = {
  data1: number
  str1: number
  clock1: number
  data2: number
  clock2: number
  useSpeedPot: boolean
  speedPin: string
  speedMin: number
  speedMax: number
  defaultSpeed: number
  scanOrder: ScanOrder
}

export type Tile = { yy: number; xx: number } | 'full'

export type Motion =
  | { kind: 'static'; steps: number }
  | { kind: 'scroll'; updown: -1 | 0 | 1; leftright: -1 | 0 | 1; steps: number }
  | { kind: 'band'; directions: boolean[]; steps: number }

export type Frame = {
  id: string
  name: string
  cells: Uint8Array
  tile: Tile
  mirror: boolean
  /** Emit copyToMainFull() so the pattern fills the panel instantly instead of scrolling in. */
  preload: boolean
  motion: Motion
  speed: number | null
}

export type Group = {
  id: string
  name: string
  repeat: number
  frameIds: string[]
}

export type Project = {
  name: string
  grid: Grid
  hardware: Hardware
  /**
   * Colour of the LEDs fitted on each row, row 0 first, one entry per row.
   * The panel is driven one bit per LED, so this never reaches the sketch as
   * anything but a comment: it describes the board the pattern will run on and
   * makes the editor and preview look like it.
   */
  rowColors: string[]
  frames: Frame[]
  groups: Group[]
}

/** JSON-safe shape used for localStorage + export/import. */
export type SerializedProject = Omit<Project, 'frames'> & {
  version: 1
  frames: Array<Omit<Frame, 'cells'> & { cells: string }>
}
