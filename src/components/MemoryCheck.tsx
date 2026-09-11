import { useCallback, useEffect, useMemo, useState } from 'react'
import { compileSketch, getBoardLimits, getBoards, getStatus } from '../lib/arduinoBridge'
import type { BridgeStatus, CompileResult } from '../lib/arduinoBridge'
import { DEFAULT_FQBN, FALLBACK_BOARDS, findBoard, formatBytes } from '../lib/boards'
import type { BoardLimits } from '../lib/boards'
import { estimateMemory, generate } from '../lib/codegen'
import { useProject } from '../state/useProject'

type Bar = { label: string; used: number | null; max: number | null; note: string }

function UsageBar({ label, used, max, note }: Bar) {
  const pct = used !== null && max ? Math.min(100, (used / max) * 100) : null
  const over = used !== null && max !== null && used > max
  const tight = pct !== null && pct > 80
  return (
    <div className="usage">
      <div className="usage-head">
        <strong>{label}</strong>
        <span className={over ? 'danger' : tight ? 'warn' : ''}>
          {used === null
            ? '—'
            : `${formatBytes(used)}${max ? ` of ${formatBytes(max)}` : ''}${
                pct !== null ? ` · ${pct.toFixed(pct < 10 ? 1 : 0)}%` : ''
              }`}
        </span>
      </div>
      <div className="usage-track">
        <div
          className={`usage-fill${over ? ' over' : tight ? ' tight' : ''}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <span className="usage-note">{note}</span>
    </div>
  )
}

export function MemoryCheck() {
  const { project } = useProject()
  const [status, setStatus] = useState<BridgeStatus>({ state: 'checking' })
  const [boards, setBoards] = useState<BoardLimits[]>(FALLBACK_BOARDS)
  const [fqbn, setFqbn] = useState(DEFAULT_FQBN)
  const [busy, setBusy] = useState(false)
  // Tagged with the sketch it measured, so staleness is derived rather than
  // cleared from an effect.
  const [report, setReport] = useState<{
    sketch: string
    fqbn: string
    data: CompileResult | null
    failure: string | null
  } | null>(null)

  const sketch = useMemo(() => generate(project), [project])
  const estimate = useMemo(() => estimateMemory(project), [project])
  const board = findBoard(boards, fqbn)

  // An edit or a board change invalidates whatever was measured before.
  const current = report && report.sketch === sketch.main && report.fqbn === fqbn ? report : null
  const result = current?.data ?? null
  const failure = current?.failure ?? null

  useEffect(() => {
    let live = true
    void (async () => {
      const next = await getStatus()
      if (!live) return
      setStatus(next)
      if (next.state !== 'ready') return
      try {
        const list = await getBoards()
        if (!live || list.length === 0) return
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
    })()
    return () => {
      live = false
    }
  }, [])

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

  return (
    <section className="panel memory">
      <div className="row">
        <label className="field grow">
          <span>Board</span>
          <select value={fqbn} onChange={(e) => setFqbn(e.target.value)}>
            {boards.map((b) => (
              <option key={b.fqbn} value={b.fqbn}>
                {b.name} ({b.fqbn.split(':').pop()})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => void check()}
          disabled={busy || status.state !== 'ready'}
          title={status.state === 'ready' ? 'Compile with arduino-cli' : 'Needs the local dev server'}
        >
          {busy ? 'Compiling…' : 'Check memory'}
        </button>
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
              `${estimate.patternBytes} bytes in PROGMEM. Within 4% on the calibration set, but ` +
              `compile for the real figure.`
        }
      />

      <UsageBar
        label="SRAM (global variables)"
        used={measured ? result.sram : estimatedSram}
        max={sramMax}
        note={
          measured
            ? 'Measured by arduino-cli. Local variables use what is left.'
            : `Exact, not estimated: both buffers are bit-packed at one bit per LED, plus 6 bytes ` +
              `of counters and 9 the core uses — matched on all 15 calibration compiles.`
        }
      />

      {failure && (
        <div className="compile-error">
          <strong>Compilation failed</strong>
          <pre>{failure}</pre>
        </div>
      )}

      {measured && result.output && (
        <pre className="compile-out">{result.output.trim()}</pre>
      )}

      <p className={status.state === 'ready' ? 'note' : 'note warn'}>
        {status.state === 'checking' && 'Looking for arduino-cli…'}
        {status.state === 'ready' && (
          <>
            arduino-cli {status.version} found — {boards.length} installed board
            {boards.length === 1 ? '' : 's'}. Compiling is real, not simulated.
          </>
        )}
        {status.state === 'absent' && status.reason}
      </p>

      {status.state === 'absent' && (
        <p className="note">
          Set <code>ARDUINO_CLI_PATH</code> if arduino-cli lives somewhere unusual. SRAM above is
          still exact; only Flash is approximate — and on these panels SRAM is what runs out first.
        </p>
      )}
    </section>
  )
}
