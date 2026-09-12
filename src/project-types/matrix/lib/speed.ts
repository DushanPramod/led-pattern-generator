import type { Frame, SpeedControl } from '../types'

/**
 * Step timing, in one place.
 *
 * Two numbers decide how long a step is held: the project's *base* delay —
 * either read from the analog preset controller or compiled in as a fixed
 * value — and the frame's *factor*, a multiple of that base.
 *
 * Everything here is integer arithmetic that mirrors the generated C exactly,
 * so what the preview plays is what the panel does. `potMs()` is Arduino's
 * `map()` with the same truncation, and `scaledMs()` is the same shift by four
 * the sketch performs. Getting clever with floats here would make the preview
 * drift from the hardware by a millisecond or two per step, which over a long
 * sequence is visible.
 */

/** The configurable millisecond range, both for the pot ends and a fixed delay. */
export const SPEED_MS_MIN = 1
export const SPEED_MS_MAX = 5000

/** What `analogRead()` returns, and the divisor the generated `map()` uses. */
export const ADC_MAX = 1023
export const ADC_RANGE = 1024

/**
 * Speed factors are carried to the sketch as a byte in sixteenths: 16 is 1x.
 * That keeps every preset below exact, costs one byte per step, and lets the
 * AVR scale with a multiply and a shift instead of floating point.
 */
export const SCALE_UNIT = 16
export const SCALE_MIN = 1
export const SCALE_MAX = 255

/** The presets offered in the UI. Each is exact in sixteenths. */
export const SPEED_PRESETS = [
  { factor: 0.25, label: '0.25x' },
  { factor: 0.5, label: '0.5x' },
  { factor: 0.75, label: '0.75x' },
  { factor: 1, label: '1x' },
  { factor: 1.5, label: '1.5x' },
  { factor: 2, label: '2x' },
  { factor: 3, label: '3x' },
  { factor: 4, label: '4x' },
] as const

export const FACTOR_MIN = SCALE_MIN / SCALE_UNIT
export const FACTOR_MAX = SCALE_MAX / SCALE_UNIT

const clampInt = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Math.round(Number.isFinite(value) ? value : low)))

/** Snaps a typed millisecond value into the configurable range. */
export const clampMs = (ms: number) => clampInt(ms, SPEED_MS_MIN, SPEED_MS_MAX)

/**
 * Orders the two ends of the controller range.
 *
 * The slowest end always sits above the fastest, so the knob reads the same way
 * round on every build and `map()` never runs backwards. `anchor` says which
 * end was just set: that one is kept, and the other is pushed out of its way.
 * Each end also leaves room for the other, so the fastest cannot be pinned at
 * the very top of the range nor the slowest at the very bottom.
 */
export function speedRange(
  minMs: number,
  maxMs: number,
  anchor: 'min' | 'max' = 'min',
): { minMs: number; maxMs: number } {
  const min = Math.min(clampMs(minMs), SPEED_MS_MAX - 1)
  const max = Math.max(clampMs(maxMs), SPEED_MS_MIN + 1)
  if (min < max) return { minMs: min, maxMs: max }
  return anchor === 'min' ? { minMs: min, maxMs: min + 1 } : { minMs: max - 1, maxMs: max }
}

/**
 * Every speed field inside the range the sketch can actually emit.
 *
 * A pair that arrives already reversed — from a project saved when the order
 * was not enforced, or a hand-edited file — is swapped rather than anchored.
 * Both numbers were chosen deliberately, so the span is worth keeping; it is
 * only a freshly typed value that has one end to hold still and one to push.
 */
export function normalizeSpeedControl(
  speed: SpeedControl,
  anchor: 'min' | 'max' = 'min',
): SpeedControl {
  const low = Math.min(speed.minMs, speed.maxMs)
  const high = Math.max(speed.minMs, speed.maxMs)
  return {
    ...speed,
    ...speedRange(low, high, anchor),
    stepMs: clampMs(speed.stepMs),
    position: clampPosition(speed.position),
  }
}

/** Snaps a knob position onto the raw analog scale. */
export const clampPosition = (raw: number) => clampInt(raw, 0, ADC_MAX)

/** A factor as the byte the sketch carries: 1x becomes 16. */
export const encodeFactor = (factor: number) =>
  clampInt((Number.isFinite(factor) ? factor : 1) * SCALE_UNIT, SCALE_MIN, SCALE_MAX)

/** The factor that byte represents, which is what the UI should show back. */
export const decodeScale = (scale: number) => scale / SCALE_UNIT

/** A typed factor rounded to one the sketch can carry exactly. */
export const clampFactor = (factor: number) => decodeScale(encodeFactor(factor))

/**
 * The delay the controller is currently asking for.
 *
 * Identical to the generated `map(analogRead(pin), 0, 1024, min, max)`, down to
 * the integer division, so the preview and the panel agree to the millisecond.
 */
export function potMs(speed: SpeedControl): number {
  const { minMs, maxMs } = speedRange(speed.minMs, speed.maxMs)
  const position = clampPosition(speed.position)
  return Math.floor((position * (maxMs - minMs)) / ADC_RANGE) + minMs
}

/** The project's base step delay, whichever way this build sets its speed. */
export function baseSpeedMs(speed: SpeedControl): number {
  return speed.useController ? potMs(speed) : clampMs(speed.stepMs)
}

/** Applies a step's factor to a base delay, exactly as the sketch does. */
export function scaledMs(baseMs: number, scale: number): number {
  return Math.max(1, Math.min(65535, Math.floor((baseMs * scale) / SCALE_UNIT)))
}

/** How long one step of this frame is held, at the project's current base. */
export function frameSpeedMs(baseMs: number, factor: number): number {
  return scaledMs(baseMs, encodeFactor(factor))
}

/**
 * What one step of this frame actually costs.
 *
 * A frame pinned to a fixed delay ignores the base entirely — including the
 * controller, which is the point of pinning it — so the override is checked
 * first and the factor only applies when there is none.
 */
export function frameStepMs(baseMs: number, frame: Pick<Frame, 'speedFactor' | 'speedMs'>): number {
  return frame.speedMs === null ? frameSpeedMs(baseMs, frame.speedFactor) : clampMs(frame.speedMs)
}

/** The same, straight from a project's speed block. */
export function frameMs(speed: SpeedControl, frame: Frame): number {
  return frameStepMs(baseSpeedMs(speed), frame)
}

/** `1x`, `0.5x`, `1.75x` — trailing zeroes trimmed. */
export function formatFactor(factor: number): string {
  return `${Number(factor.toFixed(4))}x`
}

/** The knob position as the percentage of travel a user would read off it. */
export const positionPercent = (speed: SpeedControl) =>
  Math.round((clampPosition(speed.position) / ADC_MAX) * 100)

/** A percentage of travel back to a raw reading. */
export const percentToPosition = (percent: number) =>
  clampPosition(Math.round((percent / 100) * ADC_MAX))
