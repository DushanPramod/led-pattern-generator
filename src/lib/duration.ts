import type { Frame, Group, SpeedControl } from '../types'
import { motionSteps } from './simulate'
import { baseSpeedMs, frameStepMs } from './speed'

/**
 * How long the timeline takes to play.
 *
 * The generated loop holds every step for its own delay and does nothing else
 * between them, so a run is simply steps x delay summed over the timeline —
 * the same arithmetic playStep() performs, with the same integer step delay the
 * preview uses. What it leaves out is the microseconds the panel spends
 * refreshing and shifting rows, which is why everything here is an estimate
 * and shown with a leading `~`.
 *
 * On a build with the preset controller fitted, the base delay is whatever the
 * knob is asking for right now, so these numbers move with it.
 */

/** One frame, start to finish: every step of its motion held in turn. */
export function frameDurationMs(baseMs: number, frame: Frame): number {
  return frameStepMs(baseMs, frame) * motionSteps(frame.motion)
}

/** One pass of a sequence — its frames once through, repeats not counted. */
export function groupPassMs(baseMs: number, byId: Map<string, Frame>, group: Group): number {
  let total = 0
  for (const id of group.frameIds) {
    const frame = byId.get(id)
    // A missing id is skipped rather than counted as zero-length, exactly as
    // renderTimeline() skips it.
    if (frame) total += frameDurationMs(baseMs, frame)
  }
  return total
}

/** A whole sequence as the loop plays it, all its repeats included. */
export function groupDurationMs(baseMs: number, byId: Map<string, Frame>, group: Group): number {
  return groupPassMs(baseMs, byId, group) * Math.max(1, group.repeat)
}

/** Every sequence in order: one lap of the panel before it starts over. */
export function timelineDurationMs(
  baseMs: number,
  byId: Map<string, Frame>,
  groups: Group[],
): number {
  return groups.reduce((total, group) => total + groupDurationMs(baseMs, byId, group), 0)
}

/** The same, straight from a project's speed block. */
export function projectDurationMs(
  speed: SpeedControl,
  frames: Frame[],
  groups: Group[],
): number {
  const byId = new Map(frames.map((f) => [f.id, f]))
  return timelineDurationMs(baseSpeedMs(speed), byId, groups)
}

/**
 * A duration a user can read at a glance.
 *
 * Short runs stay in milliseconds because that is the unit everything else in
 * the editor is set in; past a second the reading matters more than the
 * precision, so it drops to one decimal and then to minutes and hours.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`

  const seconds = ms / 1000
  if (seconds < 60) return `${Number(seconds.toFixed(seconds < 10 ? 2 : 1))} s`

  const whole = Math.round(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}
