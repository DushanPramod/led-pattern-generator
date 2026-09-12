/**
 * The electrical side of a build: series resistor values, whether the 74HC595
 * outputs can carry the current on their own, which transistors to fit when
 * they cannot, and how big a supply to buy.
 *
 * Everything here is an estimate from typical datasheet figures, meant to put a
 * builder in the right range rather than replace a meter. The one fact it rests
 * on is multiplexing: only one row is lit at any instant, so the peak LED
 * current is one full row — every column of it — never the whole panel.
 */

import type { ColumnDriver, Hardware, RowDriver } from '../types'
import { REGISTER_BITS } from './wiring'
import { nearestPresetName, normalizeHex } from './colors'

export const SUPPLY_V = 5

/** 74HC595 absolute maximum per output, and through its VCC or GND pin. */
export const REGISTER_PIN_MAX_MA = 35
export const REGISTER_PACKAGE_MAX_MA = 70

/**
 * Typical forward voltage of each stock LED colour. Red, orange, amber and
 * yellow are the low-voltage AlInGaP family; green, blue, white and the
 * pinks/violets built on blue dies sit around 3 V, which leaves far less of a
 * 5 V supply for the resistor and the switches.
 */
const FORWARD_V: Record<string, number> = {
  Red: 2.0,
  Orange: 2.05,
  Amber: 2.1,
  Yellow: 2.1,
  Lime: 2.2,
  Green: 3.0,
  Cyan: 3.1,
  'Ice blue': 3.1,
  Blue: 3.1,
  Violet: 3.2,
  Magenta: 3.1,
  Pink: 3.1,
  White: 3.1,
  'Warm white': 3.1,
}

export type Range = { min: number; max: number }

export type TransistorPick = {
  type: 'PNP' | 'NPN'
  /** Common part numbers that suit the current, most available first. */
  parts: string[]
  /** Series resistor between the register output and the base. */
  baseResistor: string
  /** Base current the register pin supplies per transistor, mA. */
  baseMa: number
  /** Saturation drop across the switch, V — comes off the resistor's budget. */
  drop: number
  note: string
}

export type ColumnPlan = {
  driver: ColumnDriver
  /** LED current per column the resistor should be sized for, mA. */
  ledMa: Range
  /** What one register output carries, mA. */
  pinMa: number
  /** What one column register carries through its VCC pin, mA. */
  packageMa: number
  transistor: TransistorPick | null
  drop: number
}

export type RowPlan = {
  driver: RowDriver
  /** Current the selected row sinks with every column lit, mA. */
  sinkMa: number
  transistor: TransistorPick | null
  drop: number
}

export type ResistorPick = {
  /** Stock colour name the row colours were matched to. */
  color: string
  hex: string
  forwardV: number
  /** Standard E12 values, low end brightest. */
  ohms: Range | null
  label: string
}

export type SupplyPlan = {
  volts: number
  /** Worst instant: one row fully lit, plus drivers and the board. */
  peakA: number
  /** A stock supply rating with headroom over the peak. */
  recommendedA: number
}

export type ElectricalPlan = {
  column: ColumnPlan
  row: RowPlan
  resistors: ResistorPick[]
  /** Rows of different forward voltage share each column resistor. */
  mixedForwardV: boolean
  supply: SupplyPlan
  /** Problems worth stopping for, in the order they should be fixed. */
  warnings: string[]
}

/* ---- standard values ------------------------------------------------------ */

const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]

function e12Values(): number[] {
  const out: number[] = []
  for (let decade = 1; decade <= 100000; decade *= 10) {
    for (const v of E12) out.push(v * decade / 10)
  }
  return out.filter((v) => v >= 1)
}
const E12_ALL = e12Values()

/** The smallest stock value at or above `ohms` — never more current than asked. */
const e12Up = (ohms: number) => E12_ALL.find((v) => v >= ohms - 1e-9) ?? E12_ALL.at(-1)!
/** The largest stock value at or below `ohms`. */
const e12Down = (ohms: number) => [...E12_ALL].reverse().find((v) => v <= ohms + 1e-9) ?? E12_ALL[0]

export function formatOhms(ohms: number): string {
  if (ohms >= 1000) {
    const k = ohms / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)} kΩ`
  }
  return `${Math.round(ohms)} Ω`
}

export function formatAmps(amps: number): string {
  return amps < 1 ? `${Math.round(amps * 1000)} mA` : `${amps.toFixed(amps < 10 ? 2 : 1)} A`
}

const SUPPLY_RATINGS = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 60]

/* ---- the plan ------------------------------------------------------------- */

/**
 * Directly driven columns are held to a current the register can source on
 * eight pins at once; behind a PNP the transistor carries it, so the LEDs can
 * run at a normal multiplexing current.
 */
const COLUMN_DIRECT_MA: Range = { min: 4, max: 8 }
const COLUMN_PNP_MA: Range = { min: 10, max: 20 }

/** What a register output loses sourcing or sinking a few mA, V. */
const REGISTER_DROP = 0.4

const ARDUINO_MA = 50

function columnTransistor(ledMa: number): TransistorPick {
  // One LED at a time per column, so even a large panel needs only small-signal parts.
  return {
    type: 'PNP',
    parts: ['BC327', 'S8550', '2N2907A', 'BC557'],
    baseResistor: '1 kΩ',
    // (5 V - 0.7 V) / 1 kΩ
    baseMa: 4.3,
    drop: 0.2,
    note: `Emitter to +5 V, collector through the column resistor to the column, base through 1 kΩ to the register output. Carries up to ${Math.round(ledMa)} mA — one LED at a time.`,
  }
}

function rowTransistor(sinkMa: number): TransistorPick {
  if (sinkMa <= 150) {
    return {
      type: 'NPN',
      parts: ['BC337', '2N2222A', 'S8050'],
      baseResistor: '470 Ω',
      // (5 V - 0.7 V) / 470 Ω
      baseMa: 9.1,
      drop: 0.3,
      note: `Emitter to GND, collector to the row, base through 470 Ω to the register output. Sinks up to ${Math.round(sinkMa)} mA — the whole lit row.`,
    }
  }
  if (sinkMa <= 500) {
    return {
      type: 'NPN',
      parts: ['ULN2803A (8 in one chip)', 'TIP120', 'BD681'],
      baseResistor: 'none (ULN2803A) / 1 kΩ (TIP120)',
      baseMa: 4.3,
      drop: 1.0,
      note: `A Darlington: the gain a register pin cannot supply on its own for ${Math.round(sinkMa)} mA. A ULN2803A replaces eight transistors and their resistors; its outputs sink the rows directly. Costs about 1 V.`,
    }
  }
  return {
    type: 'NPN',
    parts: ['TIP120', 'TIP122', 'BD681'],
    baseResistor: '1 kΩ',
    baseMa: 4.3,
    drop: 1.0,
    note: `A power Darlington for ${Math.round(sinkMa)} mA, emitter to GND. For less heat and no 1 V loss, a logic-level N-MOSFET (IRLZ44N, AO3400) does the same job with a 100 Ω gate resistor and a 10 kΩ pull-down.`,
  }
}

/** Distinct stock colours on the panel, in row order of first appearance. */
function distinctColors(rowColors: string[]): Array<{ name: string; hex: string }> {
  const seen = new Map<string, string>()
  for (const hex of rowColors) {
    const name = nearestPresetName(normalizeHex(hex) ?? hex)
    if (!seen.has(name)) seen.set(name, hex)
  }
  return [...seen].map(([name, hex]) => ({ name, hex }))
}

export function planElectrical(
  grid: { rows: number; cols: number },
  hardware: Hardware,
  rowColors: string[],
): ElectricalPlan {
  const columnDriver: ColumnDriver = hardware.columnDriver === 'pnp' ? 'pnp' : 'direct'
  const rowDriver: RowDriver = hardware.rowDriver === 'npn' ? 'npn' : 'direct'
  // Rows never enter the peak: only one of them is lit at any instant.
  const { cols } = grid

  const ledMa = columnDriver === 'pnp' ? COLUMN_PNP_MA : COLUMN_DIRECT_MA
  const colTransistor = columnDriver === 'pnp' ? columnTransistor(ledMa.max) : null
  const column: ColumnPlan = {
    driver: columnDriver,
    ledMa,
    pinMa: colTransistor ? colTransistor.baseMa : ledMa.max,
    packageMa: (colTransistor ? colTransistor.baseMa : ledMa.max) * REGISTER_BITS,
    transistor: colTransistor,
    drop: colTransistor ? colTransistor.drop : REGISTER_DROP,
  }

  const sinkMa = cols * ledMa.max
  const rowT = rowDriver === 'npn' ? rowTransistor(sinkMa) : null
  const row: RowPlan = {
    driver: rowDriver,
    sinkMa,
    transistor: rowT,
    drop: rowT ? rowT.drop : REGISTER_DROP,
  }

  const colors = distinctColors(rowColors)
  const resistors: ResistorPick[] = colors.map(({ name, hex }) => {
    const forwardV = FORWARD_V[name] ?? 2.0
    const headroom = SUPPLY_V - forwardV - column.drop - row.drop
    if (headroom <= 0.1) {
      return {
        color: name,
        hex,
        forwardV,
        ohms: null,
        label: `not enough voltage — ${forwardV} V LEDs need a lower-drop switch or a higher supply`,
      }
    }
    const low = e12Up((headroom / ledMa.max) * 1000)
    let high = e12Down((headroom / ledMa.min) * 1000)
    if (high < low) high = low
    // A range narrower than one E12 step collapses to the safe single value.
    const label = low === high ? formatOhms(low) : `${formatOhms(low)} – ${formatOhms(high)}`
    return { color: name, hex, forwardV, ohms: { min: low, max: high }, label }
  })
  const mixedForwardV = new Set(resistors.map((r) => r.forwardV)).size > 1

  // Peak: one full row lit, each PNP's base current for every lit column, the
  // one selected row's NPN base, and the board itself.
  const peakMa =
    sinkMa +
    (colTransistor ? cols * colTransistor.baseMa : 0) +
    (rowT ? rowT.baseMa : 0) +
    ARDUINO_MA
  const peakA = peakMa / 1000
  const recommendedA = SUPPLY_RATINGS.find((a) => a >= peakA * 1.5) ?? Math.ceil(peakA * 1.5)

  const warnings: string[] = []
  if (rowDriver === 'direct' && sinkMa > REGISTER_PIN_MAX_MA) {
    warnings.push(
      `A lit row sinks up to ${Math.round(sinkMa)} mA through one register output — its limit is ${REGISTER_PIN_MAX_MA} mA. Fit row transistors.`,
    )
  }
  if (columnDriver === 'direct' && column.packageMa > REGISTER_PACKAGE_MAX_MA) {
    warnings.push(
      `Eight lit columns draw ${Math.round(column.packageMa)} mA through one register's VCC pin — its limit is ${REGISTER_PACKAGE_MAX_MA} mA. Fit column transistors or use higher resistor values.`,
    )
  }
  if (resistors.some((r) => !r.ohms)) {
    warnings.push(
      'Some LED colours have too little of the 5 V left once the switches take their share. Use MOSFET row drivers or lower-drop parts.',
    )
  }

  return {
    column,
    row,
    resistors,
    mixedForwardV,
    supply: { volts: SUPPLY_V, peakA, recommendedA },
    warnings,
  }
}
