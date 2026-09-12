import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlugZapIcon } from 'lucide-react'
import {
  compileSketch,
  forgetBridge,
  getBoardLimits,
  getBoards,
  getStatus,
} from '@/lib/arduino/arduinoBridge'
import type { BridgeStatus, CompileResult } from '@/lib/arduino/arduinoBridge'
import { DEFAULT_FQBN, FALLBACK_BOARDS, findBoard, formatBytes } from '@/lib/arduino/boards'
import type { BoardLimits } from '@/lib/arduino/boards'
import { FLASH_TOLERANCE, PATTERN_DESCRIPTOR_BYTES, estimateMemory, generate } from '../lib/codegen'
import { projectOptions } from '../lib/optimize/settings'
import { BridgeSetupDialog } from '@/components/BridgeSetupDialog'
import { OptimizePanel } from './OptimizePanel'
import { useProject } from '../state/useProject'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Bar = { label: string; used: number | null; max: number | null; note: string }

function UsageBar({ label, used, max, note }: Bar) {
  const pct = used !== null && max ? Math.min(100, (used / max) * 100) : null
  const over = used !== null && max !== null && used > max
  const tight = pct !== null && pct > 80
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <strong>{label}</strong>
        <span
          className={cn(
            over && 'font-semibold text-destructive',
            !over && tight && 'text-warn',
          )}
        >
          {used === null
            ? '—'
            : `${formatBytes(used)}${max ? ` of ${formatBytes(max)}` : ''}${
                pct !== null ? ` · ${pct.toFixed(pct < 10 ? 1 : 0)}%` : ''
              }`}
        </span>
      </div>
      <Progress
        value={pct ?? 0}
        className={cn(
          over && '[&>[data-slot=progress-indicator]]:bg-destructive',
          tight && !over && '[&>[data-slot=progress-indicator]]:bg-[var(--warn)]',
        )}
      />
      <span className="text-[0.74rem] leading-relaxed text-muted-foreground">{note}</span>
    </div>
  )
}

export function MemoryCheck() {
  const { project } = useProject()
  const [status, setStatus] = useState<BridgeStatus>({ state: 'checking' })
  const [boards, setBoards] = useState<BoardLimits[]>(FALLBACK_BOARDS)
  const [fqbn, setFqbn] = useState(DEFAULT_FQBN)
  const [busy, setBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  // Tagged with the sketch it measured, so staleness is derived rather than
  // cleared from an effect.
  const [report, setReport] = useState<{
    sketch: string
    fqbn: string
    data: CompileResult | null
    failure: string | null
  } | null>(null)

  // The sketch measured here is the one the project is actually set to emit.
  const options = useMemo(() => projectOptions(project), [project])
  const sketch = useMemo(() => generate(project, options), [project, options])
  const estimate = useMemo(() => estimateMemory(project, options), [project, options])
  const board = findBoard(boards, fqbn)

  // An edit or a board change invalidates whatever was measured before.
  const current = report && report.sketch === sketch.main && report.fqbn === fqbn ? report : null
  const result = current?.data ?? null
  const failure = current?.failure ?? null

  /**
   * Looks for a compiler and, if one answers, replaces the fallback board list
   * with what it actually has installed.
   *
   * `rediscover` is for the Connect button in the setup dialog: the helper was
   * very likely started after the page loaded, so whatever was concluded on
   * mount has to be thrown away rather than trusted.
   */
  const load = useCallback(async (rediscover = false) => {
    if (rediscover) forgetBridge()
    const next = await getStatus()
    setStatus(next)
    if (next.state !== 'ready') return
    try {
      const list = await getBoards()
      if (list.length === 0) return
      // Keep the fallback limits for boards we already know, fill the rest lazily.
      setBoards(
        list.map((b) => {
          const known = findBoard(FALLBACK_BOARDS, b.fqbn)
          return { fqbn: b.fqbn, name: b.name, flashMax: known?.flashMax ?? 0, sramMax: known?.sramMax ?? 0 }
        }),
      )
    } catch {
      // Board listing is a nicety; the fallback table still works.
    }
  }, [])

  // Probing for a compiler is exactly what an effect is for: it asks the world
  // outside React what is there, and the answer arrives later.
  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  // Fill in limits for a board the fallback table doesn't cover.
  useEffect(() => {
    if (status.state !== 'ready') return
    const current = findBoard(boards, fqbn)
    if (!current || (current.flashMax > 0 && current.sramMax > 0)) return
    let live = true
    void (async () => {
      try {
        const limits = await getBoardLimits(fqbn)
        if (!live) return
        setBoards((prev) =>
          prev.map((b) =>
            b.fqbn === fqbn
              ? {
                  ...b,
                  flashMax: limits.flashMax ?? b.flashMax,
                  sramMax: limits.sramMax ?? b.sramMax,
                  mcu: limits.mcu ?? b.mcu,
                }
              : b,
          ),
        )
      } catch {
        // Leave the limits unknown; the bars just show no ceiling.
      }
    })()
    return () => {
      live = false
    }
  }, [fqbn, status.state, boards])

  const check = useCallback(async () => {
    setBusy(true)
    const tag = { sketch: sketch.main, fqbn }
    try {
      const res = await compileSketch(sketch.main, fqbn, project.name)
      setReport({ ...tag, data: res, failure: res.ok ? null : res.error || 'Compilation failed.' })
    } catch (err) {
      setReport({ ...tag, data: null, failure: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }, [sketch.main, fqbn, project.name])

  const measured = result?.ok === true
  const flashMax = result?.flashMax ?? (board?.flashMax || null)
  const sramMax = result?.sramMax ?? (board?.sramMax || null)
  const estimatedSram = estimate.sramGlobals
  const optimisedPatterns = options.passes.has('progmemPatternRead')

  return (
    <>
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[88px] grow basis-[200px] flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Board
          </span>
          <Select value={fqbn} onValueChange={setFqbn}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.fqbn} value={b.fqbn}>
                  {b.name} ({b.fqbn.split(':').pop()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          type="button"
          onClick={() => void check()}
          disabled={busy || status.state !== 'ready'}
          title={
            status.state === 'ready'
              ? 'Compile with arduino-cli'
              : 'Needs the compile helper running on your machine'
          }
        >
          {busy ? 'Compiling…' : 'Check memory'}
        </Button>
        {/*
          Offered whether or not a compiler answered. Without one it is the way
          in; with one it is still where the helper is explained — where it put
          arduino-cli, how to stop it, what to check when it stops answering.
        */}
        <Button
          type="button"
          variant={status.state === 'absent' ? 'outline' : 'ghost'}
          onClick={() => setSetupOpen(true)}
          title="How compiling works, and how to set it up"
        >
          <PlugZapIcon />
          {status.state === 'absent' ? 'Set up compiling' : 'Compiling setup'}
        </Button>
      </div>

      <UsageBar
        label="Flash (program storage)"
        used={measured ? result.flash : estimate.flash}
        max={flashMax}
        note={
          measured
            ? 'Measured by arduino-cli.'
            : `Estimated ${formatBytes(estimate.flashLow)}–${formatBytes(estimate.flashHigh)}: ` +
              `${estimate.designs} pattern${estimate.designs === 1 ? '' : 's'} stored as ` +
              `${estimate.patternBytes} bytes in PROGMEM. Within ${Math.round(FLASH_TOLERANCE * 100)}% on the ` +
              `calibration set, but compile for the real figure.`
        }
      />

      <UsageBar
        label="SRAM (global variables)"
        used={measured ? result.sram : estimatedSram}
        max={sramMax}
        note={
          measured
            ? 'Measured by arduino-cli. Local variables use what is left.'
            : optimisedPatterns
              ? `Exact, not estimated: the panel buffer is bit-packed at one bit per LED and the ` +
                `pattern is read from PROGMEM through a ${PATTERN_DESCRIPTOR_BYTES}-byte descriptor, ` +
                `plus 6 bytes of counters and 9 the core uses.`
              : `Exact, not estimated: both buffers are bit-packed at one bit per LED, plus 6 bytes ` +
                `of counters and 9 the core uses.`
        }
      />

      {failure && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-destructive p-2.5 text-xs">
          <strong className="text-destructive">Compilation failed</strong>
          <pre className="m-0 max-h-[220px] overflow-auto rounded-md bg-code p-2 text-[0.72rem] leading-relaxed break-words whitespace-pre-wrap">
            {failure}
          </pre>
        </div>
      )}

      {measured && result.output && (
        <pre className="m-0 max-h-[220px] overflow-auto rounded-md border bg-code p-2 text-[0.72rem] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
          {result.output.trim()}
        </pre>
      )}

      <p
        className={cn(
          'm-0 text-xs leading-relaxed',
          status.state === 'ready' ? 'text-muted-foreground' : 'text-warn',
        )}
      >
        {status.state === 'checking' && 'Looking for a compiler…'}
        {status.state === 'ready' && (
          <>
            arduino-cli {status.version} found — {boards.length} installed board
            {boards.length === 1 ? '' : 's'}. Compiling is real, not simulated.
          </>
        )}
        {status.state === 'absent' && status.reason}
      </p>

      {status.state === 'absent' && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Compiling happens on your own machine, so it takes a one-time setup — the{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2 hover:text-primary"
            onClick={() => setSetupOpen(true)}
          >
            helper walks you through it
          </button>
          , arduino-cli included. Until then SRAM above is still exact and only Flash is
          approximate — and on these panels SRAM is what runs out first.
        </p>
      )}
    </section>

    <OptimizePanel
      fqbn={fqbn}
      board={board}
      status={status}
      onSetUpCompiling={() => setSetupOpen(true)}
    />

    <BridgeSetupDialog
      open={setupOpen}
      onOpenChange={setSetupOpen}
      status={status}
      onRecheck={() => load(true)}
    />
    </>
  )
}
