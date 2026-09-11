import type { Frame, Grid, Group } from '../../types'
import { regionOf } from '../grid'
import { mirrorApplies, needsPreload } from '../simulate'
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
  let tiled = false

  for (const frame of played) {
    if (frame.motion.kind === 'scroll') scroll = true
    if (frame.motion.kind === 'static') hold = true
    const region = regionOf(frame, grid)
    if (region.rows < grid.rows || region.cols < (grid.halfWidth ? grid.cols / 2 : grid.cols)) {
      tiled = true
    }
    if (!mirrorApplies(frame, grid)) continue
    if (grid.halfWidth) mirrorFeed = true
    else mirrorPattern = true
  }

  return { bandCounts: usedBandCounts(played), mirrorFeed, mirrorPattern, scroll, hold, tiled }
}

const FLAG_MIRROR = 1
const FLAG_PRELOAD = 2

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
  speedMs: number
  comment: string
}

function directionWord(frame: Frame): string {
  const m = frame.motion
  if (m.kind === 'static') return `hold ${m.steps}`
  if (m.kind === 'band') return `${m.directions.length} bands, ${m.steps} steps`
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
  return {
    symbol,
    tileRows: region.rows,
    tileCols: region.cols,
    flags: (mirrored ? FLAG_MIRROR : 0) | (needsPreload(frame) ? FLAG_PRELOAD : 0),
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
    // 0 means "follow the global speed", which the dial keeps updating.
    speedMs: frame.speed ?? 0,
    comment: `${frame.name} — ${directionWord(frame)}${mirrored ? ', mirrored' : ''}`,
  }
}

/** The row exactly as it appears in the generated STEPS table. */
export function formatStep(step: StepRow): string {
  return (
    `{ ${step.symbol}, ${step.tileRows}, ${step.tileCols}, ${step.flags}, ${step.motion}, ` +
    `${step.vertical}, ${step.horizontal}, ${step.bandCount}, ${step.bandMask}, ` +
    `${step.steps}, ${step.speedMs} }`
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
): string {
  const stepRows = steps.map((s) => `  ${formatStep(s)},   // ${s.comment}`)
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

export function emitTypes(): string {
  return `enum Motion : uint8_t { MOTION_SCROLL, MOTION_HOLD, MOTION_BANDS };

#define FLAG_MIRROR ${FLAG_MIRROR}
#define FLAG_PRELOAD ${FLAG_PRELOAD}

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
  uint16_t steps;
  uint16_t speedMs;      // 0 follows the speed dial
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
  if (needs.bandCounts.length > 0) {
    branches.push(`    case MOTION_BANDS:
      runBands(step.bandCount, step.bandDirections, stepMs, step.steps);
      break;`)
  }

  const mirrorCall = needs.mirrorPattern ? `\n  if (mirrored) mirrorPattern();` : ''

  return `void playStep(uint8_t index) {
  Step step;
  memcpy_P(&step, &STEPS[index], sizeof(step));

  bool mirrored = step.flags & FLAG_MIRROR;
  loadPattern(step.pattern, step.tileRows, step.tileCols);${mirrorCall}
  if (step.flags & FLAG_PRELOAD) fillPanelFromPattern(mirrored);

  uint16_t stepMs = step.speedMs ? step.speedMs : frameDelayMs;
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
