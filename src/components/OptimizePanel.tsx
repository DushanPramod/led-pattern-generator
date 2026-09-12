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
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

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
  onSetUpCompiling,
}: {
  fqbn: string
  board: BoardLimits | undefined
  status: BridgeStatus
  onSetUpCompiling: () => void
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
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h3 className="m-0 text-sm font-semibold">Optimise for low memory</h3>

      <RadioGroup
        className="grid-cols-1 gap-1.5 sm:grid-cols-3"
        value={level}
        onValueChange={(v) => setLevel(v as OptimizationLevel)}
      >
        {LEVELS.map((l) => (
          <Label
            key={l.id}
            className={cn(
              'grid cursor-pointer grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-2 font-normal',
              level === l.id && 'border-primary bg-accent',
            )}
          >
            <RadioGroupItem
              value={l.id}
              aria-label={l.label}
              className="row-span-2 self-center"
            />
            <strong className="text-[13px] font-semibold">{l.label}</strong>
            <span className="col-start-2 text-xs text-muted-foreground">{l.blurb}</span>
          </Label>
        ))}
      </RadioGroup>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {analysis.frames} frame{analysis.frames === 1 ? '' : 's'}, {analysis.distinctTables} distinct{' '}
        {analysis.distinctTables === 1 ? 'table' : 'tables'}, {formatBytes(analysis.totalPatternBytes)}{' '}
        of artwork
        {analysis.redundantBytes > 0
          ? ` — ${formatBytes(analysis.redundantBytes)} of it duplicated.`
          : '.'}
      </p>

      {level !== 'off' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void run()}
              disabled={running || !ready}
              title={
                ready
                  ? 'Compile candidates and keep whichever is smallest'
                  : 'Needs the local dev server'
              }
            >
              {running ? 'Searching…' : 'Find the smallest build'}
            </Button>
            {measured && !stale && (
              <span className="text-xs text-muted-foreground">
                Measured: SRAM {formatBytes(measured.sram)}, Flash {formatBytes(measured.flash)}
              </span>
            )}
            {stale && <span className="text-xs text-warn">Measured on a different board.</span>}
          </div>

          {trials.length > 0 && (
            <Table className="text-xs tabular-nums [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right">
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>SRAM</TableHead>
                  <TableHead>Flash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.map((t, i) => (
                  <TableRow key={`${t.label}-${i}`} className={cn(!t.ok && 'text-destructive')}>
                    <TableCell>{t.label}</TableCell>
                    <TableCell>
                      {t.ok
                        ? t.deltaSram === null || t.deltaSram === 0
                          ? formatBytes(t.sram ?? 0)
                          : signed(t.deltaSram)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {t.ok
                        ? t.deltaFlash === null || t.deltaFlash === 0
                          ? formatBytes(t.flash ?? 0)
                          : signed(t.deltaFlash)
                        : t.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {summary && <p className="m-0 text-xs leading-relaxed text-muted-foreground">{summary}</p>}
          {error && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-destructive p-2.5 text-xs">
              <strong className="text-destructive">Could not finish</strong>
              <pre className="m-0 max-h-[220px] overflow-auto rounded-md bg-code p-2 text-[0.72rem] leading-relaxed break-words whitespace-pre-wrap">
                {error}
              </pre>
            </div>
          )}

          {settings && settings.passes.length > 0 && (
            <ul className="m-0 list-disc pl-5 text-xs text-muted-foreground">
              {settings.passes.map((p) => (
                <li key={p}>
                  <strong className="text-foreground">{PASS_META[p].label}</strong> —{' '}
                  {PASS_META[p].summary}
                </li>
              ))}
            </ul>
          )}

          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            Every candidate is replayed against the reference simulator before it is compiled, so
            whatever is chosen lights exactly the same LEDs in the same order as the plain sketch.
          </p>
        </>
      )}

      {level !== 'off' && !ready && (
        <p className="m-0 text-xs leading-relaxed text-warn">
          Searching compiles every candidate, and a browser cannot — it needs the{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2 hover:text-primary"
            onClick={onSetUpCompiling}
          >
            compile helper running on your machine
          </button>
          . The sketch is still built with the {level} passes; only the measuring is unavailable.
        </p>
      )}
    </section>
  )
}
