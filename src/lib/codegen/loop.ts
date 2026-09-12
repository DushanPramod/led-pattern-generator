import type { Frame, Grid, Group } from '../../types'
import { regionOf } from '../grid'
import { mirrorApplies, needsPreload } from '../simulate'
import { clampMs, encodeFactor, formatFactor, SCALE_UNIT } from '../speed'
import type { EngineNeeds } from './engine'

/**
 * The timeline is emitted as two PROGMEM tables — the steps, and the sequences
 * that repeat them — walked by a small player. That replaces the long
 * hand-unrolled `loop()` of call triplets, and keeps the sketch the same size
 * whether the timeline has five steps or five hundred.
 */

export function usedBandCounts(frames: Frame[]): number[] {
  const counts = new Set<number>()
  for (const frame of frames) {
    if (frame.motion.kind === 'band') counts.add(frame.motion.directions.length)
  }
  return [...counts].sort((a, b) => a - b)
}

/** Only the engine pieces this timeline actually calls get emitted. */
export function engineNeeds(frames: Frame[], grid: Grid, groups: Group[] = []): EngineNeeds {
  const played = groups.length
    ? frames.filter((f) => groups.some((g) => g.frameIds.includes(f.id)))
    : frames
  let mirrorFeed = false
  let mirrorPattern = false
  let scroll = false
  let hold = false
  let bandsHorizontal = false
  let bandsVertical = false
  let tiled = false
  let scaledSpeed = false
  let fixedSpeed = false

  for (const frame of played) {
    if (frame.motion.kind === 'scroll') scroll = true
    if (frame.motion.kind === 'static') hold = true
    if (frame.motion.kind === 'band') {
      if (frame.motion.axis === 'vertical') bandsVertical = true
      else bandsHorizontal = true
    }
    if (frame.speedMs !== null) fixedSpeed = true
    else if (encodeFactor(frame.speedFactor) !== SCALE_UNIT) scaledSpeed = true
    const region = regionOf(frame, grid)
    if (region.rows < grid.rows || region.cols < (grid.halfWidth ? grid.cols / 2 : grid.cols)) {
      tiled = true
    }
    if (!mirrorApplies(frame, grid)) continue
    if (grid.halfWidth) mirrorFeed = true
    else mirrorPattern = true
  }

  return {
    bandCounts: usedBandCounts(played),
    bandsHorizontal,
    bandsVertical,
    mirrorFeed,
    mirrorPattern,
    scroll,
    hold,
    tiled,
    scaledSpeed,
    fixedSpeed,
  }
}

const FLAG_MIRROR = 1
const FLAG_PRELOAD = 2
/** Band frames only: the bands stripe the columns and travel up or down. */
const FLAG_BANDS_VERTICAL = 4

export type StepRow = {
  symbol: string
  tileRows: number
  tileCols: number
  flags: number
  motion: 'MOTION_SCROLL' | 'MOTION_HOLD' | 'MOTION_BANDS'
  vertical: number
  horizontal: number
  bandCount: number
  bandMask: number
  steps: number
  /** The frame's speed preset in sixteenths of the base delay: 16 is 1x. */
  speedScale: number
  /** A fixed delay that overrides the preset; 0 means there is none. */
  speedMs: number
  comment: string
}

function directionWord(frame: Frame): string {
  const m = frame.motion
  if (m.kind === 'static') return `hold ${m.steps}`
  if (m.kind === 'band') {
    return `${m.directions.length} ${m.axis === 'vertical' ? 'column' : 'row'} bands, ${m.steps} steps`
  }
  const parts: string[] = []
  if (m.updown === 1) parts.push('up')
  if (m.updown === -1) parts.push('down')
  if (m.leftright === 1) parts.push('right')
  if (m.leftright === -1) parts.push('left')
  return `${parts.join('+') || 'still'}, ${m.steps} steps`
}

/** Builds the STEPS row a single frame compiles to. */
export function makeStep(frame: Frame, grid: Grid, symbol: string): StepRow {
  const region = regionOf(frame, grid)
  const mirrored = mirrorApplies(frame, grid)
  const motion = frame.motion
  const speedScale = encodeFactor(frame.speedFactor)
  return {
    symbol,
    tileRows: region.rows,
    tileCols: region.cols,
    flags:
      (mirrored ? FLAG_MIRROR : 0) |
      (needsPreload(frame) ? FLAG_PRELOAD : 0) |
      (motion.kind === 'band' && motion.axis === 'vertical' ? FLAG_BANDS_VERTICAL : 0),
    motion:
      motion.kind === 'static'
        ? 'MOTION_HOLD'
        : motion.kind === 'band'
          ? 'MOTION_BANDS'
          : 'MOTION_SCROLL',
    vertical: motion.kind === 'scroll' ? motion.updown : 0,
    horizontal: motion.kind === 'scroll' ? motion.leftright : 0,
    bandCount: motion.kind === 'band' ? motion.directions.length : 0,
    bandMask:
      motion.kind === 'band'
        ? motion.directions.reduce((mask, right, i) => mask | (right ? 1 << i : 0), 0)
        : 0,
    steps: Math.max(1, motion.steps),
    // A multiple of the global speed, not a millisecond count: the dial keeps
    // updating that, and every step moves with it.
    speedScale,
    // Unless the frame is pinned, in which case this wins and the dial does not
    // reach it. Zero is the sentinel for "not pinned" — a step delay of zero
    // has no meaning anyway, since holdFrame() would return immediately.
    speedMs: frame.speedMs === null ? 0 : clampMs(frame.speedMs),
    comment:
      `${frame.name} — ${directionWord(frame)}${mirrored ? ', mirrored' : ''}` +
      (frame.speedMs !== null
        ? ` at a fixed ${clampMs(frame.speedMs)} ms`
        : speedScale === SCALE_UNIT
          ? ''
          : ` at ${formatFactor(speedScale / SCALE_UNIT)}`),
  }
}

/**
 * The row exactly as it appears in the generated STEPS table.
 *
 * The speed columns are the ones the timeline actually uses: a project where
 * every frame follows the base carries no speed column at all, and only a
 * project that pins a frame pays for the wider millisecond field.
 */
export function formatStep(step: StepRow, needs?: EngineNeeds): string {
  const speed = [
    ...(needs === undefined || needs.fixedSpeed ? [step.speedMs] : []),
    ...(needs === undefined || needs.scaledSpeed ? [step.speedScale] : []),
  ]
  return (
    `{ ${step.symbol}, ${step.tileRows}, ${step.tileCols}, ${step.flags}, ${step.motion}, ` +
    `${step.vertical}, ${step.horizontal}, ${step.bandCount}, ${step.bandMask}, ` +
    `${[step.steps, ...speed].join(', ')} }`
  )
}

export function buildSteps(
  frames: Frame[],
  groups: Group[],
  grid: Grid,
  names: Map<string, string>,
): { steps: StepRow[]; sequences: Array<{ first: number; count: number; repeat: number; name: string }> } {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const steps: StepRow[] = []
  const sequences: Array<{ first: number; count: number; repeat: number; name: string }> = []

  for (const group of groups) {
    const placed = group.frameIds.filter((id) => byId.has(id))
    if (placed.length === 0) continue
    const first = steps.length

    for (const id of placed) {
      steps.push(makeStep(byId.get(id)!, grid, names.get(id) ?? 'PATTERN'))
    }

    sequences.push({
      first,
      count: steps.length - first,
      repeat: Math.max(1, group.repeat),
      name: group.name,
    })
  }

  return { steps, sequences }
}

export function emitTables(
  steps: StepRow[],
  sequences: Array<{ first: number; count: number; repeat: number; name: string }>,
  needs: EngineNeeds,
): string {
  const stepRows = steps.map((s) => `  ${formatStep(s, needs)},   // ${s.comment}`)
  const seqRows = sequences.map(
    (s) => `  { ${s.first}, ${s.count}, ${s.repeat} },   // ${s.name}`,
  )

  return `const Step STEPS[] PROGMEM = {
${stepRows.join('\n')}
};

const Sequence SEQUENCES[] PROGMEM = {
${seqRows.join('\n')}
};

#define SEQUENCE_COUNT ${sequences.length}`
}

export function emitTypes(needs: EngineNeeds): string {
  // Matches formatStep(): a field only exists if some step sets it.
  const speedFields = [
    ...(needs.fixedSpeed
      ? [`  uint16_t speedMs;      // a delay of its own; 0 follows the base speed`]
      : []),
    ...(needs.scaledSpeed
      ? [`  uint8_t speedScale;    // this step's share of the base delay, in sixteenths`]
      : []),
  ]

  const verticalFlag = needs.bandsVertical
    ? `\n#define FLAG_BANDS_VERTICAL ${FLAG_BANDS_VERTICAL}`
    : ''

  return `enum Motion : uint8_t { MOTION_SCROLL, MOTION_HOLD, MOTION_BANDS };

#define FLAG_MIRROR ${FLAG_MIRROR}
#define FLAG_PRELOAD ${FLAG_PRELOAD}${verticalFlag}

/** One entry of the timeline: a pattern plus how to move it. */
struct Step {
  const uint8_t* pattern;
  uint8_t tileRows;
  uint8_t tileCols;
  uint8_t flags;
  uint8_t motion;
  int8_t vertical;
  int8_t horizontal;
  uint8_t bandCount;
  uint8_t bandDirections;
  uint16_t steps;${speedFields.map((line) => `\n${line}`).join('')}
};

/** A run of steps, repeated. */
struct Sequence {
  uint8_t firstStep;
  uint8_t stepCount;
  uint8_t repeat;
};`
}

export function emitPlayer(needs: EngineNeeds): string {
  const branches: string[] = []
  if (needs.scroll) {
    branches.push(`    case MOTION_SCROLL:
      runScroll(step.vertical, step.horizontal, mirrored, stepMs, step.steps);
      break;`)
  }
  if (needs.hold) {
    branches.push(`    case MOTION_HOLD:
      runHold(stepMs, step.steps);
      break;`)
  }
  if (needs.bandsHorizontal || needs.bandsVertical) {
    // The axis argument only exists when the timeline turns bands both ways.
    const axisArg = needs.bandsHorizontal && needs.bandsVertical
      ? 'step.flags & FLAG_BANDS_VERTICAL, '
      : ''
    branches.push(`    case MOTION_BANDS:
      runBands(step.bandCount, step.bandDirections, ${axisArg}stepMs, step.steps);
      break;`)
  }

  const mirrorCall = needs.mirrorPattern ? `\n  if (mirrored) mirrorPattern();` : ''

  // The base delay, unless this step is scaled off it, pinned past it, or both.
  const follows = needs.scaledSpeed ? 'scaleStepSpeed(step.speedScale)' : 'frameDelayMs'
  const stepMs = needs.fixedSpeed ? `step.speedMs ? step.speedMs : ${follows}` : follows

  return `void playStep(uint8_t index) {
  Step step;
  memcpy_P(&step, &STEPS[index], sizeof(step));

  bool mirrored = step.flags & FLAG_MIRROR;
  loadPattern(step.pattern, step.tileRows, step.tileCols);${mirrorCall}
  if (step.flags & FLAG_PRELOAD) fillPanelFromPattern(mirrored);

  uint16_t stepMs = ${stepMs};
  switch (step.motion) {
${branches.join('\n')}
    default:
      break;
  }
}

void loop() {
  for (uint8_t index = 0; index < SEQUENCE_COUNT; index++) {
    Sequence sequence;
    memcpy_P(&sequence, &SEQUENCES[index], sizeof(sequence));
    for (uint8_t pass = 0; pass < sequence.repeat; pass++) {
      for (uint8_t offset = 0; offset < sequence.stepCount; offset++) {
        playStep(sequence.firstStep + offset);
      }
    }
  }
}`
}
