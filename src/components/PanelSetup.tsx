import { useState } from 'react'
import { PanelColors } from './PanelColors'
import { useProject } from '../state/useProject'
import { estimateSram } from '../lib/codegen'
import { canHalfWidth, sourceCols } from '../lib/grid'
import type { ScanOrder } from '../types'

const PRESETS = [
  { label: '8 x 32', rows: 8, cols: 32, halfWidth: false },
  { label: '16 x 32', rows: 16, cols: 32, halfWidth: false },
]

export function PanelSetup() {
  const { project, dispatch } = useProject()
  const { grid, hardware } = project
  const [showPins, setShowPins] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const sram = estimateSram(grid.rows, grid.cols, grid.halfWidth)
  const halfOk = canHalfWidth(grid)

  const setGrid = (patch: Partial<typeof grid>) =>
    dispatch({ type: 'setGrid', grid: { ...grid, ...patch } })

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

        <label className="field">
          <span>Rows</span>
          <input
            type="number"
            min={1}
            max={64}
            value={grid.rows}
            onChange={(e) => setGrid({ rows: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Columns</span>
          <input
            type="number"
            min={1}
            max={128}
            value={grid.cols}
            onChange={(e) => setGrid({ cols: Number(e.target.value) })}
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
                  grid.rows === p.rows && grid.cols === p.cols && !!grid.halfWidth === p.halfWidth
                    ? 'chip on'
                    : 'chip'
                }
                onClick={() =>
                  dispatch({
                    type: 'setGrid',
                    grid: { rows: p.rows, cols: p.cols, halfWidth: p.halfWidth },
                  })
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field check half">
          <input
            type="checkbox"
            checked={!!grid.halfWidth}
            disabled={!halfOk}
            onChange={(e) => setGrid({ halfWidth: e.target.checked })}
          />
          <span title={halfOk ? undefined : 'Needs an even column count'}>Half-width source</span>
        </label>

        <button
          type="button"
          className={showColors ? 'ghost on' : 'ghost'}
          onClick={() => setShowColors((v) => !v)}
        >
          {showColors ? 'Hide colours' : 'LED colours'}
        </button>

        <button type="button" className="ghost" onClick={() => setShowPins((v) => !v)}>
          {showPins ? 'Hide wiring' : 'Wiring & pins'}
        </button>
      </div>

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

      {showColors && <PanelColors />}

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

          <label className="field small check">
            <input
              type="checkbox"
              checked={hardware.useSpeedPot}
              onChange={(e) => dispatch({ type: 'setHardware', patch: { useSpeedPot: e.target.checked } })}
            />
            <span>Speed pot on {hardware.speedPin}</span>
          </label>

          {hardware.useSpeedPot ? (
            <>
              <label className="field small">
                <span>Pot min (ms)</span>
                <input
                  type="number"
                  value={hardware.speedMin}
                  onChange={(e) => dispatch({ type: 'setHardware', patch: { speedMin: Number(e.target.value) } })}
                />
              </label>
              <label className="field small">
                <span>Pot max (ms)</span>
                <input
                  type="number"
                  value={hardware.speedMax}
                  onChange={(e) => dispatch({ type: 'setHardware', patch: { speedMax: Number(e.target.value) } })}
                />
              </label>
            </>
          ) : (
            <label className="field small">
              <span>Speed f (ms)</span>
              <input
                type="number"
                min={1}
                value={hardware.defaultSpeed}
                onChange={(e) =>
                  dispatch({ type: 'setHardware', patch: { defaultSpeed: Number(e.target.value) } })
                }
              />
            </label>
          )}

          <p className="note span">
            Column shifting order is the one spot that depends on how the 74HC595 chain is
            physically wired. If the pattern comes out reversed on the panel, flip it here.
          </p>
        </div>
      )}
    </section>
  )
}
