/**
 * What the frames actually contain.
 *
 * The search is expensive — every candidate costs a compile — so it should
 * never spend one on a pass that cannot possibly apply. A timeline with no
 * repeated artwork has nothing for dedupePatterns to find, and asking the
 * compiler that question takes six seconds to learn what counting takes
 * microseconds.
 *
 * This is also what the Memory tab shows to explain a result: "three frames
 * share one table" is a better answer than a number that changed.
 */
import type { Frame, Grid } from '../../types'
import { packFrame } from '../codegen/designs'
import { type OptimizationLevel, type PassId, availablePasses } from '../codegen/options'
import { regionOf } from '../grid'
import { frameStepMs } from '../speed'

export type DuplicateGroup = {
  /** Bytes one copy of this artwork occupies. */
  bytes: number
  frames: string[]
}

export type FrameAnalysis = {
  frames: number
  /** Distinct packed contents — how many tables a perfect dedupe would leave. */
  distinctTables: number
  duplicateGroups: DuplicateGroup[]
  blankFrames: string[]
  /** Bytes emitted today, one table per frame. */
  totalPatternBytes: number
  /** Bytes that duplicate another table and could be shared away. */
  redundantBytes: number
  /** Largest authored tile, which is what a shrunken pattern buffer must hold. */
  maxTile: { rows: number; cols: number }
  /** Row strides in use; only equal strides can share a pooled table. */
  strides: number[]
  /** Longest single hold, in ms, at the project's current base speed. */
  longestHoldMs: number
}

export function analyzeFrames(frames: Frame[], grid: Grid, baseSpeed: number): FrameAnalysis {
  const byContent = new Map<string, string[]>()
  const sizeOf = new Map<string, number>()
  const blankFrames: string[] = []
  const strides = new Set<number>()
  let totalPatternBytes = 0
  let maxTile = { rows: 0, cols: 0 }
  let longestHoldMs = 0

  for (const frame of frames) {
    const packed = packFrame(frame, grid)
    const stride = packed.bytes[0]?.length ?? 0
    const size = packed.rows * stride
    totalPatternBytes += size
    strides.add(stride)

    const region = regionOf(frame, grid)
    if (region.rows * region.cols > maxTile.rows * maxTile.cols) {
      maxTile = { rows: region.rows, cols: region.cols }
    }

    const hold = frameStepMs(baseSpeed, frame) * Math.max(1, frame.motion.steps)
    if (hold > longestHoldMs) longestHoldMs = hold

    if (packed.bytes.every((row) => row.every((b) => b === 0))) blankFrames.push(frame.id)

    const key = `${packed.rows}x${packed.cols}:${packed.bytes.map((r) => r.join(',')).join('|')}`
    sizeOf.set(key, size)
    const group = byContent.get(key)
    if (group) group.push(frame.id)
    else byContent.set(key, [frame.id])
  }

  const duplicateGroups: DuplicateGroup[] = []
  let redundantBytes = 0
  for (const [key, ids] of byContent) {
    if (ids.length < 2) continue
    const bytes = sizeOf.get(key) ?? 0
    duplicateGroups.push({ bytes, frames: ids })
    redundantBytes += bytes * (ids.length - 1)
  }

  return {
    frames: frames.length,
    distinctTables: byContent.size,
    duplicateGroups,
    blankFrames,
    totalPatternBytes,
    redundantBytes,
    maxTile,
    strides: [...strides].sort((a, b) => a - b),
    longestHoldMs,
  }
}

/** Why a pass was left out, for the report the UI shows. */
export type PassApplicability = {
  pass: PassId
  applicable: boolean
  reason: string
  /** A rough expectation, used only to order the queue — never to decide. */
  expectedSaving: number
}

/**
 * Which passes are worth compiling for this project.
 *
 * `expectedSaving` orders the queue so the promising candidates are measured
 * first when a budget is tight. It is deliberately not used to choose: the
 * linker already strips unreferenced code, so a static guess is unreliable and
 * the compiler is the only authority here.
 */
export function passApplicability(
  analysis: FrameAnalysis,
  level: OptimizationLevel,
): PassApplicability[] {
  const out: PassApplicability[] = []
  for (const pass of availablePasses(level)) {
    switch (pass) {
      case 'progmemPatternRead':
        out.push({
          pass,
          applicable: true,
          reason: 'removes the pattern buffer from SRAM',
          expectedSaving: 1000,
        })
        break
      case 'dedupePatterns':
        out.push({
          pass,
          applicable: analysis.duplicateGroups.length > 0,
          reason:
            analysis.duplicateGroups.length > 0
              ? `${analysis.duplicateGroups.length} group(s) of identical artwork, ${analysis.redundantBytes} B duplicated`
              : 'no two frames pack identically',
          expectedSaving: analysis.redundantBytes,
        })
        break
      case 'shareBlanks':
        out.push({
          pass,
          applicable: analysis.blankFrames.length > 1,
          reason:
            analysis.blankFrames.length > 1
              ? `${analysis.blankFrames.length} dark frames could share one table`
              : analysis.blankFrames.length === 1
                ? 'only one dark frame, nothing to share it with'
                : 'no dark frames',
          expectedSaving: analysis.blankFrames.length > 1 ? analysis.blankFrames.length * 8 : 0,
        })
        break
      default:
        out.push({ pass, applicable: true, reason: 'candidate', expectedSaving: 0 })
    }
  }
  return out.sort((a, b) => b.expectedSaving - a.expectedSaving)
}

export function applicablePasses(analysis: FrameAnalysis, level: OptimizationLevel): PassId[] {
  return passApplicability(analysis, level)
    .filter((p) => p.applicable)
    .map((p) => p.pass)
}
