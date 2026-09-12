/**
 * Deciding which optimisations to apply, by asking the compiler.
 *
 * The flash model is a fit, and avr-gcc links with --gc-sections, so a pass can
 * look like a saving on paper and be worth nothing in the binary — or the
 * reverse. Passes also interact: two that each remove the same duplicate bytes
 * do not remove them twice, and one that adds a decoder only pays once enough
 * patterns use it. So this measures instead of predicting: a baseline, then
 * each candidate pass alone, then the union of whatever won, then a hill-climb
 * that tries removing and re-adding members until nothing improves.
 *
 * Every candidate is checked for output equivalence before it is measured, so a
 * pass that would change the panel costs no compiler time and is reported as a
 * bug rather than quietly dropped.
 */
import type { Project } from '../../types'
import {
  type OptimizationLevel,
  type PassId,
  conflictsIn,
  optionsFor,
} from '../codegen/options'
import {
  analyzeFrames,
  passApplicability,
  type FrameAnalysis,
  type PassApplicability,
} from './analyze'
import { baseSpeedMs } from '../speed'
import { describeResult, validateProject } from './validate'

export type Measurement = { flash: number; sram: number }

export type MeasureRequest = { id: string; passes: PassId[] }
export type MeasureReply = {
  id: string
  ok: boolean
  flash: number | null
  sram: number | null
  error?: string
}

/**
 * Compiles a batch and reports sizes. Supplied by the caller because the
 * browser reaches arduino-cli over the dev-server bridge while a script calls
 * it directly, and batching is what lets four compiles run at once.
 */
export type BatchMeasurer = (requests: MeasureRequest[]) => Promise<MeasureReply[]>

export type Trial = {
  label: string
  passes: PassId[]
  round: string
  ok: boolean
  flash: number | null
  sram: number | null
  /** Against the baseline. Negative is a saving. */
  deltaFlash: number | null
  deltaSram: number | null
  kept: boolean
  note: string
}

export type SearchOutcome = {
  baseline: Measurement | null
  best: { passes: PassId[]; flash: number; sram: number } | null
  trials: Trial[]
  analysis: FrameAnalysis
  /** Every pass the level allows, and why it was or was not tried. */
  applicability: PassApplicability[]
  skipped: Array<{ passes: PassId[]; reason: string }>
  compiles: number
  ms: number
}

export type SearchOptions = {
  level: OptimizationLevel
  /** Hard ceiling on compiles, the baseline included. */
  budget?: number
  onProgress?: (trial: Trial) => void
  /** Board ceilings; a candidate that does not fit is never chosen. */
  limits?: { flashMax?: number | null; sramMax?: number | null }
}

/** SRAM first, then Flash — SRAM is what runs out on an Uno. */
export function better(a: Measurement, b: Measurement): boolean {
  if (a.sram !== b.sram) return a.sram < b.sram
  return a.flash < b.flash
}

const label = (passes: PassId[]) => (passes.length === 0 ? 'baseline' : passes.join('+'))
/**
 * Identity of a candidate, order-independent.
 *
 * The empty set is the baseline and must still have a name — it travels to the
 * compile bridge as a job id, and an empty string reads there as a missing one.
 */
const BASELINE_KEY = 'baseline'
const keyOf = (passes: PassId[]) =>
  passes.length === 0 ? BASELINE_KEY : [...passes].sort().join('|')

export async function searchOptimizations(
  project: Project,
  measure: BatchMeasurer,
  options: SearchOptions,
): Promise<SearchOutcome> {
  const started = Date.now()
  const budget = options.budget ?? 60
  const analysis = analyzeFrames(project.frames, project.grid, baseSpeedMs(project.speed))
  const applicability = passApplicability(analysis, options.level)
  const candidatePasses = applicability.filter((p) => p.applicable).map((p) => p.pass)

  const trials: Trial[] = []
  const skipped: Array<{ passes: PassId[]; reason: string }> = []
  const seen = new Set<string>()
  const measured = new Map<string, Measurement>()
  let compiles = 0
  let baseline: Measurement | null = null

  const fits = (m: Measurement) => {
    const { flashMax, sramMax } = options.limits ?? {}
    if (typeof flashMax === 'number' && flashMax > 0 && m.flash > flashMax) return false
    if (typeof sramMax === 'number' && sramMax > 0 && m.sram > sramMax) return false
    return true
  }

  /**
   * Measures a round, skipping anything already tried, conflicting, or not
   * output-equivalent. Returns only the candidates that compiled.
   */
  const runRound = async (
    round: string,
    sets: PassId[][],
  ): Promise<Array<{ passes: PassId[]; measurement: Measurement }>> => {
    const requests: MeasureRequest[] = []
    const bySet = new Map<string, PassId[]>()

    for (const passes of sets) {
      const key = keyOf(passes)
      if (seen.has(key)) continue
      if (compiles + requests.length >= budget) break

      const clashes = conflictsIn(passes)
      if (clashes.length > 0) {
        seen.add(key)
        skipped.push({ passes, reason: `conflicting passes: ${clashes.map((c) => c.join(' + ')).join(', ')}` })
        continue
      }

      // The gate: never spend a compile on something that changes the panel.
      const check = validateProject(project, optionsFor(passes))
      if (!check.ok) {
        seen.add(key)
        skipped.push({ passes, reason: `output would change — ${describeResult(check)}` })
        continue
      }

      seen.add(key)
      bySet.set(key, passes)
      requests.push({ id: key, passes })
    }

    if (requests.length === 0) return []
    const replies = await measure(requests)
    compiles += requests.length

    const out: Array<{ passes: PassId[]; measurement: Measurement }> = []
    for (const reply of replies) {
      const passes = bySet.get(reply.id) ?? []
      if (!reply.ok || reply.flash == null || reply.sram == null) {
        const trial: Trial = {
          label: label(passes),
          passes,
          round,
          ok: false,
          flash: null,
          sram: null,
          deltaFlash: null,
          deltaSram: null,
          kept: false,
          note: reply.error?.split('\n')[0] ?? 'failed to compile',
        }
        trials.push(trial)
        options.onProgress?.(trial)
        continue
      }
      const measurement = { flash: reply.flash, sram: reply.sram }
      measured.set(reply.id, measurement)
      out.push({ passes, measurement })

      const trial: Trial = {
        label: label(passes),
        passes,
        round,
        ok: true,
        flash: measurement.flash,
        sram: measurement.sram,
        deltaFlash: baseline ? measurement.flash - baseline.flash : null,
        deltaSram: baseline ? measurement.sram - baseline.sram : null,
        kept: false,
        note: fits(measurement) ? '' : 'does not fit the board',
      }
      trials.push(trial)
      options.onProgress?.(trial)
    }
    return out
  }

  // --- baseline ----------------------------------------------------------
  const base = await runRound('baseline', [[]])
  if (base.length === 0) {
    return {
      baseline: null,
      best: null,
      trials,
      analysis,
      applicability,
      skipped,
      compiles,
      ms: Date.now() - started,
    }
  }
  baseline = base[0].measurement
  // Fill in the baseline's own deltas now that it is known.
  for (const t of trials) {
    if (t.ok && t.round === 'baseline') {
      t.deltaFlash = 0
      t.deltaSram = 0
    }
  }

  let best: { passes: PassId[]; measurement: Measurement } = { passes: [], measurement: baseline }

  // --- each pass alone ---------------------------------------------------
  const singles = await runRound(
    'singles',
    candidatePasses.map((p) => [p]),
  )
  const winners = singles
    .filter(({ measurement }) => better(measurement, baseline!) && fits(measurement))
    .map(({ passes }) => passes[0])

  for (const { passes, measurement } of singles) {
    if (better(measurement, best.measurement) && fits(measurement)) best = { passes, measurement }
  }

  // --- the union of what won --------------------------------------------
  if (winners.length > 1) {
    const union = await runRound('union', [winners])
    for (const { passes, measurement } of union) {
      if (better(measurement, best.measurement) && fits(measurement)) best = { passes, measurement }
    }
  }

  // --- hill-climb --------------------------------------------------------
  // Passes interact, so a member that helped alone can hurt in company and one
  // that did nothing alone can pay once another pass is present.
  for (;;) {
    if (compiles >= budget) break
    const current = new Set(best.passes)
    const neighbours: PassId[][] = []
    for (const pass of current) neighbours.push([...current].filter((p) => p !== pass))
    for (const pass of candidatePasses) if (!current.has(pass)) neighbours.push([...current, pass])

    const round = await runRound('climb', neighbours)
    let improved = false
    for (const { passes, measurement } of round) {
      if (better(measurement, best.measurement) && fits(measurement)) {
        best = { passes, measurement }
        improved = true
      }
    }
    if (!improved) break
  }

  const bestKey = keyOf(best.passes)
  for (const trial of trials) {
    if (keyOf(trial.passes) === bestKey && trial.ok) trial.kept = true
  }

  return {
    baseline,
    best: { passes: best.passes, flash: best.measurement.flash, sram: best.measurement.sram },
    trials,
    analysis,
    applicability,
    skipped,
    compiles,
    ms: Date.now() - started,
  }
}
