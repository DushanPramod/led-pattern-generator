import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Frame, Grid } from '../types'
import { DEFAULT_LED_COLOR, mix, unlit, withAlpha } from '../lib/colors'
import { regionOf } from '../lib/grid'
import { panelView } from '../lib/simulate'

type Props = {
  frame: Frame
  grid: Grid
  /** Colour of the LEDs on each row; the canvas draws the board, not just bits. */
  rowColors: string[]
  onCells: (cells: Uint8Array, coalesce: boolean) => void
}

const CANVAS_BG = '#0b0f16'

const MIN_CELL = 7
const MAX_CELL = 30

/** Bresenham, so a fast drag doesn't leave gaps between sampled pointer positions. */
function line(r0: number, c0: number, r1: number, c1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const dr = Math.abs(r1 - r0)
  const dc = Math.abs(c1 - c0)
  const sr = r0 < r1 ? 1 : -1
  const sc = c0 < c1 ? 1 : -1
  let err = dc - dr
  let r = r0
  let c = c0
  for (;;) {
    points.push([r, c])
    if (r === r1 && c === c1) break
    const e2 = 2 * err
    if (e2 > -dr) {
      err -= dr
      c += sc
    }
    if (e2 < dc) {
      err += dc
      r += sr
    }
  }
  return points
}

export function FrameCanvas({ frame, grid, rowColors, onCells }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(16)
  const stroke = useRef<{ value: number; last: [number, number] | null } | null>(null)
  const region = regionOf(frame, grid)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const fit = () => {
      const available = wrap.clientWidth - 2
      setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(available / grid.cols))))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [grid.cols])

  // Draw: lit tile cells bright, the tiled/mirrored result dimmed, region outlined.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = grid.cols * cell
    const h = grid.rows * cell
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = CANVAS_BG
    ctx.fillRect(0, 0, w, h)

    // panelView is what fillPanelFromPattern() puts on the panel, tiling and mirroring included.
    const result = panelView(frame, grid)
    const radius = Math.max(1, cell / 2 - 1.5)

    for (let r = 0; r < grid.rows; r++) {
      // Pixels outside the authored region are generated, so they are dimmed —
      // the row's own colour, pushed most of the way back into the background.
      const led = rowColors[r] ?? DEFAULT_LED_COLOR
      const lit = { in: led, out: mix(led, CANVAS_BG, 0.62) }
      const dark = { in: unlit(led, CANVAS_BG), out: unlit(led, CANVAS_BG, 0.05) }
      const core = withAlpha(mix(led, '#ffffff', 0.55), 0.55)

      for (let c = 0; c < grid.cols; c++) {
        const inRegion = r < region.rows && c < region.cols
        const on = result[r * grid.cols + c]
        const x = c * cell + cell / 2
        const y = r * cell + cell / 2

        if (on) {
          ctx.fillStyle = inRegion ? lit.in : lit.out
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
          if (inRegion && cell > 9) {
            ctx.fillStyle = core
            ctx.beginPath()
            ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2)
            ctx.fill()
          }
        } else {
          ctx.fillStyle = inRegion ? dark.in : dark.out
          ctx.beginPath()
          ctx.arc(x, y, Math.max(1, radius * 0.75), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    if (region.rows < grid.rows || region.cols < grid.cols) {
      ctx.strokeStyle = '#4ea3ff'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(0.75, 0.75, region.cols * cell - 1.5, region.rows * cell - 1.5)
      ctx.setLineDash([])
    }
  }, [frame, grid, rowColors, cell, region.rows, region.cols])

  const cellAt = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
      const rect = event.currentTarget.getBoundingClientRect()
      const c = Math.floor((event.clientX - rect.left) / cell)
      const r = Math.floor((event.clientY - rect.top) / cell)
      if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return null
      return [r, c]
    },
    [cell, grid.rows, grid.cols],
  )

  const paint = useCallback(
    (points: Array<[number, number]>, value: number, coalesce: boolean) => {
      const next = frame.cells.slice()
      let changed = false
      for (const [r, c] of points) {
        // Only the tile region is authored; loadPattern() repeats it across the rest.
        if (r >= region.rows || c >= region.cols) continue
        const i = r * grid.cols + c
        if (next[i] !== value) {
          next[i] = value
          changed = true
        }
      }
      if (changed) onCells(next, coalesce)
    },
    [frame.cells, grid.cols, onCells, region.rows, region.cols],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const at = cellAt(event)
    if (!at) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const [r, c] = at
    const current = frame.cells[r * grid.cols + c]
    const value = event.button === 2 || event.ctrlKey ? 0 : current ? 0 : 1
    stroke.current = { value, last: at }
    paint([at], value, false)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current) return
    const at = cellAt(event)
    if (!at) return
    const { last, value } = stroke.current
    const points = last ? line(last[0], last[1], at[0], at[1]) : [at]
    stroke.current.last = at
    paint(points, value, true)
  }

  const endStroke = () => {
    stroke.current = null
  }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="led-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(e) => e.preventDefault()}
      />
      <p className="canvas-hint">
        Drag to draw · right-click or ctrl-drag to erase
        {region.rows < grid.rows || region.cols < grid.cols
          ? ` · only the ${region.rows}x${region.cols} region is editable, the rest is generated${
              grid.halfWidth ? ' and mirrored across the panel' : ' by loadPattern()'
            }`
          : ''}
      </p>
    </div>
  )
}
