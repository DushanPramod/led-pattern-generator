import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LED_COLOR, unlit } from '../lib/colors'
import { renderTimeline } from '../lib/simulate'
import { baseSpeedMs } from '../lib/speed'
import { useProject } from '../state/useProject'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const SCREEN_BG = '#07090d'

// How the panel is being looked at, as opposed to what it plays. The preview
// unmounts whenever another tab is open, so this is held by the workspace and
// handed back in: coming back from the code tab keeps the shape you picked.
export type PreviewView = {
  shape: 'flat' | 'round' | 'fan'
  sweep: number
  rimFirst: boolean
  rate: number
  soloFrame: boolean
}

export function Preview({
  view,
  onView,
}: {
  view: PreviewView
  onView: (view: PreviewView) => void
}) {
  const { project, selectedFrame } = useProject()
  const { grid, rowColors } = project
  // Every step in the preview is a multiple of this, so the timeline is rebuilt
  // whenever the controller is moved or the fixed delay is retyped.
  const base = baseSpeedMs(project.speed)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const [rawStep, setStep] = useState(0)
  const { shape, sweep, rimFirst, rate, soloFrame } = view
  const set = <K extends keyof PreviewView>(key: K, value: PreviewView[K]) =>
    onView({ ...view, [key]: value })

  const steps = useMemo(() => {
    if (soloFrame && selectedFrame) {
      const solo = [{ id: 'solo', repeat: 1, frameIds: [selectedFrame.id] }]
      return renderTimeline(project.frames, solo, grid, base)
    }
    return renderTimeline(project.frames, project.groups, grid, base)
  }, [project.frames, project.groups, grid, base, soloFrame, selectedFrame])

  // Derived during render so a shrinking timeline never leaves the scrub past the end.
  const step = steps.length === 0 ? 0 : Math.min(rawStep, steps.length - 1)

  useEffect(() => {
    if (!playing || steps.length === 0) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += now - last
      last = now
      setStep((current) => {
        let next = current
        let budget = acc
        for (;;) {
          const delay = Math.max(1, (steps[next % steps.length]?.delay ?? 50) / rate)
          if (budget < delay) break
          budget -= delay
          next = (next + 1) % steps.length
        }
        acc = budget
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, rate, steps])

  // Round and fan modes: the panel is bent into a disc — every column becomes a
  // spoke and every row a ring, which is how the board is physically built. A
  // fan sweeps less than the full turn, leaving the usual gap at the bottom.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || shape === 'flat') return
    const dpr = window.devicePixelRatio || 1
    const size = 420
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = SCREEN_BG
    ctx.fillRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const outer = size / 2 - 8
    const arc = shape === 'round' ? Math.PI * 2 : (sweep * Math.PI) / 180
    /*
     * Every LED is the same size, as on the real board, so the hub hole has to
     * be wide enough for the innermost ring to hold all the spokes: solving
     * arc*inner/cols = (outer - inner)/rows for inner puts the gap along a
     * spoke and the gap between spokes at the same pitch. A narrower fan packs
     * the same spokes into less arc, so its hub opens up further.
     */
    const spread = grid.cols / (arc * grid.rows)
    const inner = Math.max(outer * 0.12, (outer * spread) / (1 + spread))
    const ring = (outer - inner) / grid.rows
    const pitch = Math.min(ring, (arc * inner) / grid.cols)
    const dot = Math.max(1, pitch * 0.42)
    // A full turn starts column 1 at the top; a fan is centred on the top, so
    // the unlit wedge lands at the bottom of the board.
    const start = shape === 'round' ? -Math.PI / 2 : -Math.PI / 2 - arc / 2
    const frameCells = steps[step]?.cells

    ctx.strokeStyle = '#1d2532'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, outer + 4, 0, Math.PI * 2)
    ctx.stroke()

    for (let r = 0; r < grid.rows; r++) {
      // Row 0 sits at the hub unless the board is wired the other way round.
      const ri = rimFirst ? grid.rows - 1 - r : r
      const radius = inner + (ri + 0.5) * ring
      // The colour belongs to the LEDs on that row, so it follows the row
      // wherever rimFirst puts the ring.
      const led = rowColors[r] ?? DEFAULT_LED_COLOR
      const off = unlit(led, SCREEN_BG)
      for (let c = 0; c < grid.cols; c++) {
        const angle = start + ((c + 0.5) / grid.cols) * arc
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius
        const on = frameCells?.[r * grid.cols + c]
        ctx.fillStyle = on ? led : off
        ctx.beginPath()
        ctx.arc(x, y, on ? dot : dot * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [steps, step, grid, rowColors, shape, sweep, rimFirst])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || shape !== 'flat') return
    const cell = Math.max(3, Math.min(12, Math.floor(560 / grid.cols)))
    const dpr = window.devicePixelRatio || 1
    const w = grid.cols * cell
    const h = grid.rows * cell
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = SCREEN_BG
    ctx.fillRect(0, 0, w, h)
    const frameCells = steps[step]?.cells
    const radius = Math.max(1, cell / 2 - 0.8)
    for (let r = 0; r < grid.rows; r++) {
      const led = rowColors[r] ?? DEFAULT_LED_COLOR
      const off = unlit(led, SCREEN_BG)
      for (let c = 0; c < grid.cols; c++) {
        const on = frameCells?.[r * grid.cols + c]
        ctx.fillStyle = on ? led : off
        ctx.beginPath()
        ctx.arc(c * cell + cell / 2, r * cell + cell / 2, on ? radius : radius * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [steps, step, grid, rowColors, shape])

  const current = steps[step]
  // What the preview is really waiting between steps. It is the step's real
  // hold time only at 1x playback: the playback rate is a viewing convenience
  // here and never reaches the sketch, unlike the frame's own speed factor.
  const shownDelay = Math.max(1, Math.round((current?.delay ?? 0) / rate))

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex justify-center overflow-x-auto rounded-lg border bg-[#07090d] p-3">
        <canvas ref={canvasRef} />
      </div>

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
        <span className="flex-1" />
        <ToggleGroup
          type="single"
          variant="outline"
          value={shape}
          onValueChange={(v) => v && set('shape', v as PreviewView['shape'])}
        >
          <ToggleGroupItem value="flat">Flat</ToggleGroupItem>
          <ToggleGroupItem value="round">Round</ToggleGroupItem>
          <ToggleGroupItem value="fan">Fan</ToggleGroupItem>
        </ToggleGroup>
        <label
          className="flex items-center gap-1.5"
          title="How fast this preview plays. The panel is unaffected — frame speed is set under Movement."
        >
          <span className="whitespace-nowrap text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Playback
          </span>
          <Select value={String(rate)} onValueChange={(v) => set('rate', Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
            </SelectContent>
          </Select>
        </label>
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
          : `Step ${step + 1} / ${steps.length} · ${current?.frameName ?? ''} · ${shownDelay} ms per step${
              rate !== 1 ? ` (${current?.delay ?? 0} ms on the panel)` : ''
            }`}
      </p>
      {shape !== 'flat' && (
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
