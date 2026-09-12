import { DownloadIcon } from 'lucide-react'
import { useRef } from 'react'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import { REGISTER_BITS, describeChain, planColumnChain, planRowChain } from '../lib/wiring'
import type { ChainPlan, ChipPlan } from '../lib/wiring'
import { useProject } from '../state/useProject'
import type { Project } from '../types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

/**
 * Nets are coloured rather than labelled at every turn, and the four hues are
 * fixed rather than themed: they have to stay apart from each other on both the
 * light and the dark background, which the theme's own accents do not.
 */
const NET = {
  column: '#3b82f6',
  row: '#10b981',
  latch: '#f59e0b',
  power: '#94a3b8',
}

type Pt = [number, number]

const round = (n: number) => Math.round(n * 10) / 10
const points = (pts: Pt[]) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')

/** Past this the dots stop being legible and only cost DOM, so lines stand in. */
const MAX_DRAWN_LEDS = 4096

export function WiringDiagram({ project, svgRef }: {
  project: Project
  svgRef?: React.Ref<SVGSVGElement>
}) {
  const { grid, hardware, speed, rowColors } = project
  const { rows, cols } = grid
  const columnChain = planColumnChain(grid, hardware)
  const rowChain = planRowChain(grid)
  const hasDial = speed.useController

  /* ---- geometry ---------------------------------------------------------- */

  // The LED pitch sets the width of everything downstream of it, since a
  // register box is drawn spanning exactly the eight lines it drives.
  const cell = cols >= 96 ? 10 : cols >= 64 ? 12 : cols >= 40 ? 14 : 16
  const matrixW = cols * cell
  const matrixH = rows * cell

  const potW = hasDial ? 120 : 0
  const ax = potW + 8
  const aw = 148
  // Five routing lanes between the board and the panel, one per signal. Which
  // lane a signal takes is not arbitrary: the two that climb to the column
  // registers take the outer lanes and the two that drop to the row registers
  // the inner ones, which is what keeps the fan-out from crossing itself.
  const laneX = (i: number) => ax + aw + 24 + i * 17
  const LANE_ROW_DATA = 0
  const LANE_ROW_CLOCK = 1
  const LANE_LATCH = 2
  const LANE_COL_DATA = 3
  const LANE_COL_CLOCK = 4

  const rowChipX = laneX(4) + 32
  const rowChipW = 58
  const mx = rowChipX + rowChipW + 54
  const topLaneY = (i: number) => 40 + i * 17
  const colChipY = 100
  const colChipH = 54
  const my = colChipY + colChipH + 62

  const ay = colChipY
  const pinY = (i: number) => ay + 52 + i * 26
  const pinCount = hasDial ? 6 : 5
  const ah = 52 + pinCount * 26 + 10

  const matrixRight = mx + matrixW
  const matrixBottom = my + matrixH
  // Only needed to bring row data round to the far end of a reversed chain.
  const bottomLaneY = matrixBottom + 34
  const notesY =
    Math.max(matrixBottom + (rowChain.reversed ? 46 : 24), ay + ah + 24, colChipY + 240) + 26
  const width = matrixRight + 58
  const spares = describeSpares(columnChain, rowChain)
  const height = notesY + (NOTES.length + (spares ? 2 : 1)) * 15 + 4

  /* ---- chip boxes -------------------------------------------------------- */

  // A register box spans the lines it drives, so every output drops straight
  // onto its own column with nothing crossing. Which chip that is depends on
  // the scan order, and `planChain` has already worked that out.
  const colBox = (chip: ChipPlan) => {
    const x0 = mx + chip.lines[0] * cell + 5
    const x1 = mx + (chip.lines.at(-1)! + 1) * cell - 5
    return { x0, x1, w: x1 - x0, y0: colChipY, y1: colChipY + colChipH }
  }
  const rowBox = (chip: ChipPlan) => {
    const y0 = my + chip.lines[0] * cell + 5
    const y1 = my + (chip.lines.at(-1)! + 1) * cell - 5
    return { y0, y1, h: y1 - y0, x0: rowChipX, x1: rowChipX + rowChipW }
  }

  // The chip the Arduino feeds sits at whichever end of the panel the last
  // clocked-out line landed on, so the daisy chain may run against the lines.
  const colFirst = colBox(columnChain.chips[columnChain.reversed ? columnChain.chips.length - 1 : 0])
  const colDsX = columnChain.reversed ? colFirst.x1 : colFirst.x0
  const colDsApproach = columnChain.reversed ? matrixRight + 28 : mx - 26
  const rowFirst = rowBox(rowChain.chips[rowChain.reversed ? rowChain.chips.length - 1 : 0])
  const rowDsY = rowChain.reversed ? rowFirst.y1 : rowFirst.y0
  const rowDsApproach = rowChain.reversed ? bottomLaneY : my - 26

  const ledCount = rows * cols
  const drawLeds = ledCount <= MAX_DRAWN_LEDS
  const colStep = cols > 64 ? 16 : cols > 24 ? 8 : 4
  const rowStep = rows > 32 ? 8 : 4

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="h-auto w-full"
      role="img"
      aria-label={`Wiring diagram: a ${rows} by ${cols} panel driven by ${columnChain.chips.length} column and ${rowChain.chips.length} row shift registers`}
    >
      <style>{`
        .w { fill: none; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round }
        .box { fill: var(--input); stroke: var(--line); stroke-width: 1.2 }
        .t { font-family: ui-sans-serif, system-ui, 'Segoe UI', sans-serif; fill: var(--muted) }
        .name { fill: var(--text); font-weight: 600 }
        .pad { fill: var(--muted) }
      `}</style>

      {/* Painted rather than left transparent, so the exported file reads the
          same way in a viewer that has its own idea of a background. */}
      <rect width={width} height={height} fill="var(--surface)" />

      <text x={10} y={17} className="t name" fontSize={11}>
        {project.name || 'Untitled pattern'} · {rows} × {cols}
      </text>
      <text x={10} y={30} className="t" fontSize={9}>
        {describeChain(columnChain)} shifting columns, {describeChain(rowChain)} selecting rows, one
        shared latch
      </text>

      <Legend x={width - 10} y={17} hasDial={hasDial} />

      {/* ---- the panel ---- */}
      <rect
        x={mx - 6}
        y={my - 6}
        width={matrixW + 12}
        height={matrixH + 12}
        rx={4}
        fill="none"
        stroke="var(--line)"
        strokeWidth={1.2}
      />
      {Array.from({ length: rows }, (_, r) => (
        <line
          key={`rl${r}`}
          x1={mx}
          y1={my + r * cell + cell / 2}
          x2={matrixRight}
          y2={my + r * cell + cell / 2}
          stroke="var(--line)"
          strokeWidth={0.7}
        />
      ))}
      {Array.from({ length: cols }, (_, c) => (
        <line
          key={`cl${c}`}
          x1={mx + c * cell + cell / 2}
          y1={my}
          x2={mx + c * cell + cell / 2}
          y2={matrixBottom}
          stroke="var(--line)"
          strokeWidth={0.7}
        />
      ))}
      {drawLeds &&
        Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <circle
              key={`d${r}-${c}`}
              cx={mx + c * cell + cell / 2}
              cy={my + r * cell + cell / 2}
              r={Math.min(cell * 0.26, 4)}
              fill={rowColors[r] ?? DEFAULT_LED_COLOR}
              opacity={0.55}
            />
          )),
        )}
      {!drawLeds && (
        <text x={mx + matrixW / 2} y={my + matrixH / 2} className="t" fontSize={10} textAnchor="middle">
          {ledCount} LEDs, one per crossing
        </text>
      )}

      {/* Column and row numbers, thinned out so they stay readable. */}
      {Array.from({ length: cols }, (_, c) => c).filter((c) => c % colStep === 0 || c === cols - 1).map((c) => (
        <text
          key={`cn${c}`}
          x={mx + c * cell + cell / 2}
          y={matrixBottom + 13}
          className="t"
          fontSize={8}
          textAnchor="middle"
        >
          {c}
        </text>
      ))}
      {Array.from({ length: rows }, (_, r) => r).filter((r) => r % rowStep === 0 || r === rows - 1).map((r) => (
        <text
          key={`rn${r}`}
          x={matrixRight + 7}
          y={my + r * cell + cell / 2 + 3}
          className="t"
          fontSize={8}
        >
          {r}
        </text>
      ))}

      {/* ---- column registers ---- */}
      {columnChain.chips.map((chip, i) => {
        const box = colBox(chip)
        const dsX = columnChain.reversed ? box.x1 : box.x0
        const outX = columnChain.reversed ? box.x0 : box.x1
        const midY = (box.y0 + box.y1) / 2
        const next = columnChain.chips[columnChain.reversed ? i - 1 : i + 1]
        return (
          <g key={`cc${chip.index}`}>
            <rect x={box.x0} y={box.y0} width={box.w} height={colChipH} rx={3} className="box" />
            <Caption
              x={(box.x0 + box.x1) / 2}
              y={midY}
              lines={
                box.w >= 76
                  ? [
                      '74HC595',
                      `#${chip.index + 1}${
                        chip.unused.length && box.w >= 112
                          ? ` · Q${chip.unused[0]}–Q7 spare`
                          : ''
                      }`,
                    ]
                  : [`595 #${chip.index + 1}`]
              }
            />

            <Pad
              x={dsX}
              y={midY}
              label="DS"
              side={columnChain.reversed ? 'right' : 'left'}
              at={INSIDE_H[columnChain.reversed ? 'right' : 'left']}
            />
            <Pad
              x={outX}
              y={midY}
              label="Q7′"
              side={columnChain.reversed ? 'left' : 'right'}
              at={INSIDE_H[columnChain.reversed ? 'left' : 'right']}
              dim={!next}
            />
            <Pad x={box.x0 + box.w * 0.3} y={box.y0} label="SH" side="top" />
            <Pad x={box.x0 + box.w * 0.64} y={box.y0} label="ST" side="top" />

            {/* Q7′ of one chip into DS of the next: the chain itself. */}
            {next && (
              <polyline
                className="w"
                stroke={NET.column}
                points={points([
                  [outX, midY],
                  [columnChain.reversed ? colBox(next).x1 : colBox(next).x0, midY],
                ])}
              />
            )}

            {/* One output per column, each with its own series resistor. */}
            {chip.lines.map((line, k) => {
              const x = mx + line * cell + cell / 2
              return (
                <g key={`co${line}`}>
                  <polyline
                    className="w"
                    stroke={NET.column}
                    points={points([
                      [x, box.y1],
                      [x, my],
                    ])}
                  />
                  <rect
                    x={x - 2.6}
                    y={box.y1 + 22}
                    width={5.2}
                    height={14}
                    rx={1}
                    fill="var(--surface)"
                    stroke={NET.column}
                    strokeWidth={1.1}
                  />
                  {cell >= 12 && (
                    <text x={x} y={box.y1 + 13} className="t" fontSize={7} textAnchor="middle">
                      Q{chip.outputs[k]}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ---- row registers ---- */}
      {rowChain.chips.map((chip, i) => {
        const box = rowBox(chip)
        const dsY = rowChain.reversed ? box.y1 : box.y0
        const outY = rowChain.reversed ? box.y0 : box.y1
        const midX = (box.x0 + box.x1) / 2
        const next = rowChain.chips[rowChain.reversed ? i - 1 : i + 1]
        return (
          <g key={`rc${chip.index}`}>
            <rect x={rowChipX} y={box.y0} width={rowChipW} height={box.h} rx={3} className="box" />
            <Caption
              x={midX}
              y={(box.y0 + box.y1) / 2}
              lines={
                box.h >= 72
                  ? ['74HC595', `#${chip.index + 1}`]
                  : [`74HC595 #${chip.index + 1}`]
              }
            />

            <Pad
              x={midX}
              y={dsY}
              label="DS"
              side={rowChain.reversed ? 'bottom' : 'top'}
              at={INSIDE_V[rowChain.reversed ? 'bottom' : 'top']}
            />
            <Pad
              x={midX}
              y={outY}
              label="Q7′"
              side={rowChain.reversed ? 'top' : 'bottom'}
              at={INSIDE_V[rowChain.reversed ? 'top' : 'bottom']}
              dim={!next}
            />
            <Pad x={box.x0} y={box.y0 + box.h * 0.3} label="SH" side="left" />
            <Pad x={box.x0} y={box.y0 + box.h * 0.64} label="ST" side="left" />

            {next && (
              <polyline
                className="w"
                stroke={NET.row}
                points={points([
                  [midX, outY],
                  [midX, rowChain.reversed ? rowBox(next).y1 : rowBox(next).y0],
                ])}
              />
            )}

            {chip.lines.map((line, k) => {
              const y = my + line * cell + cell / 2
              return (
                <g key={`ro${line}`}>
                  <polyline
                    className="w"
                    stroke={NET.row}
                    points={points([
                      [box.x1, y],
                      [mx, y],
                    ])}
                  />
                  {cell >= 12 && (
                    <text x={box.x1 + 8} y={y - 3} className="t" fontSize={7}>
                      Q{chip.outputs[k]}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ---- the board ---- */}
      <rect x={ax} y={ay} width={aw} height={ah} rx={6} className="box" />
      <text x={ax + 12} y={ay + 22} className="t name" fontSize={10}>
        Arduino
      </text>
      <text x={ax + 12} y={ay + 35} className="t" fontSize={8}>
        Uno / Nano / Mega
      </text>
      <line x1={ax + 10} y1={ay + 42} x2={ax + aw - 10} y2={ay + 42} stroke="var(--line)" />

      {[
        { pin: hardware.data1, name: 'data1', what: 'column data', net: NET.column, lane: LANE_COL_DATA },
        { pin: hardware.clock1, name: 'clock1', what: 'column clock', net: NET.column, lane: LANE_COL_CLOCK },
        { pin: hardware.str1, name: 'str1', what: 'latch · both chains', net: NET.latch, lane: LANE_LATCH },
        { pin: hardware.clock2, name: 'clock2', what: 'row clock', net: NET.row, lane: LANE_ROW_CLOCK },
        { pin: hardware.data2, name: 'data2', what: 'row data', net: NET.row, lane: LANE_ROW_DATA },
      ].map((signal, i) => (
        <g key={signal.name}>
          <text x={ax + 12} y={pinY(i) + 3} className="t" fontSize={8}>
            <tspan className="name" fontSize={9}>
              D{signal.pin}
            </tspan>
            {'  '}
            {signal.name}
          </text>
          <text x={ax + aw - 10} y={pinY(i) - 7} className="t" fontSize={7} textAnchor="end">
            {signal.what}
          </text>
          <rect x={ax + aw - 4} y={pinY(i) - 3} width={6} height={6} className="pad" />
          <polyline
            className="w"
            stroke={signal.net}
            points={points([
              [ax + aw + 2, pinY(i)],
              [laneX(signal.lane), pinY(i)],
            ])}
          />
        </g>
      ))}

      {hasDial && <SpeedDial x={ax} y={pinY(5)} pin={speed.pin} width={potW} />}

      {/* ---- buses ---- */}
      {/* Column data climbs to the top lane and comes down onto the DS of the
          one register the board actually feeds. */}
      <polyline
        className="w"
        stroke={NET.column}
        points={points([
          [laneX(LANE_COL_DATA), pinY(0)],
          [laneX(LANE_COL_DATA), topLaneY(0)],
          [colDsApproach, topLaneY(0)],
          [colDsApproach, (colChipY + colChipY + colChipH) / 2],
          [colDsX, colChipY + colChipH / 2],
        ])}
      />
      <Bus
        net={NET.column}
        from={[laneX(LANE_COL_CLOCK), pinY(1)]}
        lane={topLaneY(1)}
        drops={columnChain.chips.map((chip) => {
          const box = colBox(chip)
          return [box.x0 + box.w * 0.3, box.y0] as Pt
        })}
        axis="horizontal"
      />
      {/* The latch is the shared one: it climbs to the column registers and
          drops to the row registers off the same pin. */}
      <Bus
        net={NET.latch}
        from={[laneX(LANE_LATCH), pinY(2)]}
        lane={topLaneY(2)}
        drops={columnChain.chips.map((chip) => {
          const box = colBox(chip)
          return [box.x0 + box.w * 0.64, box.y0] as Pt
        })}
        axis="horizontal"
      />
      <Bus
        net={NET.latch}
        from={[laneX(LANE_LATCH), pinY(2)]}
        lane={laneX(LANE_LATCH)}
        drops={rowChain.chips.map((chip) => {
          const box = rowBox(chip)
          return [box.x0, box.y0 + box.h * 0.64] as Pt
        })}
        axis="vertical"
      />
      <Bus
        net={NET.row}
        from={[laneX(LANE_ROW_CLOCK), pinY(3)]}
        lane={laneX(LANE_ROW_CLOCK)}
        drops={rowChain.chips.map((chip) => {
          const box = rowBox(chip)
          return [box.x0, box.y0 + box.h * 0.3] as Pt
        })}
        axis="vertical"
      />
      <polyline
        className="w"
        stroke={NET.row}
        points={points([
          [laneX(LANE_ROW_DATA), pinY(4)],
          [laneX(LANE_ROW_DATA), rowDsApproach],
          [rowChipX + rowChipW / 2, rowDsApproach],
          [rowChipX + rowChipW / 2, rowDsY],
        ])}
      />

      {/* ---- notes ---- */}
      <g>
        {NOTES.map((note, i) => (
          <text key={note} x={10} y={notesY + i * 15} className="t" fontSize={9}>
            {note}
          </text>
        ))}
        {spares && (
          <text x={10} y={notesY + NOTES.length * 15} className="t" fontSize={9}>
            {spares}
          </text>
        )}
        <text x={10} y={notesY + (NOTES.length + (spares ? 1 : 0)) * 15} className="t" fontSize={9}>
          {columnChain.reversed
            ? `Column order is ${hardware.scanOrder}: column 0 is clocked out first, so it is carried to the far end of the chain and the register the board feeds drives the highest columns.`
            : `Column order is ${hardware.scanOrder}: column ${cols - 1} is clocked out first, so the register the board feeds drives column 0.`}
        </text>
      </g>
    </svg>
  )
}

const NOTES = [
  'Every 74HC595: VCC and MR (pin 10) to 5 V, GND and OE (pin 13) to GND, and the board’s GND tied to the panel’s.',
  'The latch is shared, so a row of column bits and its row select land on the outputs together.',
  'Row select is active-low: the selected output goes LOW and sinks that row, every other output stays HIGH.',
  'One series resistor per column, sized for the LEDs fitted. Wires crossing without a junction dot are not connected.',
]

/** Where a serial in/out label sits: inside the box, clear of the chip's name. */
type LabelAt = { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }
const INSIDE_H: Record<'left' | 'right', LabelAt> = {
  left: { dx: 6, dy: -13, anchor: 'start' },
  right: { dx: -6, dy: -13, anchor: 'end' },
}
const INSIDE_V: Record<'top' | 'bottom', LabelAt> = {
  top: { dx: 0, dy: 12, anchor: 'middle' },
  bottom: { dx: 0, dy: -7, anchor: 'middle' },
}

/**
 * The outputs past the last panel line, which the sketch never clocks a bit
 * into. Only the far end of a chain can have them, and only when the panel is
 * not a multiple of eight.
 */
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

/**
 * A register's name, centred in its box. Boxes span only the lines they drive,
 * so the one at the end of a short chain can be half the size of its
 * neighbours — hence one line or two, depending on what actually fits, and a
 * smaller name when it has to share its line with the number.
 */
function Caption({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const top = y - ((lines.length - 1) * 12) / 2
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={line}
          x={x}
          y={top + i * 12 + 3}
          className={i === 0 ? 't name' : 't'}
          fontSize={i === 0 && lines.length > 1 ? 9 : 8}
          textAnchor="middle"
        >
          {line}
        </text>
      ))}
    </g>
  )
}

/** A pin stub on the edge of a register, with its name set beside it. */
function Pad({ x, y, label, side, dim, at }: {
  x: number
  y: number
  label: string
  side: 'top' | 'bottom' | 'left' | 'right'
  dim?: boolean
  /** Overrides the default placement just outside the box. */
  at?: LabelAt
}) {
  const horizontal = side === 'left' || side === 'right'
  const w = horizontal ? 6 : 5
  const h = horizontal ? 5 : 6
  const sign = side === 'left' || side === 'top' ? -1 : 1
  const off = 9
  return (
    <g opacity={dim ? 0.45 : 1}>
      <rect
        x={x - (horizontal ? (sign < 0 ? w : 0) : w / 2)}
        y={y - (horizontal ? h / 2 : sign < 0 ? h : 0)}
        width={w}
        height={h}
        className="pad"
      />
      <text
        x={at ? x + at.dx : horizontal ? x + sign * off : x}
        y={at ? y + at.dy : horizontal ? y + 3 : y + sign * off + (sign < 0 ? 0 : 3)}
        className="t"
        fontSize={7}
        textAnchor={at ? at.anchor : horizontal ? (sign < 0 ? 'end' : 'start') : 'middle'}
      >
        {label}
      </text>
    </g>
  )
}

/**
 * One signal fanned out to every register on a chain: along a lane, then a
 * short branch into each chip, with a dot where it actually connects.
 */
function Bus({ net, from, lane, drops, axis }: {
  net: string
  from: Pt
  lane: number
  drops: Pt[]
  axis: 'horizontal' | 'vertical'
}) {
  if (!drops.length) return null
  const ends = drops.map((d) => (axis === 'horizontal' ? d[0] : d[1]))
  const far = Math.max(...ends, axis === 'horizontal' ? from[0] : from[1])
  const near = Math.min(...ends, axis === 'horizontal' ? from[0] : from[1])
  return (
    <g>
      <polyline
        className="w"
        stroke={net}
        points={
          axis === 'horizontal'
            ? points([from, [from[0], lane], [far, lane], [near, lane]])
            : points([from, [lane, from[1]], [lane, far], [lane, near]])
        }
      />
      {drops.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <polyline
            className="w"
            stroke={net}
            points={points(axis === 'horizontal' ? [[x, lane], [x, y]] : [[lane, y], [x, y]])}
          />
          <circle
            cx={axis === 'horizontal' ? x : lane}
            cy={axis === 'horizontal' ? lane : y}
            r={2}
            fill={net}
          />
        </g>
      ))}
    </g>
  )
}

/** The analog preset controller, drawn only on builds that have one fitted. */
function SpeedDial({ x, y, pin, width }: { x: number; y: number; pin: string; width: number }) {
  const bodyX = x - width + 34
  return (
    <g>
      <text x={x + 12} y={y + 3} className="t" fontSize={8}>
        <tspan className="name" fontSize={9}>
          {pin}
        </tspan>
        {'  '}speed
      </text>
      <rect x={x - 4} y={y - 3} width={6} height={6} className="pad" />
      <rect x={bodyX} y={y - 16} width={22} height={32} rx={2} fill="var(--surface)" stroke={NET.power} strokeWidth={1.2} />
      <polyline className="w" stroke={NET.power} points={points([[bodyX + 22, y], [x - 4, y]])} />
      <polygon points={points([[bodyX + 26, y - 4], [bodyX + 26, y + 4], [bodyX + 20, y]])} fill={NET.power} />
      <polyline className="w" stroke={NET.power} points={points([[bodyX + 11, y - 16], [bodyX + 11, y - 28]])} />
      <text x={bodyX + 11} y={y - 32} className="t" fontSize={8} textAnchor="middle">
        5 V
      </text>
      <polyline className="w" stroke={NET.power} points={points([[bodyX + 11, y + 16], [bodyX + 11, y + 26]])} />
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={bodyX + 11 - (7 - i * 2.5)}
          y1={y + 26 + i * 3.5}
          x2={bodyX + 11 + (7 - i * 2.5)}
          y2={y + 26 + i * 3.5}
          stroke={NET.power}
          strokeWidth={1.2}
        />
      ))}
      <text x={bodyX - 4} y={y + 3} className="t" fontSize={7} textAnchor="end">
        preset
      </text>
    </g>
  )
}

function Legend({ x, y, hasDial }: { x: number; y: number; hasDial: boolean }) {
  const items = [
    { net: NET.column, label: 'column data & clock' },
    { net: NET.row, label: 'row data & clock' },
    { net: NET.latch, label: 'latch (shared)' },
    ...(hasDial ? [{ net: NET.power, label: 'speed preset' }] : []),
  ]
  return (
    <g>
      {items.map((item, i) => (
        <g key={item.label}>
          <line
            x1={x - 118}
            y1={y + i * 13 - 3}
            x2={x - 104}
            y2={y + i * 13 - 3}
            stroke={item.net}
            strokeWidth={2}
          />
          <text x={x - 99} y={y + i * 13} className="t" fontSize={8}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  )
}

/**
 * The circuit the sketch drives, drawn from the project's own geometry and
 * pins, so it stays the diagram for *this* build rather than a generic one.
 */
export function WiringDiagramDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project } = useProject()
  const svgRef = useRef<SVGSVGElement>(null)
  const columnChain = planColumnChain(project.grid, project.hardware)
  const rowChain = planRowChain(project.grid)

  // The drawing paints itself from the theme's CSS variables, which resolve
  // against :root and so would come out unstyled in a downloaded file. Copying
  // the handful it uses onto the clone keeps the export self-contained.
  const download = () => {
    const node = svgRef.current?.cloneNode(true) as SVGSVGElement | undefined
    if (!node) return
    const computed = getComputedStyle(document.documentElement)
    const vars = ['--surface', '--input', '--line', '--text', '--muted']
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `svg { ${vars
      .map((name) => `${name}: ${computed.getPropertyValue(name).trim()}`)
      .join('; ')} }`
    node.insertBefore(style, node.firstChild)

    const blob = new Blob([new XMLSerializer().serializeToString(node)], {
      type: 'image/svg+xml',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name.replace(/\s+/g, '-').toLowerCase() || 'pattern'}-wiring.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Wiring diagram</DialogTitle>
          <DialogDescription>
            The circuit this sketch drives: {describeChain(columnChain)} shifting the column bits,{' '}
            {describeChain(rowChain)} selecting the rows, and one latch shared by both chains so
            they land together.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border bg-card p-2">
          <WiringDiagram project={project} svgRef={svgRef} />
        </div>

        <PinTable project={project} />

        <DialogFooter showCloseButton>
          <Button type="button" variant="outline" onClick={download}>
            <DownloadIcon /> Download SVG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The same five signals as a list, for anyone wiring it up pin by pin. */
function PinTable({ project }: { project: Project }) {
  const { hardware, grid, speed } = project
  const columnChain = planColumnChain(grid, hardware)
  const rowChain = planRowChain(grid)
  const rows: Array<[string, string, string]> = [
    ['data1', `D${hardware.data1}`, `DS (pin 14) of column register #1`],
    ['clock1', `D${hardware.clock1}`, `SH_CP (pin 11) of all ${columnChain.chips.length} column registers`],
    ['data2', `D${hardware.data2}`, `DS (pin 14) of row register #1`],
    ['clock2', `D${hardware.clock2}`, `SH_CP (pin 11) of all ${rowChain.chips.length} row registers`],
    [
      'str1',
      `D${hardware.str1}`,
      `ST_CP (pin 12) of every register in both chains — ${
        columnChain.chips.length + rowChain.chips.length
      } in total`,
    ],
    ...(speed.useController
      ? ([['speed preset', speed.pin, 'Wiper of the preset controller, its ends on 5 V and GND']] as Array<
          [string, string, string]
        >)
      : []),
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="border-b py-1.5 pr-3 font-medium">Signal</th>
            <th className="border-b py-1.5 pr-3 font-medium">Pin</th>
            <th className="border-b py-1.5 font-medium">Goes to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([signal, pin, target]) => (
            <tr key={signal}>
              <td className="border-b py-1.5 pr-3">{signal}</td>
              <td className="border-b py-1.5 pr-3 font-mono tabular-nums">{pin}</td>
              <td className="border-b py-1.5 text-muted-foreground">{target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 pt-2 text-xs leading-relaxed text-muted-foreground">
        Each chain carries exactly as many bits as there are lines — {grid.cols} column bits and{' '}
        {grid.rows} row bits per refresh — so the bit clocked out first is pushed to the far end of
        the chain.{' '}
        {grid.cols % REGISTER_BITS || grid.rows % REGISTER_BITS
          ? 'The outputs past the last line are never written, so leave them unconnected.'
          : 'Both chains come out exactly full.'}{' '}
        A row output sinks every lit LED in its row, which on a large panel is more than a 74HC595
        will pass — those builds put a transistor or a ULN2803 between the register and the row.
      </p>
    </div>
  )
}
