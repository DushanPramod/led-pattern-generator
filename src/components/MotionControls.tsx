import { useState } from 'react'
import type { Frame, Grid, Motion } from '../types'
import { bandOptions } from '../lib/grid'
import { playedFrames } from '../lib/codegen/designs'
import { engineNeeds, formatStep, makeStep } from '../lib/codegen/loop'
import {
  baseSpeedMs,
  clampFactor,
  clampMs,
  formatFactor,
  frameSpeedMs,
  frameStepMs,
  SPEED_MS_MAX,
  SPEED_MS_MIN,
  SPEED_PRESETS,
} from '../lib/speed'
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
  const base = baseSpeedMs(project.speed)
  const factor = clampFactor(frame.speedFactor)
  const pinned = frame.speedMs !== null
  // Built by the generator itself, so the preview can never drift from the
  // output — including which speed columns the table carries, which depends on
  // what the rest of the timeline does, not on this frame alone.
  const needs = engineNeeds(playedFrames(project.frames, project.groups), grid, project.groups)
  const call = formatStep(makeStep(frame, grid, 'PATTERN'), needs)

  // Typed like the panel sizes: committed on blur or Enter, so a half-typed
  // number is never read and one edit is one undo entry.
  const [draftMs, setDraftMs] = useState(String(frame.speedMs ?? base))
  const [draftOf, setDraftOf] = useState(frame)
  if (draftOf !== frame) {
    setDraftOf(frame)
    setDraftMs(String(frame.speedMs ?? base))
  }
  const commitMs = () => {
    if (draftMs.trim() === '' || !Number.isFinite(Number(draftMs))) {
      return setDraftMs(String(frame.speedMs ?? base))
    }
    update({ speedMs: clampMs(Number(draftMs)) })
  }
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
        <div className="field grow">
          <span>Step speed</span>
          <div className="speed-modes">
            <div className="seg">
              <button
                type="button"
                className={pinned ? '' : 'on'}
                onClick={() => update({ speedMs: null })}
              >
                Follow base
              </button>
              <button
                type="button"
                className={pinned ? 'on' : ''}
                // The factor is left alone, so releasing the pin restores it.
                onClick={() => update({ speedMs: frameSpeedMs(base, factor) })}
              >
                Fixed ms
              </button>
            </div>

            {pinned ? (
              <input
                type="number"
                className="ms"
                min={SPEED_MS_MIN}
                max={SPEED_MS_MAX}
                value={draftMs}
                onChange={(e) => setDraftMs(e.target.value)}
                onBlur={commitMs}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            ) : (
              <div className="chips">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={preset.factor === factor ? 'chip on' : 'chip'}
                    onClick={() => update({ speedFactor: preset.factor })}
                    title={`${frameSpeedMs(base, preset.factor)} ms per step at the current base`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="note span">
          {pinned ? (
            <>
              Held for <strong>{frameStepMs(base, frame)} ms</strong> per step, fixed
              {project.speed.useController
                ? ` — this frame ignores the ${project.speed.pin} controller, so the knob will not
                   change it`
                : ', whatever the project base is set to'}
              .
            </>
          ) : (
            <>
              A multiple of the project's base speed, not a fixed time: at {formatFactor(factor)}{' '}
              this frame holds each step for <strong>{frameStepMs(base, frame)} ms</strong> against
              a base of {base} ms
              {project.speed.useController
                ? `, and follows the ${project.speed.pin} controller as it is turned`
                : ''}
              .
            </>
          )}
        </p>
      </div>
    </section>
  )
}
