/**
 * Codegen strategy switches.
 *
 * The emitter has one job but several defensible encodings, and which one is
 * smallest depends on what the frames actually contain — a library of near
 * duplicates wants pooling, a single full-panel design does not. So rather than
 * picking once, each choice is a named pass the optimizer can enable, measure
 * with arduino-cli, and keep or discard on the evidence.
 *
 * `NO_PASSES` must reproduce the original emitter byte for byte. That identity
 * is the anchor every optimisation is judged against.
 */

/** Safe passes keep one readable hex table per frame, as the README promises. */
export const SAFE_PASSES = [
  'progmemPatternRead',
  'dedupePatterns',
  'shareBlanks',
  'mirrorDedupe',
  'tightEngineGating',
  'narrowTimer',
] as const

/** Aggressive passes trade the legible table layout for bytes. */
export const AGGRESSIVE_ONLY_PASSES = [
  'poolPatterns',
  'packSteps',
  'dedupeStepKinds',
  'rlePatterns',
] as const

export type SafePassId = (typeof SAFE_PASSES)[number]
export type AggressivePassId = (typeof AGGRESSIVE_ONLY_PASSES)[number]
export type PassId = SafePassId | AggressivePassId

export const ALL_PASSES: readonly PassId[] = [...SAFE_PASSES, ...AGGRESSIVE_ONLY_PASSES]

export type OptimizationLevel = 'off' | 'safe' | 'aggressive'

export type CodegenOptions = {
  passes: ReadonlySet<PassId>
}

/** The original emitter: every pass off. */
export const NO_PASSES: CodegenOptions = { passes: new Set<PassId>() }

/**
 * Pairs that cannot both be on. The optimizer prunes these before spending a
 * compile, and `optionsFor` refuses to build an options set containing one.
 */
export const CONFLICTS: ReadonlyArray<readonly [PassId, PassId]> = [
  // RLE has to decode into something; progmemPatternRead is what removes the
  // RAM buffer it would decode into.
  ['rlePatterns', 'progmemPatternRead'],
  // Two different layouts for the same STEPS table.
  ['packSteps', 'dedupeStepKinds'],
]

export type PassMeta = {
  id: PassId
  level: Exclude<OptimizationLevel, 'off'>
  label: string
  /** What it does, in one line, for the Memory tab. */
  summary: string
  /** Which resource it is expected to move. Measured, not trusted. */
  targets: 'sram' | 'flash' | 'both'
}

export const PASS_META: Readonly<Record<PassId, PassMeta>> = {
  progmemPatternRead: {
    id: 'progmemPatternRead',
    level: 'safe',
    label: 'Read patterns from PROGMEM',
    summary: 'Drops the pattern[] RAM buffer and tiles at read time instead of load time.',
    targets: 'both',
  },
  dedupePatterns: {
    id: 'dedupePatterns',
    level: 'safe',
    label: 'Share identical patterns',
    summary: 'Frames with byte-identical packed data share one PROGMEM table.',
    targets: 'flash',
  },
  shareBlanks: {
    id: 'shareBlanks',
    level: 'safe',
    label: 'Share blank frames',
    summary: 'All-dark frames point at a single zero table.',
    targets: 'flash',
  },
  mirrorDedupe: {
    id: 'mirrorDedupe',
    level: 'safe',
    label: 'Share mirrored patterns',
    summary: "A frame that is another's reflection reuses it with FLAG_MIRROR.",
    targets: 'flash',
  },
  tightEngineGating: {
    id: 'tightEngineGating',
    level: 'safe',
    label: 'Emit only the motions used',
    summary: 'Leaves out shift helpers the timeline never calls.',
    targets: 'flash',
  },
  narrowTimer: {
    id: 'narrowTimer',
    level: 'safe',
    label: 'Narrow the step timer',
    summary: 'stepStartedAt becomes uint16_t when every hold fits in 65 seconds.',
    targets: 'sram',
  },
  poolPatterns: {
    id: 'poolPatterns',
    level: 'aggressive',
    label: 'Pool overlapping patterns',
    summary: 'Merges pattern tables that share bytes; steps point into the pool.',
    targets: 'flash',
  },
  packSteps: {
    id: 'packSteps',
    level: 'aggressive',
    label: 'Pack the step table',
    summary: 'Bitfields the Step struct down from 14 bytes.',
    targets: 'flash',
  },
  dedupeStepKinds: {
    id: 'dedupeStepKinds',
    level: 'aggressive',
    label: 'Share step shapes',
    summary: 'Steps that differ only by pattern share one descriptor.',
    targets: 'flash',
  },
  rlePatterns: {
    id: 'rlePatterns',
    level: 'aggressive',
    label: 'Run-length encode patterns',
    summary: 'Compresses sparse pattern tables, at the cost of a decoder.',
    targets: 'flash',
  },
}

export function isPassId(value: string): value is PassId {
  return Object.prototype.hasOwnProperty.call(PASS_META, value)
}

export function has(options: CodegenOptions, pass: PassId): boolean {
  return options.passes.has(pass)
}

/** Conflicting pairs present in a pass set, for reporting rather than throwing. */
export function conflictsIn(passes: Iterable<PassId>): Array<readonly [PassId, PassId]> {
  const set = new Set(passes)
  return CONFLICTS.filter(([a, b]) => set.has(a) && set.has(b))
}

/**
 * Builds an options set, dropping unknown ids and resolving conflicts in favour
 * of the pass listed first in CONFLICTS — so a caller can hand over a stored
 * project's pass list without having to sanitise it.
 */
export function optionsFor(passes: Iterable<PassId>): CodegenOptions {
  const set = new Set<PassId>()
  for (const pass of passes) if (isPassId(pass)) set.add(pass)
  for (const [keep, drop] of CONFLICTS) if (set.has(keep) && set.has(drop)) set.delete(drop)
  return { passes: set }
}

/** Every pass a level allows. The optimizer searches within this, it does not just apply it. */
export function passesForLevel(level: OptimizationLevel): readonly PassId[] {
  if (level === 'off') return []
  if (level === 'safe') return SAFE_PASSES
  return ALL_PASSES
}

/**
 * Passes the emitter actually implements today.
 *
 * PASS_META describes the intended catalogue; this is the subset that is built
 * and modelled in engineModel.ts. The verifier tests exactly these, so a pass
 * that is named but not yet wired cannot report a vacuous pass, and the
 * optimizer never proposes a candidate the emitter would silently ignore.
 * Add to this list only together with its model and its corpus run.
 */
export const IMPLEMENTED_PASSES: readonly PassId[] = [
  'progmemPatternRead',
  'dedupePatterns',
  'shareBlanks',
]

export function isImplemented(pass: PassId): boolean {
  return IMPLEMENTED_PASSES.includes(pass)
}

/** Passes a level allows and the emitter can honour. */
export function availablePasses(level: OptimizationLevel): readonly PassId[] {
  return passesForLevel(level).filter(isImplemented)
}
