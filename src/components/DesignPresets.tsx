import { useState } from 'react'
import type { Design } from '../lib/presets'
import type { Frame, Grid } from '../types'
import { regionOf, sourceCols } from '../lib/grid'
import { DESIGNS, designCols, designRows, stampDesign, tilesGrid } from '../lib/presets'
import { useProject } from '../state/useProject'

type Props = { frame: Frame; grid: Grid }

function Thumb({ design }: { design: Design }) {
  const rows = designRows(design)
  const cols = designCols(design)
  // Small tiles are previewed repeated, which is how they land on the panel.
  const high = rows * Math.ceil(8 / rows)
  const wide = cols * Math.ceil(8 / cols)
  const dots = []
  for (let r = 0; r < high; r++) {
    for (let c = 0; c < wide; c++) {
      const on = design.art[r % rows][c % cols] === '#'
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={c + 0.5}
          cy={r + 0.5}
          r={on ? 0.4 : 0.18}
          className={on ? 'on' : ''}
        />,
      )
    }
  }
  return (
    <svg className="design-thumb" viewBox={`0 0 ${wide} ${high}`} aria-hidden="true">
      {dots}
    </svg>
  )
}

/** Group names carry spaces and ampersands; ids and aria-controls cannot. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function DesignPresets({ frame, grid }: Props) {
  const { dispatch } = useProject()
  // Collapse state is view-only, so it stays out of the persisted project.
  // The library starts shut so the controls row leads with the drawing tools.
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const region = regionOf(frame, grid)

  const toggleGroup = (name: string) =>
    setCollapsed((shut) =>
      shut.includes(name) ? shut.filter((n) => n !== name) : [...shut, name],
    )

  // A frame the user never named is renamed after the design; their own naming stands.
  const autoNamed =
    /^Frame \d+$/.test(frame.name) ||
    frame.name.trim() === '' ||
    DESIGNS.some((d) => d.name === frame.name)

  const apply = (design: Design) => {
    // Preferably the design becomes the repeating tile; otherwise it is centred
    // in whatever region the frame already draws on.
    const asTile = tilesGrid(design, grid)
    const target = asTile
      ? { rows: designRows(design), cols: designCols(design) }
      : { rows: region.rows, cols: region.cols }
    dispatch({
      type: 'applyDesign',
      id: frame.id,
      cells: stampDesign(design, grid, target),
      tile: asTile ? { yy: target.rows, xx: target.cols } : frame.tile,
      name: autoNamed ? design.name : undefined,
    })
  }

  const reason = (design: Design): string => {
    const size = `${designRows(design)}x${designCols(design)}`
    if (tilesGrid(design, grid)) return `Tile the panel with this ${size} design`
    if (designRows(design) <= region.rows && designCols(design) <= region.cols) {
      return `Draw this ${size} design into the ${region.rows}x${region.cols} region`
    }
    return `Needs a ${size} tile — too big for this ${grid.rows}x${sourceCols(grid)} source`
  }

  const usable = (design: Design) =>
    tilesGrid(design, grid) ||
    (designRows(design) <= region.rows && designCols(design) <= region.cols)

  const groups = DESIGNS.reduce<Array<{ name: string; items: Design[] }>>((acc, design) => {
    const bucket = acc.find((g) => g.name === design.group)
    if (bucket) bucket.items.push(design)
    else acc.push({ name: design.group, items: [design] })
    return acc
  }, [])

  return (
    <section className="panel designs-panel">
      <div className="panel-head">
        <h3>Preset designs</h3>
        <button
          type="button"
          className="ghost toggle"
          aria-expanded={open}
          aria-controls="design-library"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Collapse' : `Expand (${DESIGNS.length})`}
        </button>
      </div>
      {open && (
        <div id="design-library" className="design-library">
          {groups.map((group) => {
            const shut = collapsed.includes(group.name)
            return (
              <div key={group.name} className="design-group">
                <button
                  type="button"
                  className="group-head"
                  aria-expanded={!shut}
                  aria-controls={`designs-${slug(group.name)}`}
                  onClick={() => toggleGroup(group.name)}
                >
                  <span className="caret" aria-hidden="true">
                    {shut ? '▸' : '▾'}
                  </span>
                  <h4>{group.name}</h4>
                  <span className="design-size">{group.items.length}</span>
                </button>
                {!shut && (
                  <div id={`designs-${slug(group.name)}`} className="designs">
                    {group.items.map((design) => (
                      <button
                        key={design.id}
                        type="button"
                        className="design"
                        disabled={!usable(design)}
                        title={reason(design)}
                        onClick={() => apply(design)}
                      >
                        <Thumb design={design} />
                        <span className="design-name">{design.name}</span>
                        <span className="design-size">
                          {designRows(design)}x{designCols(design)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <p className="note">
            Picking one replaces this frame's drawing and sets its tile size, so the design repeats
            across the panel. Undo puts the old drawing back.
          </p>
        </div>
      )}
    </section>
  )
}
