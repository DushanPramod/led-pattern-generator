/**
 * Where everything in the wiring diagram goes.
 *
 * Geometry lives here rather than in the component so the dialog can size the
 * drawing for its zoom, and so every connecting wire passes through one list:
 * that list is what lets crossings be drawn as hops. With power rails running
 * across the signal lanes, a plain crossing and a real connection would
 * otherwise look the same — here a dot is a connection and a hop never is.
 */

import type { Project } from '../types'
import type { ChainPlan, ChipPlan } from './wiring'
import { planColumnChain, planRowChain } from './wiring'
import type { ElectricalPlan } from './power'
import { formatAmps, planElectrical } from './power'

/**
 * The circuit has not yet been built and run against the generated sketch, so
 * the drawing says so — including in downloaded copies, which travel alone.
 */
export const UNTESTED_NOTICE =
  'Not yet tested on real hardware: this circuit and the generated sketch have not been verified together on a prototype. Treat the diagram, part choices and values as a starting point, check them against your parts’ datasheets, and test on a small panel first. If you build it, feedback on what worked or needed changing is very welcome.'

/**
 * Nets are coloured rather than labelled at every turn, and the hues are fixed
 * rather than themed: they have to stay apart on both the light and the dark
 * background, which the theme's own accents do not.
 */
export const NET = {
  column: '#3b82f6',
  row: '#10b981',
  latch: '#f59e0b',
  vcc: '#ef4444',
  gnd: '#64748b',
  dial: '#94a3b8',
} as const

export type NetName = keyof typeof NET

export type Pt = [number, number]
export type Box = { x0: number; y0: number; x1: number; y1: number }

/** An axis-aligned run of wire belonging to one net. */
export type Wire = { net: NetName; pts: Pt[]; width?: number }
export type Dot = { x: number; y: number; net: NetName }

/** The pins a 74HC595 is drawn with, and where on its box each one sits. */
export type ChipPads = {
  vcc: Pt
  sclk: Pt
  rclk: Pt
  gnd: Pt
  ser: Pt
  q7: Pt
}

export type PlacedChip = { chip: ChipPlan; box: Box; pads: ChipPads; next: boolean }

export type ArduinoSignal = {
  pin: string
  name: string
  what: string
  /** The register pin it lands on, as printed on the pinout. */
  to: string
  net: NetName
  y: number
}

export type WiringLayout = {
  width: number
  height: number
  cell: number
  rows: number
  cols: number
  columnChain: ChainPlan
  rowChain: ChainPlan
  electrical: ElectricalPlan
  hasDial: boolean
  pnp: boolean
  npn: boolean

  arduino: Box & { power: { vcc: Pt; gnd: Pt } }
  signals: ArduinoSignal[]
  dialY: number

  matrix: Box
  colChips: PlacedChip[]
  rowChips: PlacedChip[]
  /** Transistor strips, when fitted: one PNP per column, one NPN per row. */
  colDriver: Box | null
  rowDriver: Box | null
  resistorY: number
  psu: Box & { plusY: number; minusY: number }
  /** Where each rail turns the corner onto the column side. */
  rails: { vcc: Pt; gnd: Pt }

  wires: Wire[]
  dots: Dot[]
  /** Hop positions (x) along each horizontal segment, keyed `wire:segment`. */
  hops: Map<string, number[]>

  insetsY: number
  insetsPerRow: number
  notesY: number
  notes: Array<{ text: string; warn: boolean }>
}

export const INSET_W = 252
export const INSET_H = 176
export const INSET_GAP = 14
const INSET_COUNT = 5
const NOTE_LINE = 14

/* ---- crossings ------------------------------------------------------------ */

export const HOP_R = 3.5

/**
 * Finds where a vertical run of one net passes through a horizontal run of
 * another, strictly inside both. Those are the crossings that get a hop; a wire
 * ending on another is a junction and is left alone.
 */
function findHops(wires: Wire[]): Map<string, number[]> {
  type V = { x: number; y0: number; y1: number; net: NetName }
  const verticals: V[] = []
  for (const wire of wires) {
    for (let i = 1; i < wire.pts.length; i++) {
      const [ax, ay] = wire.pts[i - 1]
      const [bx, by] = wire.pts[i]
      if (ax === bx && ay !== by) {
        verticals.push({ x: ax, y0: Math.min(ay, by), y1: Math.max(ay, by), net: wire.net })
      }
    }
  }

  const hops = new Map<string, number[]>()
  wires.forEach((wire, w) => {
    for (let i = 1; i < wire.pts.length; i++) {
      const [ax, ay] = wire.pts[i - 1]
      const [bx, by] = wire.pts[i]
      if (ay !== by || ax === bx) continue
      const lo = Math.min(ax, bx)
      const hi = Math.max(ax, bx)
      const xs = verticals
        .filter(
          (v) =>
            v.net !== wire.net &&
            v.x > lo + HOP_R + 1 &&
            v.x < hi - HOP_R - 1 &&
            ay > v.y0 + 0.5 &&
            ay < v.y1 - 0.5,
        )
        .map((v) => v.x)
      if (xs.length) hops.set(`${w}:${i}`, [...new Set(xs)].sort((a, b) => a - b))
    }
  })
  return hops
}

const round = (n: number) => Math.round(n * 10) / 10

/** The SVG path for a wire, with a semicircular hop over every crossing. */
export function wirePath(wire: Wire, index: number, hops: Map<string, number[]>): string {
  const [x0, y0] = wire.pts[0]
  let d = `M${round(x0)} ${round(y0)}`
  for (let i = 1; i < wire.pts.length; i++) {
    const [ax, ay] = wire.pts[i - 1]
    const [bx, by] = wire.pts[i]
    const xs = hops.get(`${index}:${i}`)
    if (xs) {
      const forward = bx > ax
      for (const x of forward ? xs : [...xs].reverse()) {
        const near = forward ? x - HOP_R : x + HOP_R
        const far = forward ? x + HOP_R : x - HOP_R
        // Sweep so the hop always bulges upwards, whichever way the wire runs.
        d += ` L${round(near)} ${round(ay)} A${HOP_R} ${HOP_R} 0 0 ${forward ? 1 : 0} ${round(far)} ${round(ay)}`
      }
    }
    d += ` L${round(bx)} ${round(by)}`
  }
  return d
}

/* ---- text ----------------------------------------------------------------- */

/**
 * Breaks text into lines that fit `width`. SVG text never wraps on its own; 5.5 px
 * per character is a little over what the 9 px sans-serif used here averages, so
 * a line of wide letters still stays inside.
 */
export function wrapText(text: string, width: number, charWidth = 5.5): string[] {
  const perLine = Math.max(16, Math.floor(width / charWidth))
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > perLine) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function describeSpares(columnChain: ChainPlan, rowChain: ChainPlan): string {
  const parts: string[] = []
  for (const [chain, what] of [
    [columnChain, 'column'],
    [rowChain, 'row'],
  ] as const) {
    const chip = chain.chips.find((c) => c.unused.length)
    if (chip) parts.push(`Q${chip.unused[0]}–Q7 of ${what} register #${chip.index + 1}`)
  }
  if (!parts.length) return ''
  return `${parts.join(' and ')} ${
    parts.length > 1 ? 'are' : 'is'
  } never clocked into, because the chain is longer than the panel. Leave those outputs unconnected.`
}

/* ---- the layout ----------------------------------------------------------- */

/** Pad positions along a register's edge, as a fraction of its length. */
const PAD_AT = { vcc: 0.1, sclk: 0.36, rclk: 0.62, gnd: 0.88 }

export function layoutWiring(project: Project): WiringLayout {
  const { grid, hardware, speed, rowColors } = project
  const { rows, cols } = grid
  const columnChain = planColumnChain(grid, hardware)
  const rowChain = planRowChain(grid)
  const electrical = planElectrical(grid, hardware, rowColors)
  const hasDial = speed.useController
  const pnp = hardware.columnDriver === 'pnp'
  const npn = hardware.rowDriver === 'npn'

  // The LED pitch sets the width of everything downstream of it, since a
  // register box is drawn spanning exactly the eight lines it drives.
  const cell = cols >= 96 ? 10 : cols >= 64 ? 12 : cols >= 40 ? 14 : 16
  const matrixW = cols * cell
  const matrixH = rows * cell

  /* -- horizontal bands, left to right -- */
  const potW = hasDial ? 120 : 0
  const ax = potW + 8
  const aw = 168
  // Five routing lanes between the board and the panel, one per signal. The two
  // that climb to the column registers take the outer lanes and the two that
  // drop to the row registers the inner ones, which keeps the fan-out from
  // crossing itself.
  const laneX = (i: number) => ax + aw + 24 + i * 17
  const LANE_ROW_DATA = 0
  const LANE_ROW_CLOCK = 1
  const LANE_LATCH = 2
  const LANE_COL_DATA = 3
  const LANE_COL_CLOCK = 4
  // The rails sit between the lanes and the row registers: +5 V outside, GND
  // inside, which lets each turn the corner onto the column side without the
  // two ever crossing each other.
  const vccRailX = laneX(4) + 24
  const gndRailX = vccRailX + 12
  const rowChipX = gndRailX + 30
  const rowChipW = 88
  const rowDriverX = rowChipX + rowChipW + 30
  const mx = (npn ? rowDriverX + 36 : rowChipX + rowChipW) + 60

  /* -- vertical bands, top to bottom -- */
  const topLaneY = (i: number) => 52 + i * 17
  const vccRailY = 110
  const gndRailY = 122
  const colChipY = 146
  const colChipH = 58
  const colChipBottom = colChipY + colChipH
  const colDriverY = colChipBottom + 30
  const resistorY = (pnp ? colDriverY + 32 : colChipBottom) + 26
  // Room above the panel for the resistor values, one line per LED colour.
  const my = resistorY + 14 + Math.max(34, 18 + electrical.resistors.length * 11)

  const matrixRight = mx + matrixW
  const matrixBottom = my + matrixH
  const bottomLaneY = matrixBottom + 34
  const gndTieY = matrixBottom + 50

  /* -- the board -- */
  const ay = colChipY
  const pinY = (i: number) => ay + 56 + i * 26
  const ah = 56 + (5 + (hasDial ? 1 : 0)) * 26 + 24
  const arduino = {
    x0: ax,
    y0: ay,
    x1: ax + aw,
    y1: ay + ah,
    power: { vcc: [ax + aw - 40, ay + ah] as Pt, gnd: [ax + aw - 18, ay + ah] as Pt },
  }

  const psuY = Math.max(ay + ah + 44, matrixBottom + 70)
  const psu = { x0: ax, y0: psuY, x1: ax + 120, y1: psuY + 72, plusY: psuY + 24, minusY: psuY + 52 }

  /* -- registers -- */
  const placeColumn = (chip: ChipPlan, i: number): PlacedChip => {
    const box = {
      x0: mx + chip.lines[0] * cell + 5,
      x1: mx + (chip.lines.at(-1)! + 1) * cell - 5,
      y0: colChipY,
      y1: colChipBottom,
    }
    const w = box.x1 - box.x0
    const mid = (box.y0 + box.y1) / 2
    const reversed = columnChain.reversed
    return {
      chip,
      box,
      next: Boolean(columnChain.chips[reversed ? i - 1 : i + 1]),
      pads: {
        vcc: [box.x0 + w * PAD_AT.vcc, box.y0],
        sclk: [box.x0 + w * PAD_AT.sclk, box.y0],
        rclk: [box.x0 + w * PAD_AT.rclk, box.y0],
        gnd: [box.x0 + w * PAD_AT.gnd, box.y0],
        ser: [reversed ? box.x1 : box.x0, mid],
        q7: [reversed ? box.x0 : box.x1, mid],
      },
    }
  }
  const placeRow = (chip: ChipPlan, i: number): PlacedChip => {
    const box = {
      x0: rowChipX,
      x1: rowChipX + rowChipW,
      y0: my + chip.lines[0] * cell + 5,
      y1: my + (chip.lines.at(-1)! + 1) * cell - 5,
    }
    const h = box.y1 - box.y0
    const serX = box.x0 + 60
    const reversed = rowChain.reversed
    return {
      chip,
      box,
      next: Boolean(rowChain.chips[reversed ? i - 1 : i + 1]),
      pads: {
        vcc: [box.x0, box.y0 + h * PAD_AT.vcc],
        sclk: [box.x0, box.y0 + h * PAD_AT.sclk],
        rclk: [box.x0, box.y0 + h * PAD_AT.rclk],
        gnd: [box.x0, box.y0 + h * PAD_AT.gnd],
        ser: [serX, reversed ? box.y1 : box.y0],
        q7: [serX, reversed ? box.y0 : box.y1],
      },
    }
  }
  const colChips = columnChain.chips.map(placeColumn)
  const rowChips = rowChain.chips.map(placeRow)

  // The chip the Arduino feeds sits at whichever end of the panel the last
  // clocked-out line landed on, so the daisy chain may run against the lines.
  const colFirst = colChips[columnChain.reversed ? colChips.length - 1 : 0]
  const rowFirst = rowChips[rowChain.reversed ? rowChips.length - 1 : 0]
  const colLast = colChips.reduce((a, b) => (b.box.x1 > a.box.x1 ? b : a))

  const colDriver = pnp
    ? { x0: mx - 6, x1: matrixRight + 6, y0: colDriverY, y1: colDriverY + 32 }
    : null
  const rowDriver = npn
    ? { x0: rowDriverX, x1: rowDriverX + 36, y0: my - 6, y1: matrixBottom + 6 }
    : null

  /* -- wires -- */
  const wires: Wire[] = []
  const dots: Dot[] = []
  const wire = (net: NetName, pts: Pt[], width?: number) => wires.push({ net, pts, width })
  const dot = (net: NetName, [x, y]: Pt) => dots.push({ net, x, y })

  const signals: ArduinoSignal[] = [
    { pin: `D${hardware.data1}`, name: 'data1', what: 'column data', to: 'SER 14', net: 'column', y: pinY(0) },
    { pin: `D${hardware.clock1}`, name: 'clock1', what: 'column clock', to: 'SCLK 11', net: 'column', y: pinY(1) },
    { pin: `D${hardware.latch}`, name: 'latch', what: 'both chains', to: 'RCLK 12', net: 'latch', y: pinY(2) },
    { pin: `D${hardware.clock2}`, name: 'clock2', what: 'row clock', to: 'SCLK 11', net: 'row', y: pinY(3) },
    { pin: `D${hardware.data2}`, name: 'data2', what: 'row data', to: 'SER 14', net: 'row', y: pinY(4) },
  ]
  const lanes = [LANE_COL_DATA, LANE_COL_CLOCK, LANE_LATCH, LANE_ROW_CLOCK, LANE_ROW_DATA]
  signals.forEach((s, i) => wire(s.net, [[ax + aw + 3, s.y], [laneX(lanes[i]), s.y]]))

  /**
   * One signal fanned out to every register on a chain: out along a lane, then
   * a branch into each chip, with a dot where the branch leaves the lane.
   */
  const bus = (net: NetName, from: Pt, lane: number, drops: Pt[], axis: 'h' | 'v') => {
    if (!drops.length) return
    const along = drops.map((d) => (axis === 'h' ? d[0] : d[1]))
    const start = axis === 'h' ? from[0] : from[1]
    const lo = Math.min(start, ...along)
    const hi = Math.max(start, ...along)
    if (axis === 'h') {
      wire(net, [from, [from[0], lane], [hi, lane]])
      if (lo < from[0]) wire(net, [[from[0], lane], [lo, lane]])
    } else {
      wire(net, [from, [lane, from[1]], [lane, hi]])
      if (lo < from[1]) wire(net, [[lane, from[1]], [lane, lo]])
    }
    for (const [x, y] of drops) {
      wire(net, axis === 'h' ? [[x, lane], [x, y]] : [[lane, y], [x, y]])
      dot(net, axis === 'h' ? [x, lane] : [lane, y])
    }
  }

  // Column data climbs to the top lane and comes down onto the SER of the one
  // register the board actually feeds.
  const colApproachX = columnChain.reversed ? matrixRight + 28 : mx - 26
  wire('column', [
    [laneX(LANE_COL_DATA), pinY(0)],
    [laneX(LANE_COL_DATA), topLaneY(0)],
    [colApproachX, topLaneY(0)],
    [colApproachX, colFirst.pads.ser[1]],
    colFirst.pads.ser,
  ])
  bus('column', [laneX(LANE_COL_CLOCK), pinY(1)], topLaneY(1), colChips.map((c) => c.pads.sclk), 'h')
  // The latch is the shared one: it climbs to the column registers and drops to
  // the row registers off the same pin.
  bus('latch', [laneX(LANE_LATCH), pinY(2)], topLaneY(2), colChips.map((c) => c.pads.rclk), 'h')
  bus('latch', [laneX(LANE_LATCH), pinY(2)], laneX(LANE_LATCH), rowChips.map((c) => c.pads.rclk), 'v')
  bus('row', [laneX(LANE_ROW_CLOCK), pinY(3)], laneX(LANE_ROW_CLOCK), rowChips.map((c) => c.pads.sclk), 'v')
  const rowApproachY = rowChain.reversed ? bottomLaneY : my - 26
  wire('row', [
    [laneX(LANE_ROW_DATA), pinY(4)],
    [laneX(LANE_ROW_DATA), rowApproachY],
    [rowFirst.pads.ser[0], rowApproachY],
    rowFirst.pads.ser,
  ])

  // Q7′ of one chip into SER of the next: the chains themselves.
  colChips.forEach((c, i) => {
    const next = colChips[columnChain.reversed ? i - 1 : i + 1]
    if (next) wire('column', [c.pads.q7, next.pads.ser])
  })
  rowChips.forEach((c, i) => {
    const next = rowChips[rowChain.reversed ? i - 1 : i + 1]
    if (next) wire('row', [c.pads.q7, next.pads.ser])
  })

  // Power: the supply feeds two rails that run up past the row registers and
  // turn along the top of the column registers. A PNP strip takes its emitters
  // off the +5 V rail, carried on past the last column register.
  const vccEndX = pnp ? matrixRight + 44 : colLast.box.x1
  const vccRail: Pt[] = [
    [psu.x1, psu.plusY],
    [vccRailX, psu.plusY],
    [vccRailX, vccRailY],
    [vccEndX, vccRailY],
  ]
  if (colDriver) {
    const midY = (colDriver.y0 + colDriver.y1) / 2
    vccRail.push([vccEndX, midY], [colDriver.x1, midY])
  }
  wire('vcc', vccRail, 2)
  wire('gnd', [
    [psu.x1, psu.minusY],
    [gndRailX, psu.minusY],
    [gndRailX, gndRailY],
    [colLast.box.x1, gndRailY],
  ], 2)

  for (const c of colChips) {
    wire('vcc', [[c.pads.vcc[0], vccRailY], c.pads.vcc])
    dot('vcc', [c.pads.vcc[0], vccRailY])
    wire('gnd', [[c.pads.gnd[0], gndRailY], c.pads.gnd])
    dot('gnd', [c.pads.gnd[0], gndRailY])
  }
  for (const c of rowChips) {
    wire('vcc', [[vccRailX, c.pads.vcc[1]], c.pads.vcc])
    dot('vcc', [vccRailX, c.pads.vcc[1]])
    wire('gnd', [[gndRailX, c.pads.gnd[1]], c.pads.gnd])
    dot('gnd', [gndRailX, c.pads.gnd[1]])
  }

  // The board shares both rails, so its ground is the panel's ground.
  wire('vcc', [arduino.power.vcc, [arduino.power.vcc[0], psu.plusY]])
  dot('vcc', [arduino.power.vcc[0], psu.plusY])
  wire('gnd', [arduino.power.gnd, [arduino.power.gnd[0], psu.minusY]])
  dot('gnd', [arduino.power.gnd[0], psu.minusY])

  if (rowDriver) {
    const midX = (rowDriver.x0 + rowDriver.x1) / 2
    wire('gnd', [[midX, rowDriver.y1], [midX, gndTieY], [gndRailX, gndTieY]])
    dot('gnd', [gndRailX, gndTieY])
  }

  const hops = findHops(wires)

  /* -- the bottom band: insets, then notes -- */
  const width = Math.max(matrixRight + 170, 2 * (INSET_W + INSET_GAP) + 20, psu.x1 + 40)
  const insetsPerRow = Math.max(2, Math.floor((width - 20 + INSET_GAP) / (INSET_W + INSET_GAP)))
  const insetRows = Math.ceil(INSET_COUNT / insetsPerRow)
  const insetsY = Math.max(psu.y1, matrixBottom + 60) + 34

  const rowLevel = npn
    ? 'Row select is active-high: each NPN turns on when its register output goes HIGH and sinks that whole row to GND.'
    : 'Row select is active-low: the selected register output goes LOW and sinks its row; every other output stays HIGH.'
  const columnLevel = pnp
    ? 'Columns are driven through PNP transistors, which turn on when their base is pulled LOW, so the sketch clocks column bits inverted. The PNP emitters must share the registers’ +5 V.'
    : 'Each column register output sources its column directly through the column resistor: HIGH lights the LED at the selected row.'
  const spares = describeSpares(columnChain, rowChain)
  const noteText = [
    `⚠ ${UNTESTED_NOTICE}`,
    ...electrical.warnings.map((w) => `⚠ ${w}`),
    'Every 74HC595: VCC (16) and RST/MR (10) to +5 V, GND (8) and OE (13) to GND, with a 100 nF capacitor from VCC to GND beside each chip.',
    'The latch (RCLK, pin 12) is shared, so a row of column bits and its row select reach the outputs together.',
    columnLevel,
    rowLevel,
    `Power the panel from the ${electrical.supply.volts} V supply, not the Arduino’s 5 V pin — at a ${formatAmps(electrical.supply.peakA)} peak it is more than USB or the on-board regulator will give. All grounds are joined.`,
    ...(electrical.mixedForwardV
      ? [
          'Rows of different LED colours share each column resistor, so they will not light equally: the lower values suit the ~3 V colours (blue, green, white), the higher ones the ~2 V colours (red, yellow). One value serves every row in a column, so pick from the overlap and expect some difference in brightness.',
        ]
      : []),
    'A dot marks a connection. Where one wire hops over another, they are not connected.',
    ...(spares ? [spares] : []),
    columnChain.reversed
      ? `Column order is ${hardware.scanOrder}: column 0 is clocked out first, so it is carried to the far end of the chain and the register the board feeds drives the highest columns.`
      : `Column order is ${hardware.scanOrder}: column ${cols - 1} is clocked out first, so the register the board feeds drives column 0.`,
  ]
  // A warning keeps its colour on every line it wraps onto, not just the first.
  const notes = noteText.flatMap((n) =>
    wrapText(n, width - 20).map((text) => ({ text, warn: n.startsWith('⚠') })),
  )
  const notesY = insetsY + insetRows * (INSET_H + INSET_GAP) + 16
  const height = notesY + notes.length * NOTE_LINE + 8

  return {
    width,
    height,
    cell,
    rows,
    cols,
    columnChain,
    rowChain,
    electrical,
    hasDial,
    pnp,
    npn,
    arduino,
    signals,
    dialY: pinY(5),
    matrix: { x0: mx, y0: my, x1: matrixRight, y1: matrixBottom },
    colChips,
    rowChips,
    colDriver,
    rowDriver,
    resistorY,
    psu,
    rails: { vcc: [vccRailX, vccRailY], gnd: [gndRailX, gndRailY] },
    wires,
    dots,
    hops,
    insetsY,
    insetsPerRow,
    notesY,
    notes,
  }
}

/** Short part name for a strip label: "ULN2803A (8 in one chip)" → "ULN2803A". */
export const shortPart = (part: string) => part.split(' (')[0]
