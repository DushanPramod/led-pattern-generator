import { Box, ExternalLink, Moon, PanelRightClose, Pause, Play, Square, Sun } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { DEFAULT_LED_COLOR, mix, unlit } from '../lib/colors'
import { ledLayout } from '../lib/layout'
import { renderTimeline } from '../lib/simulate'
import { baseSpeedMs } from '../lib/speed'
import { useProject } from '../state/useProject'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// three.js is only downloaded once someone actually opens the 3D view.
const Preview3D = lazy(() => import('./Preview3D'))

/** Keeps a failed 3D download (offline, stale deploy) from taking the page down. */
class Load3DBoundary extends Component<{ className: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p className={`m-0 flex ${this.props.className} items-center justify-center p-6 text-center text-sm text-muted-foreground`}>
        The 3D preview could not be loaded. Check your connection and reload, or switch back to 2D.
      </p>
    ) : (
      this.props.children
    )
  }
}

const SCREEN_BG = '#07090d'
/** A mid grey: lighter than the screen, but pale LEDs still stand out on it. */
const LIGHT_BG = '#8b9098'

/** Colours the board is drawn with for each backdrop. */
function screen(light: boolean) {
  return light
    ? { bg: LIGHT_BG, rim: '#6c717a', off: (led: string) => mix(led, LIGHT_BG, 0.78), edge: 'rgba(0,0,0,0.35)' }
    : { bg: SCREEN_BG, rim: '#1d2532', off: (led: string) => unlit(led, SCREEN_BG), edge: null }
}

// How the panel is being looked at, as opposed to what it plays. The preview
// unmounts whenever another tab is open, so this is held by the workspace and
// handed back in: coming back from the code tab keeps the shape you picked.
export type PreviewView = {
  shape: 'flat' | 'round' | 'fan'
  dimension: '2d' | '3d'
  sweep: number
  rimFirst: boolean
  soloFrame: boolean
  /** Draw the board on a light backdrop instead of the dark screen. */
  light: boolean
}

export function Preview({
  view,
  onView,
  popout = false,
  onPopout,
  onDock,
}: {
  view: PreviewView
  onView: (view: PreviewView) => void
  /** Drawn in its own window: the board grows to fill it. */
  popout?: boolean
  onPopout?: () => void
  onDock?: () => void
}) {
  const { project, selectedFrame } = useProject()
  const { grid, rowColors } = project
  // Every step in the preview is a multiple of this, so the timeline is rebuilt
  // whenever the controller is moved or the fixed delay is retyped.
  const base = baseSpeedMs(project.speed)
  const sectionRef = useRef<HTMLElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const [rawStep, setStep] = useState(0)
  // Room the board has to fill in a pop-out window, in CSS pixels.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const { shape, dimension, sweep, rimFirst, soloFrame, light } = view
  const look = screen(light)
  const set = <K extends keyof PreviewView>(key: K, value: PreviewView[K]) =>
    onView({ ...view, [key]: value })

  const steps = useMemo(() => {
    if (soloFrame && selectedFrame) {
      const solo = [{ id: 'solo', repeat: 1, frameIds: [selectedFrame.id] }]
      return renderTimeline(project.frames, solo, grid, base)
    }
    return renderTimeline(project.frames, project.groups, grid, base)
  }, [project.frames, project.groups, grid, base, soloFrame, selectedFrame])

  // Where each LED sits on the board, shared by the 2D and 3D views.
  const layout = useMemo(() => ledLayout(grid, shape, sweep, rimFirst), [grid, shape, sweep, rimFirst])

  // Derived during render so a shrinking timeline never leaves the scrub past the end.
  const step = steps.length === 0 ? 0 : Math.min(rawStep, steps.length - 1)

  // In a pop-out the board may be the only thing on screen, so it measures
  // the space it has. The window's own observer keeps up when the main one
  // is in the background.
  useEffect(() => {
    const el = boardRef.current
    if (!popout || !el) return
    const win = el.ownerDocument.defaultView ?? window
    const observer = new win.ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ w: Math.floor(width), h: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [popout, dimension])

  useEffect(() => {
    if (!playing || steps.length === 0) return
    // Animate on the window the preview is shown in, which keeps running
    // when the main window is minimised.
    const win = sectionRef.current?.ownerDocument.defaultView ?? window
    let raf = 0
    // rAF timestamps count from that window's own time origin.
    let last = win.performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += now - last
      last = now
      setStep((current) => {
        let next = current
        let budget = acc
        for (;;) {
          const delay = Math.max(1, (steps[next % steps.length]?.delay ?? 50))
          if (budget < delay) break
          budget -= delay
          next = (next + 1) % steps.length
        }
        acc = budget
        return next
      })
      raf = win.requestAnimationFrame(tick)
    }
    raf = win.requestAnimationFrame(tick)
    return () => win.cancelAnimationFrame(raf)
  }, [playing, steps])

  // Round and fan modes: the board as the layout places it, every column a
  // spoke and every row a ring.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || shape === 'flat' || dimension === '3d') return
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio || 1
    const size = popout && box ? Math.max(120, Math.min(box.w, box.h)) : 420
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { bg, rim, off: offOf, edge } = screen(light)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const outer = size / 2 - 8
    const dot = Math.max(1, layout.pitch * outer * 0.42)
    const frameCells = steps[step]?.cells

    ctx.strokeStyle = rim
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, outer + 4, 0, Math.PI * 2)
    ctx.stroke()

    for (let r = 0; r < grid.rows; r++) {
      // The colour belongs to the LEDs on that row, so it follows the row
      // wherever rimFirst puts the ring.
      const led = rowColors[r] ?? DEFAULT_LED_COLOR
      const off = offOf(led)
      for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c
        const x = cx + layout.positions[i * 2] * outer
        const y = cy + layout.positions[i * 2 + 1] * outer
        const on = frameCells?.[i]
        ctx.fillStyle = on ? led : off
        ctx.beginPath()
        ctx.arc(x, y, on ? dot : dot * 0.6, 0, Math.PI * 2)
        ctx.fill()
        // A thin outline keeps pale lit LEDs (white, yellow) visible on the light backdrop.
        if (on && edge) {
          ctx.strokeStyle = edge
          ctx.lineWidth = 0.75
          ctx.stroke()
        }
      }
    }
  }, [steps, step, grid, rowColors, shape, dimension, layout, light, popout, box])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || shape !== 'flat' || dimension === '3d') return
    const cell =
      popout && box
        ? Math.max(3, Math.floor(Math.min(box.w / grid.cols, box.h / grid.rows)))
        : Math.max(3, Math.min(12, Math.floor(560 / grid.cols)))
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio || 1
    const w = grid.cols * cell
    const h = grid.rows * cell
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { bg, off: offOf, edge } = screen(light)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const frameCells = steps[step]?.cells
    const radius = Math.max(1, cell / 2 - 0.8)
    for (let r = 0; r < grid.rows; r++) {
      const led = rowColors[r] ?? DEFAULT_LED_COLOR
      const off = offOf(led)
      for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c
        const on = frameCells?.[i]
        ctx.fillStyle = on ? led : off
        ctx.beginPath()
        ctx.arc(
          w / 2 + layout.positions[i * 2] * cell,
          h / 2 + layout.positions[i * 2 + 1] * cell,
          on ? radius : radius * 0.6,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        if (on && edge && radius >= 2) {
          ctx.strokeStyle = edge
          ctx.lineWidth = 0.75
          ctx.stroke()
        }
      }
    }
  }, [steps, step, grid, rowColors, shape, dimension, layout, light, popout, box])

  const current = steps[step]
  // The preview always plays at the speed set under Movement, so this is the
  // step's real hold time on the panel.
  const shownDelay = Math.max(1, Math.round(current?.delay ?? 0))
  const boardHeight = popout ? 'h-full' : 'h-[460px]'

  return (
    <section
      ref={sectionRef}
      className={cn(
        'flex flex-col gap-3 bg-card p-4',
        popout ? 'h-screen' : 'rounded-xl border',
      )}
    >
      {dimension === '3d' ? (
        <div
          className={cn('overflow-hidden rounded-lg border', popout && 'min-h-0 flex-1')}
          style={{ background: look.bg }}
        >
          <Load3DBoundary className={boardHeight}>
            <Suspense
              fallback={
                <p className={`m-0 flex ${boardHeight} items-center justify-center text-sm text-muted-foreground`}>
                  Loading 3D…
                </p>
              }
            >
              <Preview3D
                className={boardHeight}
                grid={grid}
                rowColors={rowColors}
                cells={current?.cells}
                layout={layout}
                shape={shape}
                background={look.bg}
              />
            </Suspense>
          </Load3DBoundary>
        </div>
      ) : (
        <div
          ref={boardRef}
          className={cn(
            'flex justify-center rounded-lg border p-3',
            popout ? 'min-h-0 min-w-0 flex-1 items-center overflow-hidden' : 'overflow-x-auto',
          )}
          style={{ background: look.bg }}
        >
          <canvas ref={canvasRef} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
        </Button>
        <Label className="text-sm font-normal">
          <Checkbox
            checked={soloFrame}
            onCheckedChange={(checked) => set('soloFrame', checked === true)}
            aria-label="This frame only"
          />
          This frame only
        </Label>
        <Button
          type="button"
          variant="outline"
          aria-pressed={light}
          title={light ? 'Switch to a dark backdrop' : 'Switch to a gray backdrop'}
          onClick={() => set('light', !light)}
        >
          {light ? <Moon /> : <Sun />} {light ? 'Dark' : 'Gray'}
        </Button>
        {popout ? (
          onDock && (
            <Button type="button" variant="outline" title="Put the preview back in the sidebar" onClick={onDock}>
              <PanelRightClose /> Dock
            </Button>
          )
        ) : (
          onPopout && (
            <Button
              type="button"
              variant="outline"
              title="Open the preview in its own window, to move to another screen"
              onClick={onPopout}
            >
              <ExternalLink /> Pop out
            </Button>
          )
        )}
        <span className="flex-1" />
        {/* How it is drawn and what board it is drawn on are separate choices,
            so each gets its own label and the view is one joined switch. */}
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            View
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-label="View"
            value={dimension}
            onValueChange={(v) => v && set('dimension', v as PreviewView['dimension'])}
          >
            <ToggleGroupItem value="2d" aria-label="2D view">
              <Square /> 2D
            </ToggleGroupItem>
            <ToggleGroupItem value="3d" aria-label="3D view">
              <Box /> 3D
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Shape
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Board shape"
            value={shape}
            onValueChange={(v) => v && set('shape', v as PreviewView['shape'])}
          >
            <ToggleGroupItem value="flat">Flat</ToggleGroupItem>
            <ToggleGroupItem value="round">Round</ToggleGroupItem>
            <ToggleGroupItem value="fan">Fan</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {shape !== 'flat' && (
        <div className="flex flex-wrap items-center gap-3">
          {shape === 'fan' && (
            <label className="flex items-center gap-1.5">
              <span className="whitespace-nowrap text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Sweep
              </span>
              <Select value={String(sweep)} onValueChange={(v) => set('sweep', Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                    <SelectItem key={deg} value={String(deg)}>
                      {deg}°
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          <Label className="text-sm font-normal">
            <Checkbox
              checked={rimFirst}
              onCheckedChange={(checked) => set('rimFirst', checked === true)}
              aria-label="Row 1 at the rim (strips wired inwards)"
            />
            Row 1 at the rim (strips wired inwards)
          </Label>
        </div>
      )}

      <Slider
        className="py-1.5"
        min={0}
        max={Math.max(0, steps.length - 1)}
        value={[step]}
        onValueChange={([v]) => {
          setPlaying(false)
          setStep(v)
        }}
      />

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {steps.length === 0
          ? 'Add a frame to the timeline to preview it.'
          : `Step ${step + 1} / ${steps.length} · ${current?.frameName ?? ''} · ${shownDelay} ms per step`}
      </p>
      {/* The pop-out gives its height to the board rather than the explanations. */}
      {dimension === '3d' && !popout && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Drag to orbit, scroll to zoom. LEDs fade in and out the way a real lens glows.
        </p>
      )}
      {shape !== 'flat' && !popout && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          The {grid.rows} x {grid.cols} panel wrapped into {shape === 'round' ? 'a disc' : 'a fan'}:{' '}
          {grid.cols} spokes of {grid.rows} LEDs each,{' '}
          {shape === 'round'
            ? 'column 1 pointing up and the rest running clockwise'
            : `spread over ${sweep}° and centred on the top, so the last ${360 - sweep}° stay dark at the bottom`}
          . The sketch is unchanged — this is only how the same rows and columns land on the board.
        </p>
      )}
    </section>
  )
}
