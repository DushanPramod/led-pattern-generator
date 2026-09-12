import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
} from 'lucide-react'
import type { Frame, Grid } from '../types'
import { divisors, regionOf, shiftCells, snapToDivisor, sourceCols } from '../lib/grid'
import { useFrameActions } from '../state/useProject'
import { DesignPresets } from './DesignPresets'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Props = { frame: Frame; grid: Grid }

/**
 * Nudge directions, laid out as the same 3x3 pad the Movement panel uses; the
 * centre is the empty cell that pad keeps for "no movement". Diagonals are a
 * single call with both deltas set, so a shape moves one cell corner-ways
 * rather than needing two clicks.
 */
const NUDGES: Array<{ icon: typeof ArrowUp; title: string; dr: number; dc: number } | null> = [
  { icon: ArrowUpLeft, title: 'Nudge up + left', dr: -1, dc: -1 },
  { icon: ArrowUp, title: 'Nudge up', dr: -1, dc: 0 },
  { icon: ArrowUpRight, title: 'Nudge up + right', dr: -1, dc: 1 },
  { icon: ArrowLeft, title: 'Nudge left', dr: 0, dc: -1 },
  null,
  { icon: ArrowRight, title: 'Nudge right', dr: 0, dc: 1 },
  { icon: ArrowDownLeft, title: 'Nudge down + left', dr: 1, dc: -1 },
  { icon: ArrowDown, title: 'Nudge down', dr: 1, dc: 0 },
  { icon: ArrowDownRight, title: 'Nudge down + right', dr: 1, dc: 1 },
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
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">
          Pattern tile &amp; drawing
          <span className="font-normal text-muted-foreground"> · this frame only</span>
        </h3>
        <DesignPresets frame={frame} grid={grid} />
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={isFull ? 'full' : 'tile'}
        onValueChange={(v) => {
          if (!v || v === (isFull ? 'full' : 'tile')) return
          if (v === 'full') update({ tile: 'full' })
          else
            update({
              tile: {
                yy: snapToDivisor(grid.rows, grid.rows),
                xx: snapToDivisor(Math.min(grid.rows, sc), sc),
              },
            })
        }}
      >
        <ToggleGroupItem value="full">Full panel</ToggleGroupItem>
        <ToggleGroupItem value="tile">Repeat a tile</ToggleGroupItem>
      </ToggleGroup>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        The tile is the slice of artwork stored for this frame and repeated across the{' '}
        {grid.rows}x{grid.cols} panel, so it can differ from frame to frame. The panel size itself
        is set once for the whole project.
      </p>

      {!isFull && frame.tile !== 'full' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Tile rows (yy)
            </span>
            <Select value={String(frame.tile.yy)} onValueChange={(v) => setTile({ yy: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {divisors(grid.rows).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Tile cols (xx)
            </span>
            <Select value={String(frame.tile.xx)} onValueChange={(v) => setTile({ xx: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {divisors(sc).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="m-0 basis-full text-xs leading-relaxed text-muted-foreground">
            Stored as a {frame.tile.yy}x{frame.tile.xx} pattern and repeated by{' '}
            <code className="rounded bg-muted px-1 py-0.5">loadPattern()</code> — only divisors of
            the{' '}
            {grid.halfWidth ? `${grid.rows}x${sc} source` : 'panel size'} are offered, because
            tiling repeats whole copies.
          </p>
        </div>
      )}

      <Label className="items-start text-sm font-normal">
        <Checkbox
          className="mt-0.5"
          checked={frame.mirror}
          onCheckedChange={(checked) => update({ mirror: checked === true })}
          aria-label="Mirror left/right"
        />
        <span>
          Mirror left/right{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {grid.halfWidth ? 'writePanelRow(mirrored)' : 'mirrorPattern()'}
          </code>
        </span>
      </Label>
      {grid.halfWidth && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          The {grid.rows}x{sc} pattern is repeated across the panel; mirroring reflects it instead.
          A half-width panel reflects as each row is fed in, so mirroring applies to vertical
          scrolls and holds, not to left/right scrolls.
        </p>
      )}

      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={clear}>Clear</Button>
          <Button type="button" variant="outline" onClick={fill}>Fill</Button>
          <Button type="button" variant="outline" onClick={invert}>Invert</Button>
        </div>
        <div className="grid w-fit grid-cols-3 gap-1">
          {NUDGES.map((n, i) =>
            n ? (
              <Button
                key={n.title}
                type="button"
                variant="outline"
                size="icon"
                title={n.title}
                aria-label={n.title}
                onClick={() => nudge(n.dr, n.dc)}
              >
                <n.icon />
              </Button>
            ) : (
              // eslint-disable-next-line react/no-array-index-key -- fixed 3x3 layout, centre cell
              <span key={i} />
            ),
          )}
        </div>
      </div>
    </section>
  )
}
