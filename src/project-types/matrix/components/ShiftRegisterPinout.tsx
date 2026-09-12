import type { Project } from '../types'
import type { NetName } from '../lib/wiringLayout'
import { NET, wrapText } from '../lib/wiringLayout'

export const PINOUT_W = 320

type Pin = {
  n: number
  name: string
  /** Active-low pins carry a bar over their name. */
  bar?: boolean
  /** One colour, or two for a pin whose net differs between the chains. */
  nets: NetName[] | 'output'
}

/** Top to bottom down each side, the way the package is drawn. */
const LEFT: Pin[] = [
  { n: 1, name: 'Q1', nets: 'output' },
  { n: 2, name: 'Q2', nets: 'output' },
  { n: 3, name: 'Q3', nets: 'output' },
  { n: 4, name: 'Q4', nets: 'output' },
  { n: 5, name: 'Q5', nets: 'output' },
  { n: 6, name: 'Q6', nets: 'output' },
  { n: 7, name: 'Q7', nets: 'output' },
  { n: 8, name: 'GND', nets: ['gnd'] },
]
const RIGHT: Pin[] = [
  { n: 16, name: 'VCC', nets: ['vcc'] },
  { n: 15, name: 'Q0', nets: 'output' },
  { n: 14, name: 'SER', nets: ['column', 'row'] },
  { n: 13, name: 'OE', bar: true, nets: ['gnd'] },
  { n: 12, name: 'RCLK', nets: ['latch'] },
  { n: 11, name: 'SCLK', nets: ['column', 'row'] },
  { n: 10, name: 'RST', bar: true, nets: ['vcc'] },
  { n: 9, name: 'Q7′', nets: ['column', 'row'] },
]

const BODY_COLOR = '#f7c9a0'
const INK = '#2d3142'
const PIN_FACE = '#e8e9ee'

const PITCH = 34
const TOP = 58
const BODY_X0 = 104
const BODY_X1 = 216
const PIN_W = 26
const PIN_H = 20

/**
 * The 74HC595 package, pin by pin, with what each pin connects to in *this*
 * build — so the numbers on the wiring diagram can be found on a real chip.
 */
export function ShiftRegisterPinout({ project, svgRef }: {
  project: Project
  svgRef?: React.Ref<SVGSVGElement>
}) {
  const { hardware } = project
  const pnp = hardware.columnDriver === 'pnp'
  const npn = hardware.rowDriver === 'npn'

  const connections: Array<{ pin: string; name: string; bar?: boolean; nets: NetName[] | 'output'; text: string }> = [
    { pin: '16', name: 'VCC', nets: ['vcc'], text: '+5 V rail, with a 100 nF capacitor to GND right at the pin.' },
    { pin: '8', name: 'GND', nets: ['gnd'], text: 'GND rail.' },
    { pin: '10', name: 'RST', bar: true, nets: ['vcc'], text: '+5 V — held high so the register never clears.' },
    { pin: '13', name: 'OE', bar: true, nets: ['gnd'], text: 'GND — held low so the outputs are always on.' },
    {
      pin: '14',
      name: 'SER',
      nets: ['column', 'row'],
      text: `First column register: D${hardware.data1} (data1). First row register: D${hardware.data2} (data2). Every other register: Q7′ of the one before it.`,
    },
    {
      pin: '11',
      name: 'SCLK',
      nets: ['column', 'row'],
      text: `All column registers: D${hardware.clock1} (clock1). All row registers: D${hardware.clock2} (clock2).`,
    },
    {
      pin: '12',
      name: 'RCLK',
      nets: ['latch'],
      text: `Every register in both chains: D${hardware.str1} (str1), the shared latch.`,
    },
    {
      pin: '9',
      name: 'Q7′',
      nets: ['column', 'row'],
      text: 'SER (14) of the next register in the same chain. Left open on the last one.',
    },
    {
      pin: '15, 1–7',
      name: 'Q0–Q7',
      nets: 'output',
      text: `Column registers: ${
        pnp ? 'a 1 kΩ base resistor into each column’s PNP' : 'each column’s resistor, then the column (LED anodes, +)'
      }. Row registers: ${
        npn ? 'the base resistor of each row’s NPN' : 'each row directly (LED cathodes, −)'
      }.`,
    },
  ]

  const listTop = TOP + 8 * PITCH + 34
  const textX = 92
  const lines = connections.map((c) => wrapText(c.text, PINOUT_W - textX - 8, 4.9))
  let cursor = listTop + 20
  const rowsY = lines.map((l) => {
    const y = cursor
    cursor += l.length * 12 + 8
    return y
  })
  const height = cursor + 4

  const fillFor = (nets: NetName[] | 'output', id: string) =>
    nets === 'output' ? PIN_FACE : nets.length === 1 ? NET[nets[0]] : `url(#${id})`

  /** A pin box filled with the colour of the net it joins. */
  const pinBox = (pin: Pin, x: number, y: number) => (
    <g key={pin.n}>
      <rect
        x={x}
        y={y - PIN_H / 2}
        width={PIN_W}
        height={PIN_H}
        fill={fillFor(pin.nets, 'pin-split')}
        fillOpacity={pin.nets === 'output' ? 1 : 0.85}
        stroke={INK}
        strokeWidth={1.6}
      />
      <text
        x={x + PIN_W / 2}
        y={y + 4}
        textAnchor="middle"
        fontSize={11}
        fill={pin.nets === 'output' ? INK : '#ffffff'}
        fontWeight={600}
        className="p"
      >
        {pin.n}
      </text>
    </g>
  )

  const pinName = (pin: Pin, x: number, y: number, anchor: 'start' | 'end') => (
    <text key={`n${pin.n}`} x={x} y={y + 4.5} textAnchor={anchor} fontSize={13} className="p ink">
      {pin.bar ? <tspan textDecoration="overline">{pin.name}</tspan> : pin.name}
    </text>
  )

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PINOUT_W} ${height}`}
      width={PINOUT_W}
      height={height}
      className="h-auto w-full"
      role="img"
      aria-label="74HC595 pinout and what each pin connects to in this build"
    >
      <style>{`
        .p { font-family: ui-sans-serif, system-ui, 'Segoe UI', sans-serif }
        .ink { fill: var(--text) }
        .muted { fill: var(--muted) }
      `}</style>
      <defs>
        <linearGradient id="pin-split" x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor={NET.column} />
          <stop offset="50%" stopColor={NET.row} />
        </linearGradient>
      </defs>
      <rect width={PINOUT_W} height={height} fill="var(--surface)" />

      <text x={12} y={20} fontSize={12} fontWeight={600} className="p ink">
        74HC595 pinout
      </text>
      <text x={12} y={35} fontSize={9} className="p muted">
        Seen from above, notch / dot at pin 1. Colours match the diagram.
      </text>

      {/* The package. */}
      <rect
        x={BODY_X0}
        y={TOP - 22}
        width={BODY_X1 - BODY_X0}
        height={8 * PITCH + 10}
        rx={8}
        fill={BODY_COLOR}
        stroke={INK}
        strokeWidth={2.2}
      />
      <circle cx={BODY_X0 + 16} cy={TOP - 6} r={5} fill={INK} />
      <text
        x={(BODY_X0 + BODY_X1) / 2}
        y={TOP + 4 * PITCH - 12}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        fill={INK}
        className="p"
      >
        74HC595
      </text>

      {LEFT.map((pin, i) => {
        const y = TOP + i * PITCH
        return (
          <g key={`l${pin.n}`}>
            {pinBox(pin, BODY_X0 - PIN_W, y)}
            {pinName(pin, BODY_X0 - PIN_W - 8, y, 'end')}
          </g>
        )
      })}
      {RIGHT.map((pin, i) => {
        const y = TOP + i * PITCH
        return (
          <g key={`r${pin.n}`}>
            {pinBox(pin, BODY_X1, y)}
            {pinName(pin, BODY_X1 + PIN_W + 8, y, 'start')}
          </g>
        )
      })}

      {/* Where each pin goes, for this project's pins and drivers. */}
      <text x={12} y={listTop} fontSize={11} fontWeight={600} className="p ink">
        Connect each pin to
      </text>
      {connections.map((c, i) => {
        const y = rowsY[i]
        const split = c.nets !== 'output' && c.nets.length > 1
        return (
          <g key={c.pin}>
            <rect
              x={12}
              y={y - 9}
              width={10}
              height={10}
              rx={2}
              fill={split ? 'url(#pin-split)' : fillFor(c.nets, 'pin-split')}
              stroke={c.nets === 'output' ? INK : 'none'}
              strokeWidth={0.8}
            />
            <text x={28} y={y} fontSize={9.5} fontWeight={600} className="p ink">
              {c.bar ? <tspan textDecoration="overline">{c.name}</tspan> : c.name}
            </text>
            <text x={28} y={y + 11} fontSize={8} className="p muted">
              pin {c.pin}
            </text>
            {lines[i].map((line, k) => (
              <text key={k} x={textX} y={y + k * 12} fontSize={9} className="p muted">
                {line}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
