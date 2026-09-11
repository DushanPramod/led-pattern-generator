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

  // An empty selection means "the whole panel", which is the common case.
  const targets = selected.size ? selected : new Set(colors.map((_, i) => i))
  const applyLabel = selected.size
    ? `Apply to ${selected.size} row${selected.size > 1 ? 's' : ''}`
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

  const runs = useMemo(() => colorRuns(colors), [colors])

  return (
    <div className="led-colors">
      <div className="row">
        <div className="field grow">
          <span>Rows · click to select, shift-click a range, ctrl-click to add</span>
          <div className="row-strip">
            {colors.map((hex, i) => (
              <button
                key={i}
                type="button"
                className={selected.has(i) ? 'row-swatch on' : 'row-swatch'}
                onClick={(e) => clickRow(i, e)}
                title={`Row ${i + 1} — ${describeColor(hex)}`}
              >
                <span className="dot" style={{ background: hex }} />
                <span className="n">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Selection</span>
          <div className="chips">
            <button
              type="button"
              className="chip"
              onClick={() => setSelected(new Set(colors.map((_, i) => i)))}
            >
              All
            </button>
            <button
              type="button"
              className="chip"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              None
            </button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="field grow">
          <span>Preset LED colours</span>
          <div className="palette">
            {LED_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="swatch"
                style={{ background: preset.hex }}
                title={`${preset.name} (${preset.hex}) — ${applyLabel.toLowerCase()}`}
                onClick={() => apply(preset.hex)}
              >
                <span className="sr">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Custom colour</span>
          <div className="custom-color">
            <input
              type="color"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                setHexDraft(e.target.value)
              }}
            />
            <input
              className="hex"
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
            <button type="button" className="primary" onClick={() => apply(custom)}>
              {applyLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="field grow">
          <span>Whole-panel schemes</span>
          <div className="chips wrap">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.name}
                type="button"
                className="chip"
                title={scheme.hint}
                onClick={() => {
                  setSelected(new Set())
                  setColors(scheme.build(rows))
                }}
              >
                {scheme.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="note">
        {runs.length === 1
          ? `All ${rows} rows are ${describeColor(runs[0].hex)}.`
          : `${runs.length} colour bands: ` +
            runs
              .map((r) =>
                r.from === r.to
                  ? `row ${r.from + 1} ${describeColor(r.hex)}`
                  : `rows ${r.from + 1}–${r.to + 1} ${describeColor(r.hex)}`,
              )
              .join(', ') + '.'}{' '}
        The panel is switched one bit per LED, so colours come from the LEDs you fit on each row —
        they change the editor and the preview, and are written into the sketch header as an
        assembly note, but never change the generated code.
      </p>
    </div>
  )
}
