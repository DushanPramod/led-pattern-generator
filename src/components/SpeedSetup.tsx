import { useRef, useState } from 'react'
import { useProject } from '../state/useProject'
import {
  ADC_MAX,
  baseSpeedMs,
  clampMs,
  clampPosition,
  potMs,
  positionPercent,
  speedRange,
  SPEED_MS_MAX,
  SPEED_MS_MIN,
} from '../lib/speed'
import type { SpeedControl } from '../types'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

/** The analog pins an Arduino board offers. A Mega has more, but A0-A7 is common. */
const ANALOG_PINS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']

/** Every frame is a multiple of this, so it is the number worth showing large. */
function baseLine(speed: SpeedControl): string {
  const ms = baseSpeedMs(speed)
  return `${ms} ms per step · ${(1000 / ms).toFixed(1)} steps/sec`
}

/**
 * Where the project's speed comes from.
 *
 * This is a build decision before it is a timing one: a panel either has a
 * preset controller wired to an analog pin or it does not, and that changes
 * what the sketch contains, not just a number in it. So the choice sits at the
 * top, and only the fields that apply to it are shown.
 */
export function SpeedSetup() {
  const { project, dispatch } = useProject()
  const { speed } = project
  const patch = (next: Partial<SpeedControl>, coalesce = false) =>
    dispatch({ type: 'setSpeed', patch: next, coalesce })

  // Typed milliseconds commit on blur or Enter, so "500" is never read as "5"
  // mid-keystroke — and one edit is one undo entry, not one per digit.
  const [draft, setDraft] = useState(() => drafts(speed))
  if (draft.speed !== speed) setDraft(drafts(speed))
  const reset = () => setDraft(drafts(speed))

  // A sweep of the controller is one gesture, so only its first move opens an
  // undo entry; the rest fold into it, as a brush stroke does.
  const sweeping = useRef(false)

  /**
   * Commits one end of the range. The end just typed is the one kept: entering
   * a slowest below the fastest pulls the fastest down to meet it rather than
   * rejecting the number, so neither field can trap the other.
   */
  const commitRange = (anchor: 'min' | 'max') => {
    const typed = anchor === 'min' ? draft.minMs : draft.maxMs
    if (typed.trim() === '' || !Number.isFinite(Number(typed))) return reset()
    const value = Number(typed)
    patch(
      speedRange(
        anchor === 'min' ? value : speed.minMs,
        anchor === 'max' ? value : speed.maxMs,
        anchor,
      ),
    )
  }

  const commitStep = () => {
    if (draft.stepMs.trim() === '' || !Number.isFinite(Number(draft.stepMs))) return reset()
    patch({ stepMs: clampMs(Number(draft.stepMs)) })
  }

  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={speed.useController ? 'controller' : 'fixed'}
          onValueChange={(v) => v && patch({ useController: v === 'controller' })}
        >
          <ToggleGroupItem value="controller">Analog controller</ToggleGroupItem>
          <ToggleGroupItem value="fixed">Fixed speed</ToggleGroupItem>
        </ToggleGroup>

        {speed.useController ? (
          <>
            <label className="flex w-[80px] flex-col gap-1">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Pin
              </span>
              <Select value={speed.pin} onValueChange={(v) => patch({ pin: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANALOG_PINS.map((pin) => (
                    <SelectItem key={pin} value={pin}>
                      {pin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex w-[80px] flex-col gap-1">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Fastest
              </span>
              <Input
                type="number"
                min={SPEED_MS_MIN}
                max={speed.maxMs - 1}
                value={draft.minMs}
                onChange={(e) => setDraft({ ...draft, minMs: e.target.value })}
                onBlur={() => commitRange('min')}
                onKeyDown={commitOnEnter}
              />
            </label>

            <label className="flex w-[80px] flex-col gap-1">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Slowest
              </span>
              <Input
                type="number"
                min={speed.minMs + 1}
                max={SPEED_MS_MAX}
                value={draft.maxMs}
                onChange={(e) => setDraft({ ...draft, maxMs: e.target.value })}
                onBlur={() => commitRange('max')}
                onKeyDown={commitOnEnter}
              />
            </label>

            <label className="flex min-w-[180px] grow basis-[220px] flex-col gap-2">
              <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
                Knob at {positionPercent(speed)}%
                <span className="normal-case">
                  {' '}
                  · reading {clampPosition(speed.position)} / {ADC_MAX}
                </span>
              </span>
              <Slider
                className="py-1.5"
                min={0}
                max={ADC_MAX}
                value={[clampPosition(speed.position)]}
                onValueChange={([v]) => {
                  patch({ position: clampPosition(v) }, sweeping.current)
                  sweeping.current = true
                }}
                onValueCommit={() => {
                  sweeping.current = false
                }}
              />
            </label>
          </>
        ) : (
          <label className="flex w-[100px] flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              Delay (ms)
            </span>
            <Input
              type="number"
              min={SPEED_MS_MIN}
              max={SPEED_MS_MAX}
              value={draft.stepMs}
              onChange={(e) => setDraft({ ...draft, stepMs: e.target.value })}
              onBlur={commitStep}
              onKeyDown={commitOnEnter}
            />
          </label>
        )}

        <div className="flex flex-col gap-1 whitespace-nowrap border-l pl-3">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            Base speed
          </span>
          <strong className="text-sm leading-7">{baseLine(speed)}</strong>
        </div>
      </div>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {speed.useController ? (
          <>
            {speed.pin} is mapped across {speed.minMs}-{speed.maxMs} ms and read as the pattern
            plays. The slider stands in for the real knob: the preview plays at{' '}
            <strong>{potMs(speed)} ms</strong> per step, which is also the value compiled into{' '}
            <code>frameDelayMs</code> before the first live reading.
          </>
        ) : (
          <>This delay is compiled in — no pin is read.</>
        )}{' '}
        Both ends accept {SPEED_MS_MIN}-{SPEED_MS_MAX} ms. Each frame then plays at its own
        multiple of the base, or pins a delay of its own — set that under Movement.
      </p>
    </div>
  )
}

/** The typed values, re-seeded whenever the committed speed changes under them. */
function drafts(speed: SpeedControl) {
  return {
    speed,
    minMs: String(speed.minMs),
    maxMs: String(speed.maxMs),
    stepMs: String(speed.stepMs),
  }
}
