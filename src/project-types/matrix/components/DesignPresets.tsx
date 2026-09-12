import { ChevronDown, ChevronRight, ImageIcon, LayoutGrid } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Design } from '../lib/presets'
import type { Frame, Grid } from '../types'
import { regionOf, sourceCols } from '../lib/grid'
import { ACCEPTED_IMAGE_TYPES } from '../lib/image'
import { DESIGNS, designCols, designRows, stampDesign, tilesGrid } from '../lib/presets'
import { useProject } from '../state/useProject'
import { DotArt } from './DotArt'
import { ImageImportDialog } from './ImageImportDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = { frame: Frame; grid: Grid }

/** Group names carry spaces and ampersands; ids and aria-controls cannot. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The "Presets" and "Import image…" buttons, each opening its own dialog, so
 * the design library takes no room on the page until it is asked for.
 */
export function DesignPresets({ frame, grid }: Props) {
  const { dispatch } = useProject()
  // Open and collapse state are view-only, so they stay out of the persisted project.
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<string[]>([])
  // The picked file is what opens the import dialog; clearing it shuts it.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
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
    setOpen(false)
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
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LayoutGrid /> Presets ({DESIGNS.length})
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => imageInput.current?.click()}
      >
        <ImageIcon /> Import image…
      </Button>
      <input
        ref={imageInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setImageFile(file)
          // Cleared so picking the same file twice still fires a change.
          e.target.value = ''
        }}
      />

      <ImageImportDialog
        file={imageFile}
        onClose={() => setImageFile(null)}
        frame={frame}
        grid={grid}
        autoName={autoNamed}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Preset designs</DialogTitle>
            <DialogDescription>
              Picking one replaces this frame's drawing and sets its tile size, so the design
              repeats across the panel. Undo puts the old drawing back.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {groups.map((group) => {
              const shut = collapsed.includes(group.name)
              return (
                <div key={group.name} className="flex flex-col gap-2">
                  {/* The whole group header is the hit target, so it drops the button chrome. */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-fit justify-start gap-1.5 px-1 py-0.5"
                    aria-expanded={!shut}
                    aria-controls={`designs-${slug(group.name)}`}
                    onClick={() => toggleGroup(group.name)}
                  >
                    <span className="text-muted-foreground" aria-hidden="true">
                      {shut ? <ChevronRight /> : <ChevronDown />}
                    </span>
                    <h4 className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {group.name}
                    </h4>
                    <span className="text-[0.62rem] tabular-nums text-muted-foreground">
                      {group.items.length}
                    </span>
                  </Button>
                  {!shut && (
                    <div
                      id={`designs-${slug(group.name)}`}
                      className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2"
                    >
                      {group.items.map((design) => (
                        <button
                          key={design.id}
                          type="button"
                          className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-[#222b38] bg-[#0b0f16] px-1 py-1.5 transition-colors hover:border-primary disabled:cursor-default disabled:opacity-25 disabled:hover:border-[#222b38]"
                          disabled={!usable(design)}
                          title={reason(design)}
                          onClick={() => apply(design)}
                        >
                          <DotArt
                            art={design.art}
                            repeatTo={8}
                            className="h-auto w-full max-w-[52px]"
                          />
                          <span className="text-center text-[0.7rem] leading-tight text-[#c8cfdb]">
                            {design.name}
                          </span>
                          <span className="text-[0.62rem] tabular-nums text-[#6d7889]">
                            {designRows(design)}x{designCols(design)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
