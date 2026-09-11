import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LED_COLOR, unlit } from '../lib/colors'
import { renderTimeline } from '../lib/simulate'
import { useProject } from '../state/useProject'

const SCREEN_BG = '#07090d'
const MIN_DELAY = 1
const MAX_DELAY = 10000

const clampDelay = (ms: number) => Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(ms)))

export function Preview() {
  const { project, selectedFrame } = useProject()
  const { grid, hardware, rowColors } = project
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const [rate, setRate] = useState(1)
  // A manual delay overrides both the per-frame speed and the rate presets.
  // manualText keeps what is in the box so it can be cleared while typing,
  // while manualMs holds the last usable value the preview actually runs at.
  const [manualMs, setManualMs] = useState<number | null>(null)
  const [manualText, setManualText] = useState('')
  const [soloFrame, setSoloFrame] = useState(false)
  const [shape, setShape] = useState<'flat' | 'round' | 'fan'>('flat')
  const [sweep, setSweep] = useState(270)
  const [rimFirst, setRimFirst] = useState(false)
  const [rawStep, setStep] = useState(0)

  const steps = useMemo(() => {
    if (soloFrame && selectedFrame) {
      const solo = [{ id: 'solo', repeat: 1, frameIds: [selectedFrame.id] }]
      return renderTimeline(project.frames, solo, grid, hardware.defaultSpeed)
    }
    return renderTimeline(project.frames, project.groups, grid, hardware.defaultSpeed)
  }, [project.frames, project.groups, grid, hardware.defaultSpeed, soloFrame, selectedFrame])

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
          const delay =
            manualMs ?? Math.max(1, (steps[next % steps.length]?.delay ?? 50) / rate)
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
  }, [playing, rate, manualMs, steps])

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
  // What the preview is really waiting between steps, which is the frame's own
  // speed only when neither the manual box nor a rate preset is in play.
  const shownDelay = manualMs ?? Math.max(1, Math.round((current?.delay ?? 0) / rate))

  return (
    <section className="panel preview">
      <div className="preview-screen">
        <canvas ref={canvasRef} />
      </div>

      <div className="tools">
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <label className="check">
          <input type="checkbox" checked={soloFrame} onChange={(e) => setSoloFrame(e.target.checked)} />
          <span>This frame only</span>
        </label>
        <span className="spacer" />
        <div className="seg">
          <button
            type="button"
            className={shape === 'flat' ? 'on' : ''}
            onClick={() => setShape('flat')}
          >
            Flat
          </button>
          <button
            type="button"
            className={shape === 'round' ? 'on' : ''}
            onClick={() => setShape('round')}
          >
            Round
          </button>
          <button
            type="button"
            className={shape === 'fan' ? 'on' : ''}
            onClick={() => setShape('fan')}
          >
            Fan
          </button>
        </div>
        <label className="field small">
          <span>Speed</span>
          <select
            value={manualMs == null ? String(rate) : 'manual'}
            onChange={(e) => {
              if (e.target.value === 'manual') {
                // Start from whatever the preview is already running at, so
                // switching to manual doesn't jump the speed.
                const seed = clampDelay(Math.round((steps[step]?.delay ?? hardware.defaultSpeed) / rate))
                setManualMs(seed)
                setManualText(String(seed))
              } else {
                setManualMs(null)
                setManualText('')
                setRate(Number(e.target.value))
              }
            }}
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        {manualMs != null && (
          <label className="field small">
            <span>ms / step</span>
            <input
              type="number"
              min={MIN_DELAY}
              max={MAX_DELAY}
              step={5}
              value={manualText}
              onChange={(e) => {
                setManualText(e.target.value)
                const next = Number(e.target.value)
                // An empty or half-typed box keeps the last good delay running.
                if (e.target.value !== '' && Number.isFinite(next)) setManualMs(clampDelay(next))
              }}
              onBlur={() => setManualText(String(manualMs))}
            />
          </label>
        )}
      </div>

      {shape !== 'flat' && (
        <div className="row">
          {shape === 'fan' && (
            <label className="field small">
              <span>Sweep</span>
              <select value={sweep} onChange={(e) => setSweep(Number(e.target.value))}>
                {[120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                  <option key={deg} value={deg}>
                    {deg}°
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={rimFirst}
              onChange={(e) => setRimFirst(e.target.checked)}
            />
            <span>Row 1 at the rim (strips wired inwards)</span>
          </label>
        </div>
      )}

      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(0, steps.length - 1)}
        value={step}
        onChange={(e) => {
          setPlaying(false)
          setStep(Number(e.target.value))
        }}
      />

      <p className="note">
        {steps.length === 0
          ? 'Add a frame to the timeline to preview it.'
          : `Step ${step + 1} / ${steps.length} · ${current?.frameName ?? ''} · ${shownDelay} ms per step${
              manualMs != null
                ? ` (manual, sketch uses ${current?.delay ?? 0} ms)`
                : rate !== 1
                  ? ` (${current?.delay ?? 0} ms at 1x)`
                  : ''
            }`}
      </p>
      {shape !== 'flat' && (
        <p className="note">
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
