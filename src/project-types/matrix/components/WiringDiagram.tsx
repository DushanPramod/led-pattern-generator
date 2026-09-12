import {
  ChevronDownIcon,
  DownloadIcon,
  MaximizeIcon,
  TriangleAlertIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import type { ExportFormat } from '@/lib/diagramExport'
import { downloadDiagram } from '@/lib/diagramExport'
import type { ElectricalPlan, TransistorPick } from '../lib/power'
import { formatAmps } from '../lib/power'
import { REGISTER_BITS, describeChain } from '../lib/wiring'
import type { Box, NetName, PlacedChip, Pt, WiringLayout } from '../lib/wiringLayout'
import {
  INSET_GAP,
  INSET_H,
  INSET_W,
  NET,
  layoutWiring,
  shortPart,
  wirePath,
} from '../lib/wiringLayout'
import { useProject } from '../state/useProject'
import type { Project } from '../types'
import { ShiftRegisterPinout } from './ShiftRegisterPinout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'

const round = (n: number) => Math.round(n * 10) / 10
const points = (pts: Pt[]) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')

/** Past this the dots stop being legible and only cost DOM, so lines stand in. */
const MAX_DRAWN_LEDS = 4096

/* ============================================================================
 * The drawing
 * ========================================================================== */

export function WiringDiagram({ project, layout, svgRef, displayWidth }: {
  project: Project
  layout: WiringLayout
  svgRef?: React.Ref<SVGSVGElement>
  /** On-screen width in CSS pixels; left off, the drawing fills its container. */
  displayWidth?: number
}) {
  const { speed, rowColors } = project
  const {
    width,
    height,
    cell,
    rows,
    cols,
    columnChain,
    rowChain,
    electrical,
    matrix,
    colChips,
    rowChips,
    colDriver,
    rowDriver,
  } = layout

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
      className={displayWidth === undefined ? 'h-auto w-full' : undefined}
      style={displayWidth === undefined ? undefined : { width: displayWidth, height: 'auto' }}
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
        {describeChain(columnChain)} shifting columns
        {layout.pnp ? ' through PNP drivers' : ''}, {describeChain(rowChain)} selecting rows
        {layout.npn ? ' through NPN drivers' : ''}, one shared latch · {electrical.supply.volts} V ·
        use a supply of at least {electrical.supply.recommendedA} A
      </text>

      {/* ---- the panel ---- */}
      <rect
        x={matrix.x0 - 6}
        y={matrix.y0 - 6}
        width={matrix.x1 - matrix.x0 + 12}
        height={matrix.y1 - matrix.y0 + 12}
        rx={4}
        fill="none"
        stroke="var(--line)"
        strokeWidth={1.2}
      />
      {Array.from({ length: rows }, (_, r) => (
        <line
          key={`rl${r}`}
          x1={matrix.x0}
          y1={matrix.y0 + r * cell + cell / 2}
          x2={matrix.x1}
          y2={matrix.y0 + r * cell + cell / 2}
          stroke="var(--line)"
          strokeWidth={0.7}
        />
      ))}
      {Array.from({ length: cols }, (_, c) => (
        <line
          key={`cl${c}`}
          x1={matrix.x0 + c * cell + cell / 2}
          y1={matrix.y0}
          x2={matrix.x0 + c * cell + cell / 2}
          y2={matrix.y1}
          stroke="var(--line)"
          strokeWidth={0.7}
        />
      ))}
      {drawLeds &&
        Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <circle
              key={`d${r}-${c}`}
              cx={matrix.x0 + c * cell + cell / 2}
              cy={matrix.y0 + r * cell + cell / 2}
              r={Math.min(cell * 0.26, 4)}
              fill={rowColors[r] ?? DEFAULT_LED_COLOR}
              opacity={0.55}
            />
          )),
        )}
      {!drawLeds && (
        <text
          x={(matrix.x0 + matrix.x1) / 2}
          y={(matrix.y0 + matrix.y1) / 2}
          className="t"
          fontSize={10}
          textAnchor="middle"
        >
          {ledCount} LEDs, one per crossing
        </text>
      )}

      {/* Which side is which: the column edge is the + (anode) side, the row
          edge the − (cathode) side. */}
      <line
        x1={matrix.x0 - 6}
        y1={matrix.y0 - 6}
        x2={matrix.x1 + 6}
        y2={matrix.y0 - 6}
        stroke={NET.vcc}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <line
        x1={matrix.x0 - 6}
        y1={matrix.y0 - 6}
        x2={matrix.x0 - 6}
        y2={matrix.y1 + 6}
        stroke={NET.gnd}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Pill x={matrix.x1 + 12} y={matrix.y0 - 24} color={NET.vcc} label="+ ANODE side · columns" />
      <Pill x={matrix.x0 - 6} y={matrix.y1 + 22} color={NET.gnd} label="− CATHODE side · rows" />

      {Array.from({ length: cols }, (_, c) => c)
        .filter((c) => c % colStep === 0 || c === cols - 1)
        .map((c) => (
          <text
            key={`cn${c}`}
            x={matrix.x0 + c * cell + cell / 2}
            y={matrix.y1 + 15}
            className="t"
            fontSize={8}
            textAnchor="middle"
          >
            {c}
          </text>
        ))}
      {Array.from({ length: rows }, (_, r) => r)
        .filter((r) => r % rowStep === 0 || r === rows - 1)
        .map((r) => (
          <text
            key={`rn${r}`}
            x={matrix.x1 + 9}
            y={matrix.y0 + r * cell + cell / 2 + 3}
            className="t"
            fontSize={8}
          >
            {r}
          </text>
        ))}

      {/* ---- column outputs: register → (PNP) → resistor → column ---- */}
      {colChips.map(({ chip, box }) =>
        chip.lines.map((line, k) => {
          const x = matrix.x0 + line * cell + cell / 2
          return (
            <g key={`co${line}`}>
              <line x1={x} y1={box.y1} x2={x} y2={matrix.y0 - 6} className="w" stroke={NET.column} />
              <rect
                x={x - 2.6}
                y={layout.resistorY}
                width={5.2}
                height={14}
                rx={1}
                fill="var(--surface)"
                stroke={NET.column}
                strokeWidth={1.1}
              />
              {cell >= 12 && (
                <text x={x} y={box.y1 + 10} className="t" fontSize={7} textAnchor="middle">
                  Q{chip.outputs[k]}
                </text>
              )}
            </g>
          )
        }),
      )}
      {colDriver && (
        <DriverStrip
          box={colDriver}
          vertical={false}
          title={`${cols} × PNP`}
          detail={`${shortPart(electrical.column.transistor!.parts[0])} · base ${electrical.column.transistor!.baseResistor} · emitter → +5 V`}
        />
      )}
      <ResistorLabel layout={layout} />

      {/* ---- row outputs: register → (NPN) → row ---- */}
      {rowChips.map(({ chip, box }) =>
        chip.lines.map((line, k) => {
          const y = matrix.y0 + line * cell + cell / 2
          return (
            <g key={`ro${line}`}>
              <line x1={box.x1} y1={y} x2={matrix.x0 - 6} y2={y} className="w" stroke={NET.row} />
              {cell >= 12 && (
                <text x={box.x1 + 6} y={y - 3} className="t" fontSize={7}>
                  Q{chip.outputs[k]}
                </text>
              )}
            </g>
          )
        }),
      )}
      {rowDriver && (
        <DriverStrip
          box={rowDriver}
          vertical
          title={`${rows} × NPN`}
          detail={`${shortPart(electrical.row.transistor!.parts[0])} · emitter → GND`}
        />
      )}

      {/* ---- every connecting wire, with hops where they cross ---- */}
      {layout.wires.map((wire, i) => (
        <path
          // eslint-disable-next-line react/no-array-index-key -- wires are positional and rebuilt together
          key={i}
          d={wirePath(wire, i, layout.hops)}
          className="w"
          stroke={NET[wire.net]}
          strokeWidth={wire.width ?? 1.3}
        />
      ))}
      {layout.dots.map((d) => (
        <circle key={`${d.net}${d.x},${d.y}`} cx={d.x} cy={d.y} r={2.3} fill={NET[d.net]} />
      ))}
      <text x={layout.rails.vcc[0] + 5} y={layout.rails.vcc[1] - 4} className="t" fontSize={8} fontWeight={600} fill={NET.vcc}>
        +5 V rail
      </text>
      <text x={layout.rails.gnd[0] + 5} y={layout.rails.gnd[1] - 4} className="t" fontSize={8} fontWeight={600} fill={NET.gnd}>
        GND rail
      </text>

      {/* ---- registers ---- */}
      {colChips.map((placed) => (
        <ColumnChip key={`cc${placed.chip.index}`} placed={placed} reversed={columnChain.reversed} />
      ))}
      {rowChips.map((placed) => (
        <RowChip key={`rc${placed.chip.index}`} placed={placed} reversed={rowChain.reversed} />
      ))}

      {/* ---- the board ---- */}
      <Arduino layout={layout} />
      {layout.hasDial && (
        <SpeedDial x={layout.arduino.x0} y={layout.dialY} pin={speed.pin} width={120} />
      )}

      {/* ---- the supply ---- */}
      <Supply layout={layout} />

      {/* ---- detail insets and notes ---- */}
      <Insets layout={layout} project={project} />
      <g>
        {layout.notes.map((note, i) => (
          <text
            // eslint-disable-next-line react/no-array-index-key -- wrapped lines can repeat
            key={i}
            x={10}
            y={layout.notesY + i * 14}
            className="t"
            fontSize={9}
            fill={note.warn ? NET.latch : undefined}
          >
            {note.text}
          </text>
        ))}
      </g>
    </svg>
  )
}

/* ---- pieces of the drawing ------------------------------------------------ */

function Pill({ x, y, color, label, anchor = 'start' }: {
  x: number
  y: number
  color: string
  label: string
  anchor?: 'start' | 'end'
}) {
  const w = label.length * 5.4 + 14
  const x0 = anchor === 'start' ? x : x - w
  return (
    <g>
      <rect x={x0} y={y} width={w} height={16} rx={8} fill={color} />
      <text
        x={x0 + w / 2}
        y={y + 11}
        fontSize={9}
        fontWeight={700}
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

/** A pin stub on the edge of a register. */
function Stub({ at, side, dim }: { at: Pt; side: 'top' | 'bottom' | 'left' | 'right'; dim?: boolean }) {
  const [x, y] = at
  const horizontal = side === 'left' || side === 'right'
  const w = horizontal ? 6 : 5
  const h = horizontal ? 5 : 6
  const sign = side === 'left' || side === 'top' ? -1 : 1
  return (
    <rect
      x={x - (horizontal ? (sign < 0 ? w : 0) : w / 2)}
      y={y - (horizontal ? h / 2 : sign < 0 ? h : 0)}
      width={w}
      height={h}
      className="pad"
      opacity={dim ? 0.45 : 1}
    />
  )
}

function ColumnChip({ placed, reversed }: { placed: PlacedChip; reversed: boolean }) {
  const { chip, box, pads, next } = placed
  const w = box.x1 - box.x0
  const mid = (box.y0 + box.y1) / 2
  const named = w >= 100
  const top: Array<{ at: Pt; name: string; num: string; net: NetName }> = [
    { at: pads.vcc, name: 'VCC', num: '16·10', net: 'vcc' },
    { at: pads.sclk, name: 'SCLK', num: '11', net: 'column' },
    { at: pads.rclk, name: 'RCLK', num: '12', net: 'latch' },
    { at: pads.gnd, name: 'GND', num: '8·13', net: 'gnd' },
  ]
  return (
    <g>
      <rect x={box.x0} y={box.y0} width={w} height={box.y1 - box.y0} rx={3} className="box" />
      {top.map((p) => (
        <g key={p.name}>
          <Stub at={p.at} side="top" />
          {named && (
            <text x={p.at[0]} y={box.y0 + 9} className="t" fontSize={6.5} textAnchor="middle" fill={NET[p.net]}>
              {p.name}
            </text>
          )}
          <text x={p.at[0]} y={box.y0 + (named ? 17 : 9)} className="t" fontSize={6} textAnchor="middle">
            {p.num}
          </text>
        </g>
      ))}
      <Caption x={(box.x0 + box.x1) / 2} y={mid + 3} lines={w >= 76 ? ['74HC595', `#${chip.index + 1}`] : [`595 #${chip.index + 1}`]} />
      <Stub at={pads.ser} side={reversed ? 'right' : 'left'} />
      <Stub at={pads.q7} side={reversed ? 'left' : 'right'} dim={!next} />
      <text
        x={pads.ser[0] + (reversed ? -5 : 5)}
        y={mid + 17}
        className="t"
        fontSize={6.5}
        textAnchor={reversed ? 'end' : 'start'}
      >
        {named ? 'SER 14' : '14'}
      </text>
      <text
        x={pads.q7[0] + (reversed ? 5 : -5)}
        y={mid + 17}
        className="t"
        fontSize={6.5}
        textAnchor={reversed ? 'start' : 'end'}
        opacity={next ? 1 : 0.55}
      >
        {named ? 'Q7′ 9' : '9'}
      </text>
    </g>
  )
}

function RowChip({ placed, reversed }: { placed: PlacedChip; reversed: boolean }) {
  const { chip, box, pads, next } = placed
  const h = box.y1 - box.y0
  const named = h >= 100
  const left: Array<{ at: Pt; name: string; num: string; net: NetName }> = [
    { at: pads.vcc, name: 'VCC', num: '16·10', net: 'vcc' },
    { at: pads.sclk, name: 'SCLK', num: '11', net: 'row' },
    { at: pads.rclk, name: 'RCLK', num: '12', net: 'latch' },
    { at: pads.gnd, name: 'GND', num: '8·13', net: 'gnd' },
  ]
  const serTop = !reversed
  return (
    <g>
      <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={h} rx={3} className="box" />
      {left.map((p) => (
        <g key={p.name}>
          <Stub at={p.at} side="left" />
          <text x={box.x0 + 4} y={p.at[1] + 2.5} className="t" fontSize={h >= 60 ? 6.5 : 5.5}>
            {named && <tspan fill={NET[p.net]}>{p.name} </tspan>}
            {p.num}
          </text>
        </g>
      ))}
      <Caption
        x={pads.ser[0]}
        y={(box.y0 + box.y1) / 2}
        lines={h >= 72 ? ['74HC595', `#${chip.index + 1}`] : [`595 #${chip.index + 1}`]}
      />
      <Stub at={pads.ser} side={serTop ? 'top' : 'bottom'} />
      <Stub at={pads.q7} side={serTop ? 'bottom' : 'top'} dim={!next} />
      <text
        x={pads.ser[0]}
        y={serTop ? box.y0 + 11 : box.y1 - 5}
        className="t"
        fontSize={6.5}
        textAnchor="middle"
      >
        {h >= 60 ? 'SER 14' : '14'}
      </text>
      <text
        x={pads.q7[0]}
        y={serTop ? box.y1 - 5 : box.y0 + 11}
        className="t"
        fontSize={6.5}
        textAnchor="middle"
        opacity={next ? 1 : 0.55}
      >
        {h >= 60 ? 'Q7′ 9' : '9'}
      </text>
    </g>
  )
}

/**
 * A register's name, centred. Boxes span only the lines they drive, so the one
 * at the end of a short chain can be half the size of its neighbours — hence
 * one line or two, depending on what fits.
 */
function Caption({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const top = y - ((lines.length - 1) * 11) / 2
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={line}
          x={x}
          y={top + i * 11 + 3}
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

/** The transistor array, drawn as one strip the lines pass through. */
function DriverStrip({ box, vertical, title, detail }: {
  box: Box
  vertical: boolean
  title: string
  detail: string
}) {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const room = vertical ? h : w
  return (
    <g>
      <rect x={box.x0} y={box.y0} width={w} height={h} rx={4} className="box" fillOpacity={0.96} strokeDasharray="4 2" />
      <text
        x={cx}
        y={cy}
        className="t"
        fontSize={8}
        textAnchor="middle"
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      >
        <tspan className="name" fontSize={9} x={cx} dy={room >= 200 ? -2 : 3}>
          {title}
        </tspan>
        {room >= 200 && (
          <tspan x={cx} dy={10}>
            {detail}
          </tspan>
        )}
      </text>
    </g>
  )
}

function ResistorLabel({ layout }: { layout: WiringLayout }) {
  const { electrical, matrix, resistorY, cols } = layout
  const x = matrix.x0 - 14
  return (
    <g>
      <text x={x} y={resistorY + 6} className="t name" fontSize={8.5} textAnchor="end">
        R × {cols} · one per column
      </text>
      {electrical.resistors.map((r, i) => (
        <g key={r.color}>
          <circle cx={x - 3} cy={resistorY + 15 + i * 11} r={3} fill={r.hex} />
          <text x={x - 10} y={resistorY + 18 + i * 11} className="t" fontSize={8} textAnchor="end">
            {r.color} rows: {r.ohms ? r.label : 'too little voltage'}
          </text>
        </g>
      ))}
    </g>
  )
}

function Arduino({ layout }: { layout: WiringLayout }) {
  const { arduino, signals } = layout
  const w = arduino.x1 - arduino.x0
  return (
    <g>
      <rect x={arduino.x0} y={arduino.y0} width={w} height={arduino.y1 - arduino.y0} rx={6} className="box" />
      <text x={arduino.x0 + 12} y={arduino.y0 + 22} className="t name" fontSize={10}>
        Arduino
      </text>
      <text x={arduino.x0 + 12} y={arduino.y0 + 35} className="t" fontSize={8}>
        Uno / Nano / Mega
      </text>
      <line
        x1={arduino.x0 + 10}
        y1={arduino.y0 + 42}
        x2={arduino.x1 - 10}
        y2={arduino.y0 + 42}
        stroke="var(--line)"
      />
      {signals.map((s) => (
        <g key={s.name}>
          <text x={arduino.x0 + 12} y={s.y + 3} className="t" fontSize={8}>
            <tspan className="name" fontSize={10} fill={NET[s.net]}>
              {s.pin}
            </tspan>
            {'  '}
            {s.name}
          </text>
          <text x={arduino.x1 - 10} y={s.y - 7} className="t" fontSize={7} textAnchor="end">
            {s.what} → {s.to}
          </text>
          <rect x={arduino.x1 - 4} y={s.y - 3} width={6} height={6} className="pad" />
        </g>
      ))}
      <text x={arduino.power.vcc[0]} y={arduino.y1 - 6} className="t" fontSize={7} textAnchor="middle" fill={NET.vcc}>
        5V
      </text>
      <text x={arduino.power.gnd[0]} y={arduino.y1 - 6} className="t" fontSize={7} textAnchor="middle" fill={NET.gnd}>
        GND
      </text>
      <rect x={arduino.power.vcc[0] - 3} y={arduino.y1 - 2} width={6} height={5} className="pad" />
      <rect x={arduino.power.gnd[0] - 3} y={arduino.y1 - 2} width={6} height={5} className="pad" />
    </g>
  )
}

function Supply({ layout }: { layout: WiringLayout }) {
  const { psu, electrical } = layout
  return (
    <g>
      <rect x={psu.x0} y={psu.y0} width={psu.x1 - psu.x0} height={psu.y1 - psu.y0} rx={6} className="box" strokeWidth={1.6} />
      <text x={psu.x0 + 10} y={psu.y0 + 17} className="t name" fontSize={10}>
        {electrical.supply.volts} V DC supply
      </text>
      <text x={psu.x0 + 10} y={psu.y0 + 32} className="t name" fontSize={9} fill={NET.vcc}>
        ≥ {electrical.supply.recommendedA} A
      </text>
      <text x={psu.x0 + 10} y={psu.y0 + 46} className="t" fontSize={8}>
        peak ≈ {formatAmps(electrical.supply.peakA)}
      </text>
      <text x={psu.x0 + 10} y={psu.y0 + 60} className="t" fontSize={7}>
        one full row lit
      </text>
      <text x={psu.x1 - 6} y={psu.plusY + 3.5} className="t name" fontSize={11} textAnchor="end" fill={NET.vcc}>
        +
      </text>
      <text x={psu.x1 - 6} y={psu.minusY + 3.5} className="t name" fontSize={11} textAnchor="end" fill={NET.gnd}>
        −
      </text>
    </g>
  )
}

/** The analog preset controller, drawn only on builds that have one fitted. */
function SpeedDial({ x, y, pin, width }: { x: number; y: number; pin: string; width: number }) {
  const bodyX = x - width + 34
  return (
    <g>
      <text x={x + 12} y={y + 3} className="t" fontSize={8}>
        <tspan className="name" fontSize={10}>
          {pin}
        </tspan>
        {'  '}speed
      </text>
      <rect x={x - 4} y={y - 3} width={6} height={6} className="pad" />
      <rect x={bodyX} y={y - 16} width={22} height={32} rx={2} fill="var(--surface)" stroke={NET.dial} strokeWidth={1.2} />
      <polyline className="w" stroke={NET.dial} points={points([[bodyX + 22, y], [x - 4, y]])} />
      <polygon points={points([[bodyX + 26, y - 4], [bodyX + 26, y + 4], [bodyX + 20, y]])} fill={NET.dial} />
      <polyline className="w" stroke={NET.vcc} points={points([[bodyX + 11, y - 16], [bodyX + 11, y - 28]])} />
      <text x={bodyX + 11} y={y - 32} className="t" fontSize={8} textAnchor="middle" fill={NET.vcc}>
        5 V
      </text>
      <polyline className="w" stroke={NET.gnd} points={points([[bodyX + 11, y + 16], [bodyX + 11, y + 26]])} />
      <Ground x={bodyX + 11} y={y + 26} />
      <text x={bodyX - 4} y={y + 3} className="t" fontSize={7} textAnchor="end">
        preset
      </text>
    </g>
  )
}

/* ---- schematic symbols for the insets -------------------------------------- */

function Ground({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={x - (7 - i * 2.5)}
          y1={y + i * 3.5}
          x2={x + (7 - i * 2.5)}
          y2={y + i * 3.5}
          stroke={NET.gnd}
          strokeWidth={1.3}
        />
      ))}
    </g>
  )
}

function Resistor({ x, y, vertical, net, label }: {
  x: number
  y: number
  vertical?: boolean
  net: NetName
  label?: string
}) {
  const w = vertical ? 8 : 22
  const h = vertical ? 22 : 8
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1.5} fill="var(--surface)" stroke={NET[net]} strokeWidth={1.3} />
      {label && (
        <text
          x={vertical ? x + 8 : x}
          y={vertical ? y + 3 : y - 7}
          className="t"
          fontSize={8}
          textAnchor={vertical ? 'start' : 'middle'}
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** An LED drawn anode on top, conducting downwards. */
function Led({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <polygon points={points([[x - 8, y - 6], [x + 8, y - 6], [x, y + 6]])} fill={color} stroke={color} strokeWidth={1} />
      <line x1={x - 8} y1={y + 6} x2={x + 8} y2={y + 6} stroke={color} strokeWidth={2} />
      <line x1={x + 10} y1={y - 5} x2={x + 16} y2={y - 11} stroke={color} strokeWidth={1} />
      <line x1={x + 12} y1={y} x2={x + 18} y2={y - 6} stroke={color} strokeWidth={1} />
    </g>
  )
}

/**
 * A bipolar transistor with its base to the left. `emitterUp` draws the
 * emitter on top — how a PNP high-side switch sits, off the supply.
 */
function Bjt({ x, y, type, emitterUp }: { x: number; y: number; type: 'NPN' | 'PNP'; emitterUp: boolean }) {
  const s = emitterUp ? -1 : 1
  const ink = 'var(--text)'
  // Emitter diagonal, and the arrow along it: out of the base for NPN, into it for PNP.
  const e0: Pt = [x - 5, y + 4 * s]
  const e1: Pt = [x + 6, y + 11 * s]
  const mx = (e0[0] + e1[0]) / 2
  const my = (e0[1] + e1[1]) / 2
  const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1])
  let dx = (e1[0] - e0[0]) / len
  let dy = (e1[1] - e0[1]) / len
  if (type === 'PNP') {
    dx = -dx
    dy = -dy
  }
  const tip: Pt = [mx + dx * 3.5, my + dy * 3.5]
  const back: Pt = [mx - dx * 2.5, my - dy * 2.5]
  const arrow: Pt[] = [tip, [back[0] - dy * 3, back[1] + dx * 3], [back[0] + dy * 3, back[1] - dx * 3]]
  return (
    <g>
      <circle cx={x} cy={y} r={13} fill="var(--surface)" stroke={ink} strokeWidth={1.1} />
      <line x1={x - 20} y1={y} x2={x - 5} y2={y} stroke={ink} strokeWidth={1.3} />
      <line x1={x - 5} y1={y - 8} x2={x - 5} y2={y + 8} stroke={ink} strokeWidth={2} />
      <polyline className="w" stroke={ink} points={points([[x - 5, y - 4 * s], [x + 6, y - 11 * s], [x + 6, y - 22 * s]])} />
      <polyline className="w" stroke={ink} points={points([e0, e1, [x + 6, y + 22 * s]])} />
      <polygon points={points(arrow)} fill={ink} />
    </g>
  )
}

/* ---- insets ---------------------------------------------------------------- */

function InsetFrame({ x, y, title, children }: { x: number; y: number; title: string; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={INSET_W} height={INSET_H} rx={6} fill="none" stroke="var(--line)" strokeWidth={1.2} />
      <text x={10} y={17} className="t name" fontSize={9.5}>
        {title}
      </text>
      {children}
    </g>
  )
}

function Lines({ x, y, lines, size = 8 }: { x: number; y: number; lines: Array<string | [string, string]>; size?: number }) {
  return (
    <g>
      {lines.map((line, i) => {
        const [text, color] = typeof line === 'string' ? [line, undefined] : line
        return (
          // eslint-disable-next-line react/no-array-index-key -- fixed text block
          <text key={i} x={x} y={y + i * (size + 3.5)} className="t" fontSize={size} fill={color}>
            {text}
          </text>
        )
      })}
    </g>
  )
}

function Insets({ layout, project }: { layout: WiringLayout; project: Project }) {
  const { electrical, insetsY, insetsPerRow } = layout
  const at = (i: number) => ({
    x: 10 + (i % insetsPerRow) * (INSET_W + INSET_GAP),
    y: insetsY + Math.floor(i / insetsPerRow) * (INSET_H + INSET_GAP),
  })
  const firstColor = project.rowColors[0] ?? DEFAULT_LED_COLOR
  const r0 = electrical.resistors[0]
  return (
    <g>
      <LedInset {...at(0)} color={firstColor} />
      <ColumnInset {...at(1)} electrical={electrical} resistor={r0?.ohms ? r0.label : 'R'} />
      <RowInset {...at(2)} electrical={electrical} cols={layout.cols} />
      <PowerInset {...at(3)} electrical={electrical} />
      <LegendInset {...at(4)} layout={layout} />
    </g>
  )
}

function LedInset({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <InsetFrame x={x} y={y} title="LED orientation · + and −">
      <line x1={50} y1={30} x2={50} y2={78} stroke={NET.column} strokeWidth={1.6} />
      <Led x={50} y={90} color={color} />
      <line x1={50} y1={96} x2={50} y2={130} stroke={NET.row} strokeWidth={1.6} />
      <line x1={14} y1={130} x2={96} y2={130} stroke={NET.row} strokeWidth={1.6} />
      <circle cx={50} cy={130} r={2.3} fill={NET.row} />
      <text x={56} y={42} fontSize={9} fontWeight={700} fill={NET.vcc} className="t">
        + anode
      </text>
      <text x={56} y={120} fontSize={9} fontWeight={700} fill={NET.gnd} className="t">
        − cathode
      </text>
      <text x={14} y={145} className="t" fontSize={7.5}>
        row line
      </text>
      <text x={40} y={28} className="t" fontSize={7.5} textAnchor="end">
        column
      </text>
      <Lines
        x={118}
        y={38}
        lines={[
          ['Anode (+)', NET.vcc],
          'long leg, round side',
          '→ the column line',
          '',
          ['Cathode (−)', NET.gnd],
          'short leg, flat edge',
          '→ the row line',
          '',
          'Columns are the + side,',
          'rows the − side of the panel.',
        ]}
      />
    </InsetFrame>
  )
}

function transistorLines(t: TransistorPick): string[] {
  return [`${t.type}: ${t.parts.slice(0, 3).map(shortPart).join(' / ')}`, `base resistor ${t.baseResistor}`]
}

function ColumnInset({ x, y, electrical, resistor }: { x: number; y: number; electrical: ElectricalPlan; resistor: string }) {
  const t = electrical.column.transistor
  return (
    <InsetFrame x={x} y={y} title={`Column channel · ${t ? 'PNP driver' : 'direct'} (× each column)`}>
      <rect x={10} y={t ? 82 : 52} width={36} height={22} rx={3} className="box" />
      <text x={28} y={t ? 96 : 66} className="t name" fontSize={7.5} textAnchor="middle">
        595 Q
      </text>
      {t ? (
        <g>
          <line x1={46} y1={93} x2={60} y2={93} stroke={NET.column} strokeWidth={1.3} />
          <Resistor x={71} y={93} net="column" label="1 kΩ" />
          <line x1={82} y1={93} x2={92} y2={93} stroke={NET.column} strokeWidth={1.3} />
          <Bjt x={112} y={93} type="PNP" emitterUp />
          <line x1={118} y1={71} x2={118} y2={40} stroke={NET.vcc} strokeWidth={1.3} />
          <text x={124} y={44} className="t name" fontSize={8} fill={NET.vcc}>
            +5 V
          </text>
          <text x={124} y={62} className="t" fontSize={6.5}>
            E
          </text>
          <text x={124} y={128} className="t" fontSize={6.5}>
            C
          </text>
          <line x1={118} y1={115} x2={118} y2={124} stroke={NET.column} strokeWidth={1.3} />
          <Resistor x={118} y={136} vertical net="column" />
          <line x1={118} y1={147} x2={118} y2={164} stroke={NET.column} strokeWidth={1.3} />
          <text x={124} y={162} className="t name" fontSize={8} fill={NET.vcc}>
            → column (+)
          </text>
          <text x={128} y={140} className="t" fontSize={7.5}>
            {resistor}
          </text>
          <Lines
            x={170}
            y={40}
            size={7.5}
            lines={[...transistorLines(t), '', 'Q LOW → on', `≤ ${electrical.column.ledMa.max} mA`, 'per LED']}
          />
        </g>
      ) : (
        <g>
          <line x1={46} y1={63} x2={70} y2={63} stroke={NET.column} strokeWidth={1.3} />
          <Resistor x={82} y={63} net="column" label={resistor} />
          <line x1={93} y1={63} x2={130} y2={63} stroke={NET.column} strokeWidth={1.3} />
          <text x={134} y={66} className="t name" fontSize={8} fill={NET.vcc}>
            column (+)
          </text>
          <Lines
            x={12}
            y={98}
            lines={[
              'The register output sources the column itself:',
              'Q HIGH lights the LED on the selected row.',
              `Size R for ${electrical.column.ledMa.min}–${electrical.column.ledMa.max} mA per LED — eight`,
              'lit outputs must stay under 70 mA per chip.',
              'Tick “Column transistors” for brighter LEDs.',
            ]}
          />
        </g>
      )}
    </InsetFrame>
  )
}

function RowInset({ x, y, electrical, cols }: { x: number; y: number; electrical: ElectricalPlan; cols: number }) {
  const t = electrical.row.transistor
  return (
    <InsetFrame x={x} y={y} title={`Row channel · ${t ? 'NPN driver' : 'direct'} (× each row)`}>
      {t ? (
        <g>
          <text x={124} y={40} className="t name" fontSize={8} fill={NET.gnd}>
            ← row (−)
          </text>
          <line x1={118} y1={30} x2={118} y2={71} stroke={NET.row} strokeWidth={1.3} />
          <text x={124} y={62} className="t" fontSize={6.5}>
            C
          </text>
          <rect x={10} y={82} width={36} height={22} rx={3} className="box" />
          <text x={28} y={96} className="t name" fontSize={7.5} textAnchor="middle">
            595 Q
          </text>
          <line x1={46} y1={93} x2={60} y2={93} stroke={NET.row} strokeWidth={1.3} />
          <Resistor x={71} y={93} net="row" label={t.baseResistor.startsWith('none') ? '1 kΩ' : t.baseResistor} />
          <line x1={82} y1={93} x2={92} y2={93} stroke={NET.row} strokeWidth={1.3} />
          <Bjt x={112} y={93} type="NPN" emitterUp={false} />
          <text x={124} y={128} className="t" fontSize={6.5}>
            E
          </text>
          <line x1={118} y1={115} x2={118} y2={140} stroke={NET.gnd} strokeWidth={1.3} />
          <Ground x={118} y={140} />
          <text x={128} y={148} className="t name" fontSize={8} fill={NET.gnd}>
            GND
          </text>
          <Lines
            x={170}
            y={40}
            size={7.5}
            lines={[`NPN: ${shortPart(t.parts[0])}`, ...t.parts.slice(1, 3).map((p) => `or ${shortPart(p)}`), '', 'Q HIGH → on', `sinks ≤ ${Math.round(electrical.row.sinkMa)} mA`]}
          />
          <text x={12} y={168} className="t" fontSize={7}>
            {t.parts[0].startsWith('ULN') ? 'ULN2803A: inputs straight from Q0–Q7, no resistors.' : `${cols} LEDs share one row transistor.`}
          </text>
        </g>
      ) : (
        <g>
          <text x={12} y={44} className="t name" fontSize={8} fill={NET.gnd}>
            row (−)
          </text>
          <line x1={48} y1={41} x2={100} y2={41} stroke={NET.row} strokeWidth={1.3} />
          <rect x={100} y={30} width={40} height={22} rx={3} className="box" />
          <text x={120} y={44} className="t name" fontSize={7.5} textAnchor="middle">
            595 Q
          </text>
          <Lines
            x={12}
            y={72}
            lines={[
              'The register output sinks the whole row:',
              'Q LOW selects it, every other Q stays HIGH.',
              `A lit row sinks up to ${Math.round(electrical.row.sinkMa)} mA through one pin;`,
              'a 74HC595 output is rated 35 mA at most.',
              '',
              electrical.row.sinkMa > 35
                ? '⚠ Over the limit — tick “Row transistors”.'
                : 'Within the limit for this panel.',
            ]}
          />
        </g>
      )}
    </InsetFrame>
  )
}

function PowerInset({ x, y, electrical }: { x: number; y: number; electrical: ElectricalPlan }) {
  const { supply, column, row } = electrical
  return (
    <InsetFrame x={x} y={y} title="Power supply (estimate)">
      <text x={12} y={42} fontSize={18} fontWeight={700} className="t name">
        {supply.volts} V
      </text>
      <text x={62} y={42} fontSize={18} fontWeight={700} fill={NET.vcc} className="t">
        ≥ {supply.recommendedA} A
      </text>
      <Lines
        x={12}
        y={60}
        lines={[
          `Peak ≈ ${formatAmps(supply.peakA)}: one row fully lit`,
          `  ${Math.round(row.sinkMa)} mA LEDs (${column.ledMa.max} mA each)`,
          column.transistor ? '  + PNP base current, + Arduino' : '  + Arduino',
          'Rated 1.5× the peak, rounded up.',
          '',
          [`VCC 16 + RST 10 → +5 V`, NET.vcc],
          [`GND 8 + OE 13 → GND`, NET.gnd],
          '100 nF at every 74HC595, 470–1000 µF',
          'across the supply near the panel.',
        ]}
      />
    </InsetFrame>
  )
}

function LegendInset({ x, y, layout }: { x: number; y: number; layout: WiringLayout }) {
  const items: Array<{ net: NetName; label: string }> = [
    { net: 'column', label: 'column data & clock' },
    { net: 'row', label: 'row data & clock' },
    { net: 'latch', label: 'latch (shared by both chains)' },
    { net: 'vcc', label: '+5 V' },
    { net: 'gnd', label: 'GND' },
    ...(layout.hasDial ? [{ net: 'dial' as NetName, label: 'speed preset' }] : []),
  ]
  return (
    <InsetFrame x={x} y={y} title="Legend">
      {items.map((item, i) => (
        <g key={item.label}>
          <line x1={12} y1={34 + i * 14} x2={30} y2={34 + i * 14} stroke={NET[item.net]} strokeWidth={2.2} />
          <text x={36} y={37 + i * 14} className="t" fontSize={8}>
            {item.label}
          </text>
        </g>
      ))}
      {(() => {
        const yy = 34 + items.length * 14 + 6
        return (
          <g>
            <line x1={12} y1={yy} x2={30} y2={yy} stroke="var(--text)" strokeWidth={1.3} />
            <circle cx={21} cy={yy} r={2.3} fill="var(--text)" />
            <text x={36} y={yy + 3} className="t" fontSize={8}>
              dot: connected
            </text>
            <path
              d={`M12 ${yy + 16} L17.5 ${yy + 16} A3.5 3.5 0 0 1 24.5 ${yy + 16} L30 ${yy + 16}`}
              className="w"
              stroke="var(--text)"
            />
            <line x1={21} y1={yy + 8} x2={21} y2={yy + 24} stroke="var(--muted)" strokeWidth={1.3} />
            <text x={36} y={yy + 19} className="t" fontSize={8}>
              hop: crossing, not connected
            </text>
            <text x={12} y={yy + 36} className="t" fontSize={8}>
              Pin numbers are the 74HC595 package pins.
            </text>
          </g>
        )
      })()}
    </InsetFrame>
  )
}

/* ============================================================================
 * The dialog
 * ========================================================================== */

const ZOOM_MIN = 0.2
const ZOOM_MAX = 4
const ZOOM_STEP = 1.25
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/**
 * The circuit the sketch drives, drawn from the project's own geometry, pins
 * and drivers, so it stays the diagram for *this* build rather than a generic one.
 */
export function WiringDiagramDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, dispatch } = useProject()
  const layout = useMemo(() => layoutWiring(project), [project])
  const diagramRef = useRef<SVGSVGElement>(null)
  const pinoutRef = useRef<SVGSVGElement>(null)

  // Null follows the viewport ("fit"); a number is a zoom the user picked.
  const [zoom, setZoom] = useState<number | null>(null)
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(1)
  const [exportError, setExportError] = useState<string | null>(null)
  const scale = zoom ?? fit

  useEffect(() => {
    if (!viewport) return
    const measure = () => setFit(clampZoom((viewport.clientWidth - 18) / layout.width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport, layout.width])

  // Ctrl/⌘ + wheel zooms the drawing rather than the page. It has to be a
  // non-passive native listener, or the browser zooms the page anyway.
  useEffect(() => {
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setZoom((z) => clampZoom((z ?? fit) * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [viewport, fit])

  const { electrical, columnChain, rowChain } = layout
  const slug = project.name.replace(/\s+/g, '-').toLowerCase() || 'pattern'

  const download = (format: ExportFormat) => {
    setExportError(null)
    downloadDiagram([diagramRef.current, pinoutRef.current], format, `${slug}-wiring`).catch(
      (err: Error) => setExportError(err.message),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[min(1320px,96vw)]">
        <DialogHeader>
          <DialogTitle>Wiring diagram</DialogTitle>
          <DialogDescription>
            The circuit this sketch drives: {describeChain(columnChain)} shifting the column bits,{' '}
            {describeChain(rowChain)} selecting the rows, and one latch shared by both chains so
            they land together.
          </DialogDescription>
        </DialogHeader>

        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="m-0">
            <span className="font-semibold">Not yet tested on real hardware.</span> This circuit and
            the generated sketch have not been verified together on a prototype. Treat the diagram,
            part choices and values as a starting point: check them against your parts’ datasheets
            and try a small panel first. If you build it, feedback on what worked or needed changing
            is very welcome.
          </p>
        </div>

        {/* ---- toolbar ---- */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Label className="text-sm font-normal">
              <Checkbox
                checked={layout.pnp}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'setHardware', patch: { columnDriver: checked === true ? 'pnp' : 'direct' } })
                }
                aria-label="Column transistors (PNP)"
              />
              Column transistors <span className="text-muted-foreground">· PNP</span>
            </Label>
            <Label className="text-sm font-normal">
              <Checkbox
                checked={layout.npn}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'setHardware', patch: { rowDriver: checked === true ? 'npn' : 'direct' } })
                }
                aria-label="Row transistors (NPN)"
              />
              Row transistors <span className="text-muted-foreground">· NPN</span>
            </Label>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Zoom out (Ctrl + scroll)"
              aria-label="Zoom out"
              disabled={scale <= ZOOM_MIN}
              onClick={() => setZoom(clampZoom(scale / ZOOM_STEP))}
            >
              <ZoomOutIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-14 tabular-nums"
              title="Actual size"
              onClick={() => setZoom(1)}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Zoom in (Ctrl + scroll)"
              aria-label="Zoom in"
              disabled={scale >= ZOOM_MAX}
              onClick={() => setZoom(clampZoom(scale * ZOOM_STEP))}
            >
              <ZoomInIcon />
            </Button>
            <Button
              type="button"
              variant={zoom === null ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setZoom(null)}
            >
              <MaximizeIcon /> Fit
            </Button>
          </div>
          {(layout.pnp || layout.npn) && (
            <p className="m-0 basis-full text-xs leading-relaxed text-muted-foreground">
              The Arduino sketch follows these:{' '}
              {[
                layout.pnp && 'column bits are clocked inverted (LOW lights a PNP-driven column)',
                layout.npn && 'row select becomes active-high (HIGH turns a row’s NPN on)',
              ]
                .filter(Boolean)
                .join(', and ')}
              . Flash it only onto a board wired this way.
            </p>
          )}
        </div>

        {/* ---- the drawing, with the pinout and the numbers beside it ---- */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={setViewport}
            className="max-h-[68vh] min-w-0 overflow-auto rounded-lg border bg-card p-2"
          >
            <WiringDiagram
              project={project}
              layout={layout}
              svgRef={diagramRef}
              displayWidth={layout.width * scale}
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-4 lg:max-h-[68vh] lg:overflow-y-auto">
            <ElectricalSummary electrical={electrical} />
            <div className="rounded-lg border bg-card p-1">
              <ShiftRegisterPinout project={project} svgRef={pinoutRef} />
            </div>
          </aside>
        </div>

        <PinTable project={project} />

        <DialogFooter showCloseButton>
          {exportError && (
            <p className="m-0 mr-auto self-center text-xs text-destructive">{exportError}</p>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                <DownloadIcon /> Download <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Diagram + pinout as</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => download('png')}>PNG image</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download('jpg')}>JPG image</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download('svg')}>SVG vector</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Supply, resistors and transistor picks as plain text, beside the drawing. */
function ElectricalSummary({ electrical }: { electrical: ElectricalPlan }) {
  const { supply, column, row, resistors, warnings } = electrical
  const heading = 'text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground'
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className={heading}>Power supply</span>
        <span className="text-lg font-semibold tabular-nums">
          {supply.volts} V · ≥ {supply.recommendedA} A
        </span>
        <span className="text-muted-foreground">
          Estimated peak {formatAmps(supply.peakA)} — one full row of LEDs lit at {column.ledMa.max} mA
          each, plus drivers and the Arduino.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className={heading}>Column resistors · one per column</span>
        {resistors.map((r) => (
          <span key={r.color} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.hex }} />
            <span>
              {r.color} <span className="text-muted-foreground">(≈{r.forwardV} V)</span>:{' '}
              <span className="font-medium tabular-nums">{r.ohms ? r.label : 'too little voltage'}</span>
            </span>
          </span>
        ))}
        <span className="text-muted-foreground">
          Sized for {column.ledMa.min}–{column.ledMa.max} mA per LED. Lower values are brighter.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className={heading}>Column drivers</span>
        {column.transistor ? (
          <>
            <span>
              <span className="font-medium">PNP</span> · {column.transistor.parts.join(', ')}
            </span>
            <span className="text-muted-foreground">
              Base resistor {column.transistor.baseResistor}. {column.transistor.note}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Direct from the 74HC595 outputs.</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={heading}>Row drivers</span>
        {row.transistor ? (
          <>
            <span>
              <span className="font-medium">NPN</span> · {row.transistor.parts.join(', ')}
            </span>
            <span className="text-muted-foreground">
              Base resistor {row.transistor.baseResistor}. {row.transistor.note}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Direct: each row sinks up to {Math.round(row.sinkMa)} mA through one register output.
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          {warnings.map((w) => (
            <span key={w} className="flex items-start gap-1.5">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Every connection to the board as a list, for anyone wiring it up pin by pin. */
function PinTable({ project }: { project: Project }) {
  const { hardware, grid, speed } = project
  const layout = layoutWiring(project)
  const colCount = layout.columnChain.chips.length
  const rowCount = layout.rowChain.chips.length
  const rows: Array<[string, string, string]> = [
    ['data1 · column data', `D${hardware.data1}`, 'SER (pin 14) of column register #1'],
    ['clock1 · column clock', `D${hardware.clock1}`, `SCLK (pin 11) of all ${colCount} column registers`],
    ['data2 · row data', `D${hardware.data2}`, 'SER (pin 14) of row register #1'],
    ['clock2 · row clock', `D${hardware.clock2}`, `SCLK (pin 11) of all ${rowCount} row registers`],
    [
      'str1 · latch, both chains',
      `D${hardware.str1}`,
      `RCLK (pin 12) of every register in both chains — ${colCount + rowCount} in total`,
    ],
    ...(speed.useController
      ? ([['speed preset', speed.pin, 'Wiper of the preset controller, its ends on 5 V and GND']] as Array<
          [string, string, string]
        >)
      : []),
    ['+5 V', '5V', 'VCC (16) and RST (10) of every register, and the supply’s + terminal'],
    ['GND', 'GND', 'GND (8) and OE (13) of every register, and the supply’s − terminal'],
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="border-b py-1.5 pr-3 font-medium">Signal</th>
            <th className="border-b py-1.5 pr-3 font-medium">Arduino pin</th>
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
          : 'Both chains come out exactly full.'}
      </p>
    </div>
  )
}
