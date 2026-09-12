import { useMemo, useRef, useState } from 'react'
import {
  COLOR_SCHEMES,
  DEFAULT_LED_COLOR,
  LED_PRESETS,
  colorRuns,
  describeColor,
  normalizeHex,
} from '../lib/colors'
import { useProject } from '../state/useProject'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'

/**
 * Per-row LED colours. Rows are the unit because that is how the boards are
 * built — one colour per ring — so a row strip plus a palette covers almost
 * every panel, and the picker handles the odd custom LED.
 */
export function PanelColors() {
  const { project, dispatch } = useProject()
  const colors = project.rowColors
  const rows = project.grid.rows

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [custom, setCustom] = useState(DEFAULT_LED_COLOR)
  const [hexDraft, setHexDraft] = useState(DEFAULT_LED_COLOR)
  const anchor = useRef(0)

  // Shrinking the panel leaves rows selected that no longer exist.
  const selection = useMemo(
    () => new Set([...selected].filter((i) => i < rows)),
    [selected, rows],
  )
  // An empty selection means "the whole panel", which is the common case.
  const targets = selection.size ? selection : new Set(colors.map((_, i) => i))
  const applyLabel = selection.size
    ? `Apply to ${selection.size} row${selection.size > 1 ? 's' : ''}`
    : 'Apply to all rows'

  const setColors = (next: string[]) => dispatch({ type: 'setRowColors', colors: next })

  const apply = (hex: string) => {
    setCustom(hex)
    setHexDraft(hex)
    setColors(colors.map((c, i) => (targets.has(i) ? hex : c)))
  }

  const clickRow = (index: number, event: React.MouseEvent) => {
    setSelected((current) => {
      const next = new Set(current)
      if (event.shiftKey) {
        const [from, to] = index < anchor.current ? [index, anchor.current] : [anchor.current, index]
        for (let r = from; r <= to; r++) next.add(r)
        return next
      }
      anchor.current = index
      if (event.ctrlKey || event.metaKey) {
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      }
      // A plain click selects just that row, or clears it when it was the only one.
      return next.size === 1 && next.has(index) ? new Set() : new Set([index])
    })
  }

  const summary = useMemo(() => {
    const runs = colorRuns(colors)
    if (runs.length === 1) return `All ${rows} rows are ${describeColor(runs[0].hex)}.`
    // A long list stops being readable, and the row strip above already shows it.
    if (runs.length > 5) return `${runs.length} colour bands across ${rows} rows.`
    const label = (run: { from: number; to: number; hex: string }) =>
      run.from === run.to
        ? `row ${run.from + 1} ${describeColor(run.hex)}`
        : `rows ${run.from + 1}–${run.to + 1} ${describeColor(run.hex)}`
    return `${runs.length} colour bands: ${runs.map(label).join(', ')}.`
  }, [colors, rows])

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[88px] grow basis-[200px] flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Rows · click to select, shift-click a range, ctrl-click to add
          </span>
          <div className="flex flex-wrap gap-1">
            {colors.map((hex, i) => (
              <button
                key={i}
                type="button"
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-1 text-xs tabular-nums transition-colors',
                  selection.has(i)
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:border-primary',
                )}
                onClick={(e) => clickRow(i, e)}
                title={`Row ${i + 1} — ${describeColor(hex)}`}
              >
                {/* A dark ring keeps pale LEDs (white, ice blue) visible on the light theme. */}
                <span
                  className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]"
                  style={{ background: hex }}
                />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Selection
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(colors.map((_, i) => i)))}
            >
              All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selection.size === 0}
              onClick={() => setSelected(new Set())}
            >
              None
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[88px] grow basis-[200px] flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Preset LED colours
          </span>
          <div className="flex flex-wrap gap-1.5">
            {LED_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="h-7 w-8 cursor-pointer rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)] hover:ring-2 hover:ring-primary"
                style={{ background: preset.hex }}
                title={`${preset.name} (${preset.hex}) — ${applyLabel.toLowerCase()}`}
                onClick={() => apply(preset.hex)}
              >
                <span className="sr-only">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Custom colour
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="h-8 w-10 shrink-0 rounded-lg border border-input p-0.5"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                setHexDraft(e.target.value)
              }}
            />
            <Input
              className="w-24 font-mono lowercase"
              value={hexDraft}
              spellCheck={false}
              onChange={(e) => {
                setHexDraft(e.target.value)
                const hex = normalizeHex(e.target.value)
                if (hex) setCustom(hex)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply(normalizeHex(hexDraft) ?? custom)
              }}
              onBlur={() => setHexDraft(custom)}
            />
            <Button type="button" onClick={() => apply(custom)}>
              {applyLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[88px] grow basis-[200px] flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Whole-panel schemes
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_SCHEMES.map((scheme) => (
              <Button
                key={scheme.name}
                type="button"
                variant="outline"
                size="sm"
                title={scheme.hint}
                onClick={() => {
                  setSelected(new Set())
                  setColors(scheme.build(rows))
                }}
              >
                {scheme.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {summary} The panel is switched one bit per LED, so colours come from the LEDs you fit on each row —
        they change the editor and the preview, and are written into the sketch header as an
        assembly note, but never change the generated code.
      </p>
    </div>
  )
}
