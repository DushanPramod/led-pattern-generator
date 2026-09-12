/**
 * Which 74HC595 output ends up driving which panel line.
 *
 * The sketch clocks out one bit per line and pulses the shared latch, so the
 * wiring is decided entirely by *order*: the bit clocked first is pushed
 * furthest along the chain, and the bit clocked last stays in the chip the
 * Arduino feeds. That is the whole reason `scanOrder` exists — flipping it
 * moves column 0 from one end of the chain to the other — so it is worked out
 * here once and drawn from, rather than guessed at in the diagram.
 */

import type { Grid, Hardware } from '../types'

/** Outputs on one 74HC595. */
export const REGISTER_BITS = 8

/** Which end of the panel is clocked out first. */
export type ShiftOrder = 'lowFirst' | 'highFirst'

export type ChipPlan = {
  /** Place in the daisy chain. 0 is the chip wired to the Arduino. */
  index: number
  /** Panel lines this chip drives, lowest first. */
  lines: number[]
  /** `outputs[i]` is the Q number that drives `lines[i]`. */
  outputs: number[]
  /**
   * Q numbers left over. Only ever on the far end of the chain, and only when
   * the panel is not a multiple of eight: the sketch clocks exactly as many
   * bits as there are lines, so the outputs past the last one are never
   * written and keep whatever the previous refresh pushed into them.
   */
  unused: number[]
}

export type ChainPlan = {
  /** Chips in panel order — the one driving line 0 first. */
  chips: ChipPlan[]
  /**
   * The Arduino-fed chip sits last in panel order, so the chain is physically
   * daisy-chained against the direction the lines run.
   */
  reversed: boolean
  /** Bits the sketch clocks out per row, which is one per line. */
  bits: number
}

/**
 * Lays out one chain of shift registers over `count` panel lines.
 *
 * `order` is the order the sketch clocks the lines out in, and the reversal
 * that shifting does is the only thing deciding where each one lands.
 */
export function planChain(count: number, order: ShiftOrder): ChainPlan {
  const chipCount = Math.max(1, Math.ceil(count / REGISTER_BITS))
  const chips: ChipPlan[] = Array.from({ length: chipCount }, (_, index) => ({
    index,
    lines: [],
    outputs: [],
    unused: [],
  }))

  for (let line = 0; line < count; line++) {
    // Position along the chain, counted from the Arduino end: the first bit
    // clocked out (position 0 in shift order) is carried to the last output.
    const position = order === 'lowFirst' ? count - 1 - line : line
    const chip = chips[Math.floor(position / REGISTER_BITS)]
    // Lines are walked in ascending order, so both arrays come out sorted and
    // stay aligned with each other.
    chip.lines.push(line)
    chip.outputs.push(position % REGISTER_BITS)
  }

  for (const chip of chips) {
    for (let q = 0; q < REGISTER_BITS; q++) {
      if (!chip.outputs.includes(q)) chip.unused.push(q)
    }
  }

  const inPanelOrder = [...chips].sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0))
  return {
    chips: inPanelOrder,
    reversed: (inPanelOrder[0]?.index ?? 0) !== 0,
    bits: count,
  }
}

/** Column 0 is clocked out first only when the chain scans ascending. */
export function planColumnChain(grid: Grid, hardware: Hardware): ChainPlan {
  return planChain(grid.cols, hardware.scanOrder === 'ascending' ? 'lowFirst' : 'highFirst')
}

/** Row select always walks row 0 upwards, whatever the column order is. */
export function planRowChain(grid: Grid): ChainPlan {
  return planChain(grid.rows, 'lowFirst')
}

/** `4 registers` / `1 register`, for labels. */
export function describeChain(plan: ChainPlan): string {
  return `${plan.chips.length} ${plan.chips.length === 1 ? 'register' : 'registers'}`
}
