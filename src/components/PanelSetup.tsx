import { useState } from 'react'
import { PanelColors } from './PanelColors'
import { SpeedSetup } from './SpeedSetup'
import { useProject } from '../state/useProject'
import { estimateSram } from '../lib/codegen'
import { canHalfWidth, framesClippedBy, sourceCols } from '../lib/grid'
import { colorRuns, describeColor } from '../lib/colors'
import { baseSpeedMs } from '../lib/speed'
import type { Grid, ScanOrder } from '../types'

const PRESETS = [
  { label: '8 x 32', rows: 8, cols: 32 },
  { label: '16 x 32', rows: 16, cols: 32 },
]

/** Short description of the LED colours, for the locked summary line. */
function colorSummary(colors: string[]): string {
  const runs = colorRuns(colors)
  if (runs.length === 1) return `all ${describeColor(runs[0].hex)}`
  if (runs.length <= 3) return runs.map((run) => describeColor(run.hex)).join(' / ')
  return `${runs.length} colour bands`
}

/**
 * Panel size and LED colours describe the board the whole project runs on, not
 * one frame, so they stay locked while frames exist: unlocking is a deliberate
 * step, and a resize that would crop artwork has to be confirmed first.
 */
export function PanelSetup() {
  const { project, dispatch } = useProject()
  const { grid, hardware } = project
  const [showPins, setShowPins] = useState(false)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [draft, setDraft] = useState(() => ({ grid, rows: String(grid.rows), cols: String(grid.cols) }))
  const sram = estimateSram(grid.rows, grid.cols, grid.halfWidth)
  const speedSummary = project.speed.useController
    ? `${project.speed.pin} pot`
    : `${baseSpeedMs(project.speed)} ms fixed`
  const frameCount = project.frames.length
  // With no frames there is nothing to protect, so the panel opens editable.
  const locked = frameCount > 0 && !unlocked

  // Undo, a preset or an import replaces the grid, so the typed sizes follow it.
  const resetDrafts = () => setDraft({ grid, rows: String(grid.rows), cols: String(grid.cols) })
  if (draft.grid !== grid) resetDrafts()

  // Typed sizes commit on blur or Enter, so "16" is never read as "1" mid-keystroke.
  const setGrid = (patch: Partial<Grid>) => {
    const merged = { ...grid, ...patch }
    if (!Number.isFinite(merged.rows) || !Number.isFinite(merged.cols)) return resetDrafts()
    const rows = Math.max(1, Math.min(64, Math.round(merged.rows)))
    const cols = Math.max(1, Math.min(128, Math.round(merged.cols)))
    const next: Grid = { rows, cols, halfWidth: merged.halfWidth }
    if (!canHalfWidth(next)) next.halfWidth = false
    if (rows === grid.rows && cols === grid.cols && !!next.halfWidth === !!grid.halfWidth) {
      return resetDrafts()
    }

    const clipped = framesClippedBy(project.frames, grid, next)
    if (clipped.length) {
      const shown = clipped.slice(0, 4).join(', ')
      const rest = clipped.length > 4 ? ` and ${clipped.length - 4} more` : ''
      const where =
        clipped.length === 1 ? shown : `${clipped.length} of them: ${shown}${rest}`
      const ok = confirm(
        `The panel is shared by every frame, so resizing it to ${rows} x ${cols} rescales ` +
          `${frameCount === 1 ? 'the frame' : `all ${frameCount} frames`}.\n\n` +
          `Artwork outside the new size is cropped on ${where}.\n\n` +
          'Continue?',
      )
      if (!ok) return resetDrafts()
    }
    dispatch({ type: 'setGrid', grid: next })
  }

  const lock = () => {
    setUnlocked(false)
    setShowColors(false)
    resetDrafts()
  }

  return (
    <section className="panel setup">
      <div className="row">
        <label className="field grow">
          <span>Project name</span>
          <input
            value={project.name}
            onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
          />
        </label>

        {locked ? (
          <>
            <div className="field grow">
              <span>Panel — one size and palette for the whole project</span>
              <div className="panel-lock">
                <span className="lock-badge" title="Fixed for every frame in this project">
                  Locked
                </span>
                <strong>
                  {grid.rows} × {grid.cols}
                </strong>
                <span className="subtle">
                  · {colorSummary(project.rowColors)}
                  {grid.halfWidth ? ' · half-width source' : ''}
                  {frameCount === 1
                    ? ' · applies to the whole project'
                    : ` · applies to all ${frameCount} frames`}
                </span>
              </div>
            </div>

            <button type="button" className="ghost" onClick={() => setUnlocked(true)}>
              Change panel…
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>Rows</span>
              <input
                type="number"
                min={1}
                max={64}
                value={draft.rows}
                onChange={(e) => setDraft({ ...draft, rows: e.target.value })}
                onBlur={() => setGrid({ rows: Number(draft.rows) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </label>

            <label className="field">
              <span>Columns</span>
              <input
                type="number"
                min={1}
                max={128}
                value={draft.cols}
                onChange={(e) => setDraft({ ...draft, cols: e.target.value })}
                onBlur={() => setGrid({ cols: Number(draft.cols) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </label>

            <div className="field">
              <span>Presets</span>
              <div className="chips">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={
                      grid.rows === p.rows && grid.cols === p.cols && !grid.halfWidth
                        ? 'chip on'
                        : 'chip'
                    }
                    onClick={() => setGrid({ rows: p.rows, cols: p.cols, halfWidth: false })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className={showColors ? 'ghost on' : 'ghost'}
              onClick={() => setShowColors((v) => !v)}
            >
              {showColors ? 'Hide colours' : 'LED colours'}
            </button>

            {frameCount > 0 && (
              <button type="button" className="primary" onClick={lock}>
                Done
              </button>
            )}
          </>
        )}

        <button
          type="button"
          className={showSpeed ? 'ghost on' : 'ghost'}
          onClick={() => setShowSpeed((v) => !v)}
        >
          {showSpeed ? 'Hide speed' : `Speed · ${speedSummary}`}
        </button>

        <button type="button" className="ghost" onClick={() => setShowPins((v) => !v)}>
          {showPins ? 'Hide wiring' : 'Wiring & pins'}
        </button>
      </div>

      {!locked && frameCount > 0 && (
        <p className="note warn">
          Panel size and LED colours belong to the project, not to a frame. Changing them here
          rescales {frameCount === 1 ? 'the frame' : `all ${frameCount} frames`} at once, and
          shrinking crops anything that falls outside the new size.
        </p>
      )}

      <p className={sram.fitsUno ? 'note' : 'note warn'}>
        Bit-packed buffers use <strong>{sram.arrayBytes} bytes</strong> of SRAM
        {grid.halfWidth
          ? ` (a ${grid.rows}x${grid.cols} panel buffer plus a ${grid.rows}x${sourceCols(grid)} pattern)`
          : ''}
        .{' '}
        {sram.fitsUno
          ? 'Fits an Uno or Nano (2048 B).'
          : sram.fitsMega
            ? 'Too large for an Uno or Nano (2048 B) — use a Mega (8192 B).'
            : 'Too large even for a Mega (8192 B). Reduce the panel size.'}
      </p>

      {showSpeed && <SpeedSetup />}

      {!locked && showColors && <PanelColors />}

      {showPins && (
        <div className="row wrap pins">
          {(['data1', 'str1', 'clock1', 'data2', 'clock2'] as const).map((pin) => (
            <label className="field small" key={pin}>
              <span>{pin}</span>
              <input
                type="number"
                min={0}
                max={53}
                value={hardware[pin]}
                onChange={(e) =>
                  dispatch({ type: 'setHardware', patch: { [pin]: Number(e.target.value) } })
                }
              />
            </label>
          ))}

          <label className="field small">
            <span>Column order</span>
            <select
              value={hardware.scanOrder}
              onChange={(e) =>
                dispatch({ type: 'setHardware', patch: { scanOrder: e.target.value as ScanOrder } })
              }
            >
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
          </label>

          <p className="note span">
            Column shifting order is the one spot that depends on how the 74HC595 chain is
            physically wired. If the pattern comes out reversed on the panel, flip it here.
          </p>
        </div>
      )}
    </section>
  )
}
