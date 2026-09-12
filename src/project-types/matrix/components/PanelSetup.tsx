import { ChevronRightIcon, CircuitBoardIcon } from 'lucide-react'
import { useState } from 'react'
import { PanelColors } from './PanelColors'
import { WiringDiagramDialog } from './WiringDiagram'
import { SpeedSetup } from './SpeedSetup'
import { useProject } from '../state/useProject'
import { estimateSram } from '../lib/codegen'
import { canHalfWidth, framesClippedBy, sourceCols } from '../lib/grid'
import { colorRuns, describeColor } from '../lib/colors'
import { baseSpeedMs } from '../lib/speed'
import { cn } from '@/lib/utils'
import type { Grid, ScanOrder } from '../types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const PRESETS = [
  { label: '8 x 32', rows: 8, cols: 32 },
  { label: '16 x 32', rows: 16, cols: 32 },
]

/** Remembers whether the project settings are expanded, per browser. */
const EXPANDED_KEY = 'matrix.panelSetup.expanded'

function readExpanded(fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(EXPANDED_KEY)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

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
  const [showDiagram, setShowDiagram] = useState(false)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [draft, setDraft] = useState(() => ({ grid, rows: String(grid.rows), cols: String(grid.cols) }))
  const [pendingResize, setPendingResize] = useState<{ next: Grid; message: string } | null>(null)
  const sram = estimateSram(grid.rows, grid.cols, grid.halfWidth)
  const speedSummary = project.speed.useController
    ? `${project.speed.pin} pot`
    : `${baseSpeedMs(project.speed)} ms fixed`
  const frameCount = project.frames.length
  // A brand-new project opens the settings so the panel size gets chosen first.
  const [expanded, setExpanded] = useState(() => readExpanded(frameCount === 0))
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
      setPendingResize({
        next,
        message:
          `The panel is shared by every frame, so resizing it to ${rows} x ${cols} rescales ` +
          `${frameCount === 1 ? 'the frame' : `all ${frameCount} frames`}. ` +
          `Artwork outside the new size is cropped on ${where}.`,
      })
      return
    }
    dispatch({ type: 'setGrid', grid: next })
  }

  const confirmResize = () => {
    if (!pendingResize) return
    dispatch({ type: 'setGrid', grid: pendingResize.next })
    setPendingResize(null)
  }
  const cancelResize = () => {
    setPendingResize(null)
    resetDrafts()
  }

  const lock = () => {
    setUnlocked(false)
    setShowColors(false)
    resetDrafts()
  }

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    try {
      localStorage.setItem(EXPANDED_KEY, next ? '1' : '0')
    } catch {
      // Storage can be blocked; the toggle still works for this session.
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide project settings' : 'Show project settings'}
          title={expanded ? 'Hide project settings' : 'Show project settings'}
          onClick={toggleExpanded}
        >
          <ChevronRightIcon className={cn('transition-transform', expanded && 'rotate-90')} />
        </Button>

        <label className="flex min-w-[160px] max-w-[320px] grow basis-[220px] items-center gap-2">
          <span className="sr-only">Project name</span>
          <Input
            value={project.name}
            placeholder="Project name"
            className="font-medium"
            onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
          />
        </label>

        {!expanded && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded-md border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground"
              title="Panel size and LED colours"
              onClick={toggleExpanded}
            >
              <strong className="tabular-nums text-foreground">
                {grid.rows} × {grid.cols}
              </strong>{' '}
              · {colorSummary(project.rowColors)}
              {grid.halfWidth ? ' · half-width' : ''}
            </button>
            <button
              type="button"
              className="rounded-md border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground"
              title="Animation speed"
              onClick={() => {
                setShowSpeed(true)
                toggleExpanded()
              }}
            >
              Speed · {speedSummary}
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md border bg-muted px-2 py-1 hover:text-foreground',
                sram.fitsUno ? 'text-muted-foreground' : 'text-warn',
              )}
              title="Estimated SRAM for the pattern buffers"
              onClick={toggleExpanded}
            >
              SRAM · {sram.arrayBytes} B{sram.fitsUno ? '' : sram.fitsMega ? ' · needs Mega' : ' · too large'}
            </button>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowDiagram(true)}
        >
          <CircuitBoardIcon /> Wiring diagram
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[88px] grow basis-[240px] flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Description
            </span>
            <Input
              value={project.description ?? ''}
              maxLength={200}
              placeholder="Optional"
              onChange={(e) => dispatch({ type: 'setDescription', description: e.target.value })}
            />
          </label>

          {locked ? (
            <>
              <div className="flex min-w-[88px] grow basis-[200px] flex-col gap-1">
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                  Panel Size
                </span>
                <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-lg border bg-muted px-2.5 py-1 text-sm">
                  <Badge variant="secondary" title="Fixed for every frame in this project">
                    Locked
                  </Badge>
                  <strong className="tabular-nums">
                    {grid.rows} × {grid.cols}
                  </strong>
                  <span className="font-normal text-muted-foreground">
                    · {colorSummary(project.rowColors)}
                    {grid.halfWidth ? ' · half-width source' : ''}
                    {frameCount === 1
                      ? ' · applies to the whole project'
                      : ` · applies to all ${frameCount} frames`}
                  </span>
                </div>
              </div>

              <Button type="button" variant="ghost" onClick={() => setUnlocked(true)}>
                Change panel…
              </Button>
            </>
          ) : (
            <>
              <label className="flex w-[88px] flex-col gap-1">
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                  Rows
                </span>
                <Input
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

              <label className="flex w-[88px] flex-col gap-1">
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                  Columns
                </span>
                <Input
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

              <div className="flex flex-col gap-1">
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                  Presets
                </span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={PRESETS.find((p) => grid.rows === p.rows && grid.cols === p.cols && !grid.halfWidth)?.label}
                  onValueChange={(v) => {
                    const p = PRESETS.find((preset) => preset.label === v)
                    if (p) setGrid({ rows: p.rows, cols: p.cols, halfWidth: false })
                  }}
                >
                  {PRESETS.map((p) => (
                    <ToggleGroupItem key={p.label} value={p.label}>
                      {p.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <Button
                type="button"
                variant={showColors ? 'secondary' : 'ghost'}
                onClick={() => setShowColors((v) => !v)}
              >
                {showColors ? 'Hide colours' : 'LED colours'}
              </Button>

              {frameCount > 0 && (
                <Button type="button" onClick={lock}>
                  Done
                </Button>
              )}
            </>
          )}

          <Button
            type="button"
            variant={showSpeed ? 'secondary' : 'ghost'}
            onClick={() => setShowSpeed((v) => !v)}
          >
            {showSpeed ? 'Hide speed' : `Speed · ${speedSummary}`}
          </Button>

          <Button type="button" variant="ghost" onClick={() => setShowPins((v) => !v)}>
            {showPins ? 'Hide wiring' : 'Wiring & pins'}
          </Button>
        </div>

        {!locked && frameCount > 0 && (
          <p className="m-0 text-xs leading-relaxed text-warn">
            Panel size and LED colours belong to the project, not to a frame. Changing them here
            rescales {frameCount === 1 ? 'the frame' : `all ${frameCount} frames`} at once, and
            shrinking crops anything that falls outside the new size.
          </p>
        )}

        <p
          className={cn(
            'm-0 text-xs leading-relaxed',
            sram.fitsUno ? 'text-muted-foreground' : 'text-warn',
          )}
        >
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
          <div className="flex flex-wrap items-start gap-3 border-t pt-3">
            {(['data1', 'clock1', 'data2', 'clock2', 'latch'] as const).map((pin) => (
              <label className="flex w-[88px] flex-col gap-1" key={pin}>
                <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                  {pin}
                </span>
                <Input
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

            <label className="flex w-[150px] flex-col gap-1">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Column order
              </span>
              <Select
                value={hardware.scanOrder}
                onValueChange={(v) => dispatch({ type: 'setHardware', patch: { scanOrder: v as ScanOrder } })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ascending">Ascending</SelectItem>
                  <SelectItem value="descending">Descending</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <p className="m-0 basis-full text-xs leading-relaxed text-muted-foreground">
              Column shifting order is the one spot that depends on how the 74HC595 chain is
              physically wired. If the pattern comes out reversed on the panel, flip it here.
            </p>
          </div>
        )}
        </div>
      )}

      <WiringDiagramDialog open={showDiagram} onClose={() => setShowDiagram(false)} />

      <AlertDialog open={pendingResize !== null} onOpenChange={(open) => !open && cancelResize()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resize the panel?</AlertDialogTitle>
            <AlertDialogDescription>{pendingResize?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelResize}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResize}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
