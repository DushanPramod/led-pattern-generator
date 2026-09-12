import type { Frame, Grid } from '../types'
import { divisors, regionOf, shiftCells, snapToDivisor, sourceCols } from '../lib/grid'
import { useFrameActions } from '../state/useProject'

type Props = { frame: Frame; grid: Grid }

/**
 * Nudge directions, laid out as the same 3x3 pad the Movement panel uses; the
 * centre is the empty cell that pad keeps for "no movement". Diagonals are a
 * single call with both deltas set, so a shape moves one cell corner-ways
 * rather than needing two clicks.
 */
const NUDGES: Array<{ label: string; title: string; dr: number; dc: number } | null> = [
  { label: '↖', title: 'Nudge up + left', dr: -1, dc: -1 },
  { label: '↑', title: 'Nudge up', dr: -1, dc: 0 },
  { label: '↗', title: 'Nudge up + right', dr: -1, dc: 1 },
  { label: '←', title: 'Nudge left', dr: 0, dc: -1 },
  null,
  { label: '→', title: 'Nudge right', dr: 0, dc: 1 },
  { label: '↙', title: 'Nudge down + left', dr: 1, dc: -1 },
  { label: '↓', title: 'Nudge down', dr: 1, dc: 0 },
  { label: '↘', title: 'Nudge down + right', dr: 1, dc: 1 },
]

export function TileControls({ frame, grid }: Props) {
  const { update, setCells } = useFrameActions(frame.id)
  const region = regionOf(frame, grid)
  const isFull = frame.tile === 'full'
  const sc = sourceCols(grid)

  const setTile = (patch: { yy?: number; xx?: number }) => {
    const base = frame.tile === 'full' ? { yy: grid.rows, xx: sc } : frame.tile
    update({ tile: { ...base, ...patch } })
  }

  const editRegion = (fn: (cells: Uint8Array) => Uint8Array) => setCells(fn(frame.cells.slice()))

  const clear = () =>
    editRegion((cells) => {
      for (let r = 0; r < region.rows; r++) {
        for (let c = 0; c < region.cols; c++) cells[r * grid.cols + c] = 0
      }
      return cells
    })

  const invert = () =>
    editRegion((cells) => {
      for (let r = 0; r < region.rows; r++) {
        for (let c = 0; c < region.cols; c++) {
          const i = r * grid.cols + c
          cells[i] = cells[i] ? 0 : 1
        }
      }
      return cells
    })

  const fill = () =>
    editRegion((cells) => {
      for (let r = 0; r < region.rows; r++) {
        for (let c = 0; c < region.cols; c++) cells[r * grid.cols + c] = 1
      }
      return cells
    })

  const nudge = (dr: number, dc: number) => setCells(shiftCells(frame.cells, grid, dr, dc, region))

  return (
    <section className="panel">
      <h3>
        Pattern tile &amp; drawing
        <span className="subtle"> · this frame only</span>
      </h3>

      <div className="seg">
        <button
          type="button"
          className={isFull ? 'on' : ''}
          onClick={() => update({ tile: 'full' })}
        >
          Full panel
        </button>
        <button
          type="button"
          className={isFull ? '' : 'on'}
          onClick={() =>
            update({
              tile: {
                yy: snapToDivisor(grid.rows, grid.rows),
                xx: snapToDivisor(Math.min(grid.rows, sc), sc),
              },
            })
          }
        >
          Repeat a tile
        </button>
      </div>

      <p className="note">
        The tile is the slice of artwork stored for this frame and repeated across the{' '}
        {grid.rows}x{grid.cols} panel, so it can differ from frame to frame. The panel size itself
        is set once for the whole project.
      </p>

      {!isFull && frame.tile !== 'full' && (
        <div className="row">
          <label className="field small">
            <span>Tile rows (yy)</span>
            <select value={frame.tile.yy} onChange={(e) => setTile({ yy: Number(e.target.value) })}>
              {divisors(grid.rows).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field small">
            <span>Tile cols (xx)</span>
            <select value={frame.tile.xx} onChange={(e) => setTile({ xx: Number(e.target.value) })}>
              {divisors(sc).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <p className="note span">
            Stored as a {frame.tile.yy}x{frame.tile.xx} pattern and repeated by <code>loadPattern()</code> —
            only divisors of the{' '}
            {grid.halfWidth ? `${grid.rows}x${sc} source` : 'panel size'} are offered, because
            tiling repeats whole copies.
          </p>
        </div>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={frame.mirror}
          onChange={(e) => update({ mirror: e.target.checked })}
        />
        <span>
          Mirror left/right{' '}
          <code>{grid.halfWidth ? 'writePanelRow(mirrored)' : 'mirrorPattern()'}</code>
        </span>
      </label>
      {grid.halfWidth && (
        <p className="note">
          The {grid.rows}x{sc} pattern is repeated across the panel; mirroring reflects it instead.
          A half-width panel reflects as each row is fed in, so mirroring applies to vertical
          scrolls and holds, not to left/right scrolls.
        </p>
      )}

      <div className="tools">
        <button type="button" onClick={clear}>Clear</button>
        <button type="button" onClick={fill}>Fill</button>
        <button type="button" onClick={invert}>Invert</button>
        <div className="nudge dirpad">
          {NUDGES.map((n) =>
            n ? (
              <button key={n.title} type="button" title={n.title} onClick={() => nudge(n.dr, n.dc)}>
                {n.label}
              </button>
            ) : (
              <span key="centre" />
            ),
          )}
        </div>
      </div>
    </section>
  )
}
