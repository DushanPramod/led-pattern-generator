import { useEffect, useMemo, useState } from 'react'
import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react'
import type { Frame, Grid } from '../types'
import { regionOf } from '../lib/grid'
import {
  FIT_LABELS,
  boundsOf,
  fullCrop,
  litCount,
  loadImage,
  lumaToArt,
  matchAspect,
  matchesAspect,
  nameFromFile,
  otsuThreshold,
  releaseImage,
  sampleLuma,
} from '../lib/image'
import type { Crop, Fit, LoadedImage } from '../lib/image'
import { stampDesign } from '../lib/presets'
import { useProject } from '../state/useProject'
import { DotArt } from './DotArt'
import { ImageCrop } from './ImageCrop'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

type Props = {
  /** The picked file; the dialog is open exactly while this is set. */
  file: File | null
  onClose: () => void
  frame: Frame
  grid: Grid
  /** The frame is renamed after the image only if the user never named it. */
  autoName: boolean
}

const FITS: Fit[] = ['contain', 'cover', 'stretch']

const FIT_HELP: Record<Fit, string> = {
  contain: 'The whole selection inside the region, the rest left dark.',
  cover: 'Fills the region and trims whatever hangs over.',
  stretch: 'Squashed to the region exactly, so proportions change.',
}

export function ImageImportDialog({ file, onClose, frame, grid, autoName }: Props) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[860px]">
        {file && (
          // Keyed on the file, so each newly picked picture remounts with the
          // default crop and threshold instead of inheriting the last import's,
          // which rarely suit a different image.
          <ImageImport
            key={`${file.name}:${file.size}:${file.lastModified}`}
            file={file}
            onClose={onClose}
            frame={frame}
            grid={grid}
            autoName={autoName}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImageImport({ file, onClose, frame, grid, autoName }: Props & { file: File }) {
  const { project, dispatch } = useProject()
  // Memoised because the sampling below keys off it, and regionOf() builds a
  // fresh object every render.
  const { rows, cols } = regionOf(frame, grid)
  const region = useMemo(() => ({ rows, cols }), [rows, cols])

  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fit, setFit] = useState<Fit>('contain')
  const [invert, setInvert] = useState(false)
  // Both null until touched, so the crop can default to the whole picture the
  // moment it decodes and the threshold to whatever the picture suggests.
  const [picked, setPicked] = useState<Crop | null>(null)
  const [threshold, setThreshold] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    let held: LoadedImage | null = null
    loadImage(file)
      .then((image) => {
        held = image
        // The object URL stays open while the dialog shows the picture, so it
        // is released here rather than on decode.
        if (live) setLoaded(image)
        else releaseImage(image)
      })
      .catch((err: Error) => {
        if (live) setLoadError(err.message)
      })
    return () => {
      live = false
      if (held) releaseImage(held)
    }
  }, [file])

  const bounds = useMemo(() => (loaded ? boundsOf(loaded.img) : null), [loaded])
  const crop = useMemo(
    () => picked ?? (bounds ? fullCrop(bounds) : null),
    [picked, bounds],
  )

  // Only a crop or fit change re-samples the canvas; dragging the threshold
  // just re-cuts these numbers.
  const sampled = useMemo(() => {
    if (!loaded || !crop) return null
    try {
      return { luma: sampleLuma(loaded.img, region, fit, crop), error: null }
    } catch (err) {
      return { luma: null, error: (err as Error).message }
    }
  }, [loaded, region, fit, crop])

  const luma = sampled?.luma ?? null
  const error = loadError ?? sampled?.error ?? null

  const auto = useMemo(() => (luma ? otsuThreshold(luma) : 128), [luma])
  const cut = threshold ?? auto

  const art = useMemo(
    () => (luma ? lumaToArt(luma, region, { threshold: cut, invert }) : null),
    [luma, region, cut, invert],
  )

  const lit = art ? litCount(art) : 0
  const total = rows * cols
  // A half-width frame authors the source array, which is narrower than the panel.
  const what = frame.tile !== 'full' ? 'tile' : grid.halfWidth ? 'source' : 'panel'
  // When the selection already has the region's shape, all three fits agree.
  const shaped = crop ? matchesAspect(crop, region) : false

  const apply = () => {
    if (!art) return
    const name = nameFromFile(file)
    dispatch({
      type: 'applyDesign',
      id: frame.id,
      cells: stampDesign({ id: 'image', name, group: '', art }, grid, region),
      // Unlike a preset, an image is not a repeating motif: it fills whatever
      // region the frame is already set to draw on.
      tile: frame.tile,
      name: autoName ? name : undefined,
    })
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import an image</DialogTitle>
        <DialogDescription>
          {file.name} · fitted to the {rows}x{cols} {what} this frame draws on. The panel is one bit
          per LED, so the image is cut into lit and unlit dots.
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <p className="m-0 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : !art || !crop || !bounds || !loaded ? (
        <p className="m-0 flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
          Reading the image…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                The image · drag to choose the part to use
              </span>
              <ImageCrop src={loaded.url} bounds={bounds} crop={crop} onCrop={setPicked} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPicked(fullCrop(bounds))}
                >
                  Whole image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={shaped}
                  onClick={() => setPicked(matchAspect(crop, region, bounds))}
                >
                  Match {what} shape
                </Button>
                <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                  {Math.round(crop.w)} x {Math.round(crop.h)} of {bounds.w} x {bounds.h} px
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                On the {rows}x{cols} {what}
              </span>
              <div className="flex items-center justify-center rounded-md border bg-[#0b0f16] p-3">
                {/* The board this will run on, row colours and all. */}
                <DotArt art={art} rowColors={project.rowColors} className="h-auto w-full" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                If the shapes differ
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={fit}
                onValueChange={(v) => v && setFit(v as Fit)}
              >
                {FITS.map((f) => (
                  <ToggleGroupItem key={f} value={f} title={FIT_HELP[f]}>
                    {FIT_LABELS[f]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                {shaped
                  ? `The selection already has the ${what}'s shape, so this makes no difference.`
                  : FIT_HELP[fit]}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Brightness threshold
              </span>
              <Slider
                className="py-1.5"
                min={0}
                max={255}
                value={[cut]}
                onValueChange={([v]) => setThreshold(v)}
                aria-label="Brightness threshold"
              />
              <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                Anything brighter than {cut} lights up — {lit} of {total} LEDs.
                {threshold !== null && threshold !== auto && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="cursor-pointer underline underline-offset-2"
                      onClick={() => setThreshold(null)}
                    >
                      Back to automatic ({auto})
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          <Label className="text-sm font-normal">
            <Checkbox
              checked={invert}
              onCheckedChange={(checked) => setInvert(checked === true)}
              aria-label="Invert"
            />
            Invert — light the dark parts instead
          </Label>

          {lit === 0 && (
            <p className="m-0 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Nothing is lit at this threshold. Lower it, or invert.
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!art} onClick={apply}>
          Use this image
        </Button>
      </DialogFooter>
    </>
  )
}
