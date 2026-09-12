import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
} from 'lucide-react'
import { useState, type ComponentType } from 'react'
import type { BandAxis, Frame, Grid, Motion } from '../types'
import { bandOptions, bandSpan } from '../lib/grid'
import { playedFrames } from '../lib/codegen/designs'
import { engineNeeds, formatStep, makeStep } from '../lib/codegen/loop'
import {
  baseSpeedMs,
  clampFactor,
  clampMs,
  FACTOR_MAX,
  FACTOR_MIN,
  formatFactor,
  frameSpeedMs,
  frameStepMs,
  SPEED_MS_MAX,
  SPEED_MS_MIN,
  SPEED_PRESETS,
} from '../lib/speed'
import { useFrameActions, useProject } from '../state/useProject'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Props = { frame: Frame; grid: Grid }

const DIRECTIONS: Array<{
  icon: ComponentType<{ className?: string }> | null
  title: string
  updown: -1 | 0 | 1
  leftright: -1 | 0 | 1
}> = [
  { icon: ArrowUpLeft, title: 'Up + left', updown: 1, leftright: -1 },
  { icon: ArrowUp, title: 'Up', updown: 1, leftright: 0 },
  { icon: ArrowUpRight, title: 'Up + right', updown: 1, leftright: 1 },
  { icon: ArrowLeft, title: 'Left', updown: 0, leftright: -1 },
  { icon: null, title: 'No movement', updown: 0, leftright: 0 },
  { icon: ArrowRight, title: 'Right', updown: 0, leftright: 1 },
  { icon: ArrowDownLeft, title: 'Down + left', updown: -1, leftright: -1 },
  { icon: ArrowDown, title: 'Down', updown: -1, leftright: 0 },
  { icon: ArrowDownRight, title: 'Down + right', updown: -1, leftright: 1 },
]

export function MotionControls({ frame, grid }: Props) {
  const { project } = useProject()
  const { update } = useFrameActions(frame.id)
  const { motion } = frame
  // Horizontal bands stripe the rows, vertical ones the columns, so each axis
  // has its own set of counts that divide evenly.
  const rowBands = bandOptions(grid.rows)
  const colBands = bandOptions(grid.cols)
  const bands = motion.kind === 'band' ? bandOptions(bandSpan(grid, motion.axis)) : rowBands
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
  const [draftFactor, setDraftFactor] = useState(String(factor))
  const [draftOf, setDraftOf] = useState(frame)
  if (draftOf !== frame) {
    setDraftOf(frame)
    setDraftMs(String(frame.speedMs ?? base))
    setDraftFactor(String(factor))
  }
  const commitMs = () => {
    if (draftMs.trim() === '' || !Number.isFinite(Number(draftMs))) {
      return setDraftMs(String(frame.speedMs ?? base))
    }
    update({ speedMs: clampMs(Number(draftMs)) })
  }
  // Snapped to the sixteenths the sketch carries, so the field shows back the
  // factor that will actually play rather than the one typed.
  const commitFactor = () => {
    const typed = Number(draftFactor.replace(/x$/i, ''))
    if (draftFactor.trim() === '' || !Number.isFinite(typed) || typed <= 0) {
      return setDraftFactor(String(factor))
    }
    const next = clampFactor(typed)
    setDraftFactor(String(next))
    if (next !== factor) update({ speedFactor: next })
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
      const axis: BandAxis = rowBands.length > 0 ? 'horizontal' : 'vertical'
      const n = bandOptions(bandSpan(grid, axis))[0] ?? 2
      update({
        motion: {
          kind: 'band',
          axis,
          directions: Array.from({ length: n }, (_, i) => i % 2 === 1),
          steps: 32,
        },
      })
    }
  }

  /**
   * Turning the split a quarter turn keeps the band count when the other side
   * of the panel divides by it too, and otherwise takes that side's smallest.
   */
  const setAxis = (axis: BandAxis) => {
    if (motion.kind !== 'band' || axis === motion.axis) return
    const options = bandOptions(bandSpan(grid, axis))
    const count = motion.directions.length
    const n = options.includes(count) ? count : (options[0] ?? count)
    update({
      motion: {
        kind: 'band',
        axis,
        steps: motion.steps,
        directions: Array.from({ length: n }, (_, i) => motion.kind === 'band' && !!motion.directions[i]),
      },
    })
  }

  const setSteps = (steps: number) => update({ motion: { ...motion, steps: Math.max(1, steps) } })

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h3 className="m-0 text-sm font-semibold">Movement</h3>

      <ToggleGroup
        type="single"
        variant="outline"
        value={motion.kind}
        onValueChange={(v) => v && setKind(v as Motion['kind'])}
      >
        <ToggleGroupItem value="scroll">Scroll</ToggleGroupItem>
        <ToggleGroupItem value="static">Hold</ToggleGroupItem>
        <ToggleGroupItem
          value="band"
          disabled={rowBands.length === 0 && colBands.length === 0}
          title={
            rowBands.length === 0 && colBands.length === 0
              ? 'Needs a row or column count divisible into bands'
              : 'Split the panel into bands that move independently'
          }
        >
          Bands
        </ToggleGroupItem>
      </ToggleGroup>

      {motion.kind === 'scroll' && (
        <>
          <div className="grid w-fit grid-cols-3 gap-1">
            {DIRECTIONS.map((d) => {
              const active = motion.updown === d.updown && motion.leftright === d.leftright
              const Icon = d.icon
              return (
                <Button
                  key={d.title}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="icon"
                  title={d.title}
                  aria-label={d.title}
                  onClick={() => update({ motion: { ...motion, updown: d.updown, leftright: d.leftright } })}
                >
                  {Icon ? <Icon /> : <span className="block size-1.5 rounded-full bg-current" />}
                </Button>
              )
            })}
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5">{call}</code>
          </p>
          {mirrorIgnored && (
            <p className="m-0 text-xs leading-relaxed text-warn">
              Mirroring is ignored here: a half-width panel reflects each row as it is fed in, so it
              only applies to vertical scrolls. Add an up or down component, or switch to Hold.
            </p>
          )}
          <Label className="items-start text-sm font-normal">
            <Checkbox
              className="mt-0.5"
              checked={frame.preload}
              onCheckedChange={(checked) => update({ preload: checked === true })}
              aria-label="Fill panel before scrolling"
            />
            <span>
              Fill panel before scrolling{' '}
              <code className="rounded bg-muted px-1 py-0.5">FLAG_PRELOAD</code>
            </span>
          </Label>
        </>
      )}

      {motion.kind === 'band' && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Split
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={motion.axis}
              onValueChange={(v) => v && setAxis(v as BandAxis)}
            >
              <ToggleGroupItem
                value="horizontal"
                disabled={rowBands.length === 0}
                title="Stripes of rows, each sliding left or right"
              >
                Rows ←→
              </ToggleGroupItem>
              <ToggleGroupItem
                value="vertical"
                disabled={colBands.length === 0}
                title="Stripes of columns, each sliding up or down"
              >
                Columns ↑↓
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Bands
            </span>
            <Select
              value={String(motion.directions.length)}
              onValueChange={(v) => {
                const n = Number(v)
                update({
                  motion: {
                    kind: 'band',
                    axis: motion.axis,
                    steps: motion.steps,
                    directions: Array.from({ length: n }, (_, i) => !!motion.directions[i]),
                  },
                })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bands.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} bands of {bandSpan(grid, motion.axis) / n}{' '}
                    {motion.axis === 'vertical' ? 'columns' : 'rows'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex flex-col gap-1">
            {motion.directions.map((dir, i) => (
              <Button
                // eslint-disable-next-line react/no-array-index-key -- bands are positional
                key={i}
                type="button"
                variant="outline"
                className="h-auto justify-between gap-3 py-1.5 text-left"
                onClick={() => {
                  const directions = [...motion.directions]
                  directions[i] = !directions[i]
                  update({ motion: { ...motion, directions } })
                }}
              >
                <span className="text-muted-foreground">Band {i + 1}</span>
                <span>
                  {motion.axis === 'vertical'
                    ? dir
                      ? '↓ down'
                      : '↑ up'
                    : dir
                      ? '→ right'
                      : '← left'}
                </span>
              </Button>
            ))}
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5">{call}</code>
          </p>
        </>
      )}

      {motion.kind === 'static' && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Holds the pattern on screen for {motion.steps} steps without shifting it.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
          Steps
        </span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            min={1}
            value={motion.steps}
            onChange={(e) => setSteps(Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">
            {motion.kind === 'static' ? 'steps held' : 'shifts played'}, not a delay
          </span>
        </div>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Step speed
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={pinned ? 'fixed' : 'base'}
              onValueChange={(v) => {
                if (!v) return
                if (v === 'base') update({ speedMs: null })
                // The factor is left alone, so releasing the pin restores it.
                else update({ speedMs: frameSpeedMs(base, factor) })
              }}
            >
              <ToggleGroupItem value="base">Follow base</ToggleGroupItem>
              <ToggleGroupItem value="fixed">Fixed ms</ToggleGroupItem>
            </ToggleGroup>

            {pinned ? (
              <Input
                type="number"
                className="w-24"
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
              <span className="text-sm text-muted-foreground">
                = <strong className="text-foreground">{frameStepMs(base, frame)} ms</strong> per step
              </span>
            )}
          </div>
        </div>
        {!pinned && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="flex-wrap"
              value={String(factor)}
              onValueChange={(v) => v && update({ speedFactor: Number(v) })}
            >
              {SPEED_PRESETS.map((preset) => (
                <ToggleGroupItem
                  key={preset.label}
                  value={String(preset.factor)}
                  title={`${frameSpeedMs(base, preset.factor)} ms per step at the current base`}
                >
                  {preset.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              Custom
              <Input
                type="number"
                className="h-8 w-20"
                min={FACTOR_MIN}
                max={FACTOR_MAX}
                step={1 / 16}
                aria-label="Custom speed factor"
                title={`Any multiple from ${formatFactor(FACTOR_MIN)} to ${formatFactor(FACTOR_MAX)}, in sixteenths`}
                value={draftFactor}
                onChange={(e) => setDraftFactor(e.target.value)}
                onBlur={commitFactor}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              x
            </label>
          </div>
        )}
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
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
