import { useCallback, useMemo, useState } from 'react'
import { compileBatch } from '../lib/arduinoBridge'
import type { BridgeStatus } from '../lib/arduinoBridge'
import type { BoardLimits } from '../lib/boards'
import { formatBytes } from '../lib/boards'
import { generate } from '../lib/codegen'
import { PASS_META, optionsFor } from '../lib/codegen/options'
import type { OptimizationLevel } from '../lib/codegen/options'
import { analyzeFrames } from '../lib/optimize/analyze'
import { baseSpeedMs } from '../lib/speed'
import { searchOptimizations } from '../lib/optimize/search'
import type { BatchMeasurer, Trial } from '../lib/optimize/search'
import { useProject } from '../state/useProject'

const LEVELS: Array<{ id: OptimizationLevel; label: string; blurb: string }> = [
  { id: 'off', label: 'Off', blurb: 'One readable table per frame, exactly as drawn.' },
  {
    id: 'safe',
    label: 'Safe',
    blurb: 'Shares identical artwork and drops the pattern buffer. Tables stay legible.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    blurb: 'Also pools and packs tables. Smaller, but no longer pleasant to hand-edit.',
  },
]

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export function OptimizePanel({
  fqbn,
  board,
  status,
}: {
  fqbn: string
  board: BoardLimits | undefined
  status: BridgeStatus
}) {
  const { project, dispatch } = useProject()
  const [running, setRunning] = useState(false)
  const [trials, setTrials] = useState<Trial[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const level = project.optimization?.level ?? 'off'
  const settings = project.optimization
  const analysis = useMemo(
    () => analyzeFrames(project.frames, project.grid, baseSpeedMs(project.speed)),
    [project.frames, project.grid, project.speed],
  )

  const setLevel = (next: OptimizationLevel) => {
    setTrials([])
    setSummary(null)
    setError(null)
    dispatch({
      type: 'setOptimization',
      optimization: next === 'off' ? undefined : { level: next, passes: [] },
    })
  }

  const run = useCallback(async () => {
    setRunning(true)
    setTrials([])
    setSummary(null)
    setError(null)

    // The search runs here, where the project and the generator already are;
    // only the compiling goes over the bridge.
    const measure: BatchMeasurer = async (requests) => {
      const jobs = requests.map((r) => ({
        id: r.id,
        sketch: generate(project, optionsFor(r.passes)).main,
      }))
      const replies = await compileBatch(jobs, fqbn, project.name)
      return replies.map((r) => ({
        id: r.id,
        ok: r.ok,
        flash: r.flash,
        sram: r.sram,
        error: r.error,
      }))
    }

    try {
      const outcome = await searchOptimizations(project, measure, {
        level: level === 'off' ? 'safe' : level,
        limits: { flashMax: board?.flashMax ?? null, sramMax: board?.sramMax ?? null },
        onProgress: (trial) => setTrials((prev) => [...prev, trial]),
      })

      if (!outcome.best || !outcome.baseline) {
        setError('The unoptimised sketch did not compile, so there is nothing to compare against.')
        return
      }

      const dSram = outcome.best.sram - outcome.baseline.sram
      const dFlash = outcome.best.flash - outcome.baseline.flash
      dispatch({
        type: 'setOptimization',
        optimization: {
          level: level === 'off' ? 'safe' : level,
          passes: outcome.best.passes,
          measured: {
            fqbn,
            flash: outcome.best.flash,
            sram: outcome.best.sram,
            baselineFlash: outcome.baseline.flash,
            baselineSram: outcome.baseline.sram,
            at: Date.now(),
          },
        },
      })
      setSummary(
        outcome.best.passes.length === 0
          ? `Nothing helped — the plain sketch was already the smallest. ${outcome.compiles} compiles in ${(outcome.ms / 1000).toFixed(0)}s.`
          : `SRAM ${signed(dSram)} B, Flash ${signed(dFlash)} B — ${outcome.compiles} compiles in ${(outcome.ms / 1000).toFixed(0)}s.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [project, fqbn, level, board, dispatch])

  const ready = status.state === 'ready'
  const measured = settings?.measured
  const stale = measured && measured.fqbn !== fqbn

  return (
    <section className="panel optimize">
      <h3>Optimise for low memory</h3>

      <div className="level-choice">
        {LEVELS.map((l) => (
          <label key={l.id} className={`level${level === l.id ? ' on' : ''}`}>
            <input
              type="radio"
              name="optimization-level"
              checked={level === l.id}
              onChange={() => setLevel(l.id)}
            />
            <strong>{l.label}</strong>
            <span>{l.blurb}</span>
          </label>
        ))}
      </div>

      <p className="note">
        {analysis.frames} frame{analysis.frames === 1 ? '' : 's'}, {analysis.distinctTables} distinct{' '}
        {analysis.distinctTables === 1 ? 'table' : 'tables'}, {formatBytes(analysis.totalPatternBytes)}{' '}
        of artwork
        {analysis.redundantBytes > 0
          ? ` — ${formatBytes(analysis.redundantBytes)} of it duplicated.`
          : '.'}
      </p>

      {level !== 'off' && (
        <>
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => void run()}
              disabled={running || !ready}
              title={
                ready
                  ? 'Compile candidates and keep whichever is smallest'
                  : 'Needs the local dev server'
              }
            >
              {running ? 'Searching…' : 'Find the smallest build'}
            </button>
            {measured && !stale && (
              <span className="note">
                Measured: SRAM {formatBytes(measured.sram)}, Flash {formatBytes(measured.flash)}
              </span>
            )}
            {stale && <span className="note warn">Measured on a different board.</span>}
          </div>

          {trials.length > 0 && (
            <table className="trials">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>SRAM</th>
                  <th>Flash</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((t, i) => (
                  <tr key={`${t.label}-${i}`} className={t.ok ? '' : 'failed'}>
                    <td>{t.label}</td>
                    <td>
                      {t.ok
                        ? t.deltaSram === null || t.deltaSram === 0
                          ? formatBytes(t.sram ?? 0)
                          : signed(t.deltaSram)
                        : '—'}
                    </td>
                    <td>
                      {t.ok
                        ? t.deltaFlash === null || t.deltaFlash === 0
                          ? formatBytes(t.flash ?? 0)
                          : signed(t.deltaFlash)
                        : t.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {summary && <p className="note">{summary}</p>}
          {error && (
            <div className="compile-error">
              <strong>Could not finish</strong>
              <pre>{error}</pre>
            </div>
          )}

          {settings && settings.passes.length > 0 && (
            <ul className="chosen">
              {settings.passes.map((p) => (
                <li key={p}>
                  <strong>{PASS_META[p].label}</strong> — {PASS_META[p].summary}
                </li>
              ))}
            </ul>
          )}

          <p className="note">
            Every candidate is replayed against the reference simulator before it is compiled, so
            whatever is chosen lights exactly the same LEDs in the same order as the plain sketch.
          </p>
        </>
      )}

      {level !== 'off' && !ready && (
        <p className="note warn">
          Searching needs <code>npm run dev</code> — the browser cannot run a compiler. The sketch is
          still built with the {level} passes; only the measuring is unavailable.
        </p>
      )}
    </section>
  )
}
