/**
 * Turning a picture into frame artwork.
 *
 * The panel is one bit per LED, so an imported image has to come down to
 * lit/unlit before it means anything here: it is sampled at exactly the size of
 * the region being filled, reduced to brightness, and cut at a threshold. The
 * result is the same `'#'`/`'.'` art the built-in designs are written in, so it
 * lands on a frame through the ordinary `stampDesign` path.
 */

/** What the file picker offers. Animated files import as their first frame. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg'

/**
 * How the image is placed in a region whose aspect ratio is almost never its
 * own — a 16x32 panel is very wide, and most pictures are not.
 */
export type Fit = 'contain' | 'cover' | 'stretch'

export const FIT_LABELS: Record<Fit, string> = {
  contain: 'Fit',
  cover: 'Fill',
  stretch: 'Stretch',
}

export type Size = { rows: number; cols: number }

export type ThresholdOptions = { threshold: number; invert: boolean }

/**
 * A decoded picture and the object URL holding it open. The dialog shows the
 * picture as well as sampling it, so the URL has to outlive the decode —
 * whoever loads it releases it.
 */
export type LoadedImage = { img: HTMLImageElement; url: string }

/**
 * Decodes a picked file.
 *
 * An `<img>` rather than `createImageBitmap`, because that does not decode SVG
 * everywhere and SVG is the one format that scales to a panel without loss.
 */
export function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // An SVG with no intrinsic size decodes to 0x0, which nothing can sample.
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url)
        reject(new Error(`"${file.name}" has no size the browser can read. An SVG needs a width and height, or a viewBox.`))
        return
      }
      resolve({ img, url })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`"${file.name}" is not an image the browser can open.`))
    }
    img.src = url
  })
}

export function releaseImage(loaded: LoadedImage) {
  URL.revokeObjectURL(loaded.url)
}

// --- the crop ---------------------------------------------------------------

/** The part of the picture that becomes the design, in the picture's own pixels. */
export type Crop = { x: number; y: number; w: number; h: number }

/** Which corner of the crop box is being dragged, or the box itself. */
export type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'move'

export type Bounds = { w: number; h: number }

export const boundsOf = (img: HTMLImageElement): Bounds => ({
  w: img.naturalWidth,
  h: img.naturalHeight,
})

/** The whole picture — where a crop starts, so an import crops nothing by default. */
export const fullCrop = (bounds: Bounds): Crop => ({ x: 0, y: 0, w: bounds.w, h: bounds.h })

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The smallest crop worth having, kept sane for an icon only a few pixels wide. */
const minSide = (bounds: Bounds) => Math.max(1, Math.min(8, bounds.w, bounds.h))

export function clampCrop(crop: Crop, bounds: Bounds): Crop {
  const min = minSide(bounds)
  const w = clamp(crop.w, min, bounds.w)
  const h = clamp(crop.h, min, bounds.h)
  return { x: clamp(crop.x, 0, bounds.w - w), y: clamp(crop.y, 0, bounds.h - h), w, h }
}

/**
 * Moves or resizes the crop by a drag, in picture pixels. A corner drag pins
 * the opposite corner, which is what makes a crop box feel like a crop box.
 */
export function dragCrop(
  start: Crop,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Bounds,
): Crop {
  if (handle === 'move') {
    return {
      x: clamp(start.x + dx, 0, bounds.w - start.w),
      y: clamp(start.y + dy, 0, bounds.h - start.h),
      w: start.w,
      h: start.h,
    }
  }

  const min = minSide(bounds)
  let { x, y, w, h } = start

  if (handle === 'nw' || handle === 'sw') {
    x = clamp(start.x + dx, 0, start.x + start.w - min)
    w = start.x + start.w - x
  } else {
    w = clamp(start.w + dx, min, bounds.w - start.x)
  }

  if (handle === 'nw' || handle === 'ne') {
    y = clamp(start.y + dy, 0, start.y + start.h - min)
    h = start.y + start.h - y
  } else {
    h = clamp(start.h + dy, min, bounds.h - start.y)
  }

  return { x, y, w, h }
}

/**
 * Shrinks the crop to the shape of the region it will fill, around the same
 * centre — so what is selected is exactly what lands, nothing letterboxed and
 * nothing squashed.
 */
export function matchAspect(crop: Crop, target: Size, bounds: Bounds): Crop {
  const aspect = target.cols / target.rows
  const w = Math.min(crop.w, crop.h * aspect)
  const h = w / aspect
  return clampCrop({ x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h }, bounds)
}

/** Whether the crop already has the region's shape, so the fit choice is moot. */
export function matchesAspect(crop: Crop, target: Size): boolean {
  return Math.abs(crop.w / crop.h - target.cols / target.rows) < 0.01
}

/**
 * The source and destination rectangles `drawImage` is called with. The source
 * is the crop, so the fit only decides what happens when the selection is a
 * different shape from the region.
 */
function placement(crop: Crop, target: Size, fit: Fit) {
  const full = {
    sx: crop.x,
    sy: crop.y,
    sw: crop.w,
    sh: crop.h,
    dx: 0,
    dy: 0,
    dw: target.cols,
    dh: target.rows,
  }
  if (fit === 'stretch') return full

  if (fit === 'cover') {
    // Trim the long side of the selection so the whole region is covered.
    const scale = Math.max(target.cols / crop.w, target.rows / crop.h)
    const sw = target.cols / scale
    const sh = target.rows / scale
    return { ...full, sx: crop.x + (crop.w - sw) / 2, sy: crop.y + (crop.h - sh) / 2, sw, sh }
  }

  // contain: the whole selection inside the region, centred, the rest left black.
  const scale = Math.min(target.cols / crop.w, target.rows / crop.h)
  const dw = crop.w * scale
  const dh = crop.h * scale
  return { ...full, dx: (target.cols - dw) / 2, dy: (target.rows - dh) / 2, dw, dh }
}

/**
 * Brightness per cell, 0-255, row-major over `target`.
 *
 * Pixels are composited over black, so a transparent background reads as off
 * rather than as whatever colour happens to sit in the unused channels.
 */
export function sampleLuma(
  img: HTMLImageElement,
  target: Size,
  fit: Fit,
  crop: Crop = fullCrop(boundsOf(img)),
): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = target.cols
  canvas.height = target.rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser did not give us a 2D canvas to convert the image with.')

  // Smoothing on, so a photo far larger than the panel is area-averaged down
  // instead of point-sampled into noise.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const { sx, sy, sw, sh, dx, dy, dw, dh } = placement(crop, target, fit)
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)

  const { data } = ctx.getImageData(0, 0, target.cols, target.rows)
  const luma = new Float32Array(target.rows * target.cols)
  for (let i = 0; i < luma.length; i++) {
    const p = i * 4
    const alpha = data[p + 3] / 255
    luma[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) * alpha
  }
  return luma
}

/**
 * Otsu's method: the cut that best separates the brightness histogram into two
 * groups. It is what the threshold slider opens at, so a dark logo and a bright
 * photo both arrive readable without anyone touching it.
 */
export function otsuThreshold(luma: Float32Array): number {
  const hist = new Uint32Array(256)
  for (const value of luma) hist[Math.max(0, Math.min(255, Math.round(value)))]++

  const total = luma.length
  if (total === 0) return 128
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumBack = 0
  let countBack = 0
  let best = 128
  let bestVariance = -1
  for (let t = 0; t < 256; t++) {
    countBack += hist[t]
    if (countBack === 0) continue
    const countFore = total - countBack
    if (countFore === 0) break
    sumBack += t * hist[t]
    const meanBack = sumBack / countBack
    const meanFore = (sum - sumBack) / countFore
    const variance = countBack * countFore * (meanBack - meanFore) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

/** Cuts sampled brightness into the `'#'`/`'.'` rows a design is made of. */
export function lumaToArt(luma: Float32Array, target: Size, options: ThresholdOptions): string[] {
  const art: string[] = []
  for (let r = 0; r < target.rows; r++) {
    let line = ''
    for (let c = 0; c < target.cols; c++) {
      const on = luma[r * target.cols + c] > options.threshold
      line += (options.invert ? !on : on) ? '#' : '.'
    }
    art.push(line)
  }
  return art
}

/** How many LEDs the art lights, so the dialog can warn about an empty result. */
export function litCount(art: string[]): number {
  return art.reduce((n, line) => n + [...line].filter((ch) => ch === '#').length, 0)
}

/** A file name as a frame name: "vesak-lantern.png" becomes "vesak lantern". */
export function nameFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (!base) return 'Image'
  return base.charAt(0).toUpperCase() + base.slice(1)
}
