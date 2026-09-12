/**
 * The equivalence gate.
 *
 * An optimisation is only allowed to change how the sketch is built, never what
 * the panel shows. simulate.ts is the fixed oracle — it is never modified to
 * accommodate a pass — and every candidate must reproduce it frame for frame
 * before it is allowed to cost a compile.
 *
 * Two things this deliberately does not do. It does not compare timing: with a
 * speed dial fitted, hold length is whatever the pot says, so `delay` is
 * nominal. And it does not model `hardware.scanOrder`, which reverses the
 * column shift-out on the panel itself; the simulator models the frame buffer,
 * not the photons, and scanOrder is held constant across a comparison anyway.
 */
import type { Frame, Grid, Group, Project } from '../../types'
import { planPatterns, playedFrames } from '../codegen/designs'
import { NO_PASSES, type CodegenOptions } from '../codegen/options'
import { renderTimeline } from '../simulate'
import { baseSpeedMs } from '../speed'
import { flatPack, planResolver, runEngine, type PatternResolver } from './engineModel'

/**
 * Exactly how many steps a timeline produces.
 *
 * renderTimeline caps at maxSteps and returns short without saying so, so every
 * caller here passes the true length. A timeline longer than the default 4000
 * would otherwise be compared only up to the cap, and a divergence past it
 * would read as a pass.
 */
export function timelineLength(frames: Frame[], groups: Group[]): number {
  const byId = new Map(frames.map((f) => [f.id, f]))
  let total = 0
  for (const group of groups) {
    let perPass = 0
    for (const id of group.frameIds) {
      const frame = byId.get(id)
      if (frame) perPass += Math.max(1, frame.motion.steps)
    }
    total += perPass * Math.max(1, group.repeat)
  }
  return total
}

export type Divergence = {
  /** Index into the rendered timeline. */
  step: number
  row: number
  col: number
  expected: number
  actual: number
}

export type EquivalenceResult = {
  ok: boolean
  /** Frames actually compared. */
  compared: number
  divergence?: Divergence
  /** Set when the two runs did not even produce the same number of frames. */
  lengthMismatch?: { expected: number; actual: number }
}

/** Diffs one timeline: the oracle against the model of what `options` emits. */
export function checkTimeline(
  frames: Frame[],
  groups: Group[],
  grid: Grid,
  baseSpeed: number,
  options: CodegenOptions = NO_PASSES,
  resolve: PatternResolver = flatPack,
): EquivalenceResult {
  const maxSteps = Math.max(1, timelineLength(frames, groups))
  const expected = renderTimeline(frames, groups, grid, baseSpeed, maxSteps).map((s) => s.cells)
  const actual = runEngine(frames, groups, grid, options, resolve)

  if (expected.length !== actual.length) {
    return {
      ok: false,
      compared: 0,
      lengthMismatch: { expected: expected.length, actual: actual.length },
    }
  }

  for (let step = 0; step < expected.length; step++) {
    const a = expected[step]
    const b = actual[step]
    for (let k = 0; k < a.length; k++) {
      const want = a[k] ? 1 : 0
      const got = b[k] ? 1 : 0
      if (want !== got) {
        return {
          ok: false,
          compared: step,
          divergence: {
            step,
            row: Math.floor(k / grid.cols),
            col: k % grid.cols,
            expected: want,
            actual: got,
          },
        }
      }
    }
  }

  return { ok: true, compared: expected.length }
}

/**
 * Tier 1: the user's own project, every frame, nothing truncated.
 *
 * The plan is rebuilt here rather than passed in, so what is checked is
 * exactly what these options would emit.
 */
export function validateProject(
  project: Project,
  options: CodegenOptions = NO_PASSES,
): EquivalenceResult {
  const used = playedFrames(project.frames, project.groups)
  const plan = planPatterns(used, project.grid, options)
  return checkTimeline(
    project.frames,
    project.groups,
    project.grid,
    baseSpeedMs(project.speed),
    options,
    planResolver(plan),
  )
}

/** The same check for a bare timeline, as the fuzz corpus supplies. */
export function validateTimeline(
  frames: Frame[],
  groups: Group[],
  grid: Grid,
  baseSpeed: number,
  options: CodegenOptions = NO_PASSES,
): EquivalenceResult {
  const used = playedFrames(frames, groups)
  const plan = planPatterns(used, grid, options)
  return checkTimeline(frames, groups, grid, baseSpeed, options, planResolver(plan))
}

export function describeResult(result: EquivalenceResult): string {
  if (result.ok) return `identical across ${result.compared} frames`
  if (result.lengthMismatch) {
    const { expected, actual } = result.lengthMismatch
    return `timeline length changed: ${actual} frames, expected ${expected}`
  }
  const d = result.divergence
  if (!d) return 'differs'
  return `frame ${d.step}, row ${d.row} col ${d.col}: expected ${d.expected}, got ${d.actual}`
}
