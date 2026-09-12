/**
 * Saving the wiring diagram as a file.
 *
 * The on-screen drawings paint themselves from the theme's CSS variables, which
 * resolve against :root and would come out unstyled in a file of their own. So
 * the export builds one self-contained SVG — the diagram with the pinout set
 * beside it, the variables copied in — and rasterises that same SVG for PNG
 * and JPG, so all three formats show exactly the same thing.
 */

export type ExportFormat = 'svg' | 'png' | 'jpg'

const THEME_VARS = ['--surface', '--input', '--line', '--text', '--muted']
const SVG_NS = 'http://www.w3.org/2000/svg'
const PAD = 16
const GAP = 24
/** Raster exports render at twice the drawing's size, so text stays crisp. */
const RASTER_SCALE = 2
/** Browsers refuse canvases much past this on a side. */
const MAX_CANVAS_SIDE = 16000

function naturalSize(svg: SVGSVGElement): { w: number; h: number } {
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(/\s+/).map(Number)
  return { w, h }
}

/** One SVG document holding every part side by side, top-aligned. */
export function composeSvg(parts: SVGSVGElement[]): { markup: string; width: number; height: number } {
  const sizes = parts.map(naturalSize)
  const width = PAD * 2 + sizes.reduce((sum, s) => sum + s.w, 0) + GAP * (parts.length - 1)
  const height = PAD * 2 + Math.max(...sizes.map((s) => s.h))

  const computed = getComputedStyle(document.documentElement)
  const vars = THEME_VARS.map((name) => `${name}: ${computed.getPropertyValue(name).trim()}`).join('; ')

  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('xmlns', SVG_NS)
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = `svg { ${vars} }`
  root.appendChild(style)

  const ground = document.createElementNS(SVG_NS, 'rect')
  ground.setAttribute('width', String(width))
  ground.setAttribute('height', String(height))
  ground.setAttribute('fill', computed.getPropertyValue('--surface').trim() || '#ffffff')
  root.appendChild(ground)

  let x = PAD
  parts.forEach((part, i) => {
    const clone = part.cloneNode(true) as SVGSVGElement
    // The on-screen copy is sized by CSS for the zoom; the file wants its own size.
    clone.removeAttribute('class')
    clone.removeAttribute('style')
    clone.setAttribute('x', String(x))
    clone.setAttribute('y', String(PAD))
    clone.setAttribute('width', String(sizes[i].w))
    clone.setAttribute('height', String(sizes[i].h))
    root.appendChild(clone)
    x += sizes[i].w + GAP
  })

  return { markup: new XMLSerializer().serializeToString(root), width, height }
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function rasterise(markup: string, width: number, height: number, format: 'png' | 'jpg'): Promise<Blob> {
  const scale = Math.min(RASTER_SCALE, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('This browser did not give us a canvas to draw the image on.'))
        return
      }
      // JPG has no transparency; the drawing paints its own ground, but a white
      // floor guarantees no black corners if a part leaves any gap.
      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
        format === 'png' ? 'image/png' : 'image/jpeg',
        0.92,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The diagram could not be rendered to an image.'))
    }
    img.src = url
  })
}

export async function downloadDiagram(
  parts: Array<SVGSVGElement | null>,
  format: ExportFormat,
  baseName: string,
): Promise<void> {
  const present = parts.filter((p): p is SVGSVGElement => p !== null)
  if (!present.length) return
  const { markup, width, height } = composeSvg(present)
  if (format === 'svg') {
    save(new Blob([markup], { type: 'image/svg+xml' }), `${baseName}.svg`)
    return
  }
  save(await rasterise(markup, width, height, format), `${baseName}.${format}`)
}
