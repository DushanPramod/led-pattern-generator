import type { Frame, Grid, Motion } from '../types'
import { bandOptions } from '../lib/grid'
import { formatStep, makeStep } from '../lib/codegen/loop'
import { useFrameActions, useProject } from '../state/useProject'

type Props = { frame: Frame; grid: Grid }

const DIRECTIONS: Array<{ label: string; title: string; updown: -1 | 0 | 1; leftright: -1 | 0 | 1 }> = [
  { label: '↖', title: 'Up + left', updown: 1, leftright: -1 },
  { label: '↑', title: 'Up', updown: 1, leftright: 0 },
  { label: '↗', title: 'Up + right', updown: 1, leftright: 1 },
  { label: '←', title: 'Left', updown: 0, leftright: -1 },
  { label: '·', title: 'No movement', updown: 0, leftright: 0 },
  { label: '→', title: 'Right', updown: 0, leftright: 1 },
  { label: '↙', title: 'Down + left', updown: -1, leftright: -1 },
  { label: '↓', title: 'Down', updown: -1, leftright: 0 },
  { label: '↘', title: 'Down + right', updown: -1, leftright: 1 },
]

export function MotionControls({ frame, grid }: Props) {
  const { project } = useProject()
  const { update } = useFrameActions(frame.id)
  const { motion } = frame
  const bands = bandOptions(grid.rows)
  // Built by the generator itself, so the preview can never drift from the output.
  const call = formatStep(makeStep(frame, grid, 'PATTERN'))
  const mirrorIgnored =
    !!grid.halfWidth &&
    frame.mirror &&
    motion.kind === 'scroll' &&
    motion.updown === 0

  const setKind = (kind: Motion['kind']) => {
    if (kind === motion.kind) return
    if (kind === 'static') update({ motion: { kind: 'static', steps: 40 } })
    else if (kind === 'scroll')
      update({ motion: { kind: 'scroll', updown: 1, leftright: 0, steps: grid.rows } })
    else {
      const n = bands[0] ?? 2
      update({
        motion: { kind: 'band', directions: Array.from({ length: n }, (_, i) => i % 2 === 1), steps: 32 },
      })
    }
  }

  const setSteps = (steps: number) => update({ motion: { ...motion, steps: Math.max(1, steps) } })

  return (
    <section className="panel">
      <h3>Movement</h3>

      <div className="seg">
        <button type="button" className={motion.kind === 'scroll' ? 'on' : ''} onClick={() => setKind('scroll')}>
          Scroll
        </button>
        <button type="button" className={motion.kind === 'static' ? 'on' : ''} onClick={() => setKind('static')}>
          Hold
        </button>
        <button
          type="button"
          className={motion.kind === 'band' ? 'on' : ''}
          onClick={() => setKind('band')}
          disabled={bands.length === 0}
          title={bands.length === 0 ? 'Needs a row count divisible into bands' : 'Split rows into bands'}
        >
          Bands
        </button>
      </div>

      {motion.kind === 'scroll' && (
        <>
          <div className="dirpad">
            {DIRECTIONS.map((d) => (
              <button
                key={d.title}
                type="button"
                title={d.title}
                className={motion.updown === d.updown && motion.leftright === d.leftright ? 'on' : ''}
                onClick={() => update({ motion: { ...motion, updown: d.updown, leftright: d.leftright } })}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="note">
            <code>{call}</code>
          </p>
          {mirrorIgnored && (
            <p className="note warn">
              Mirroring is ignored here: a half-width panel reflects each row as it is fed in, so it
              only applies to vertical scrolls. Add an up or down component, or switch to Hold.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={frame.preload}
              onChange={(e) => update({ preload: e.target.checked })}
            />
            <span>
              Fill panel before scrolling <code>FLAG_PRELOAD</code>
            </span>
          </label>
        </>
      )}

      {motion.kind === 'band' && (
        <>
          <label className="field small">
            <span>Bands</span>
            <select
              value={motion.directions.length}
              onChange={(e) => {
                const n = Number(e.target.value)
                update({
                  motion: {
                    kind: 'band',
                    steps: motion.steps,
                    directions: Array.from({ length: n }, (_, i) => !!motion.directions[i]),
                  },
                })
              }}
            >
              {bands.map((n) => (
                <option key={n} value={n}>
                  {n} bands of {grid.rows / n} rows
                </option>
              ))}
            </select>
          </label>
          <div className="bandlist">
            {motion.directions.map((dir, i) => (
              <button
                // eslint-disable-next-line react/no-array-index-key -- bands are positional
                key={i}
                type="button"
                className="band"
                onClick={() => {
                  const directions = [...motion.directions]
                  directions[i] = !directions[i]
                  update({ motion: { ...motion, directions } })
                }}
              >
                <span className="band-label">Band {i + 1}</span>
                <span className="band-dir">{dir ? '→ right' : '← left'}</span>
              </button>
            ))}
          </div>
          <p className="note">
            <code>{call}</code>
          </p>
        </>
      )}

      {motion.kind === 'static' && (
        <p className="note">
          Holds the pattern on screen for {motion.steps} steps without shifting it.
        </p>
      )}

      <div className="row">
        <label className="field small">
          <span>Steps</span>
          <input
            type="number"
            min={1}
            value={motion.steps}
            onChange={(e) => setSteps(Number(e.target.value))}
          />
        </label>
        <label className="field small">
          <span>Speed (ms/step)</span>
          <input
            type="number"
            min={1}
            placeholder={`f = ${project.hardware.defaultSpeed}`}
            value={frame.speed ?? ''}
            onChange={(e) =>
              update({ speed: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })
            }
          />
        </label>
        <p className="note span">
          Leave speed empty to follow the global <code>f</code>
          {project.hardware.useSpeedPot ? ` (live from the ${project.hardware.speedPin} pot)` : ''}.
        </p>
      </div>
    </section>
  )
}
