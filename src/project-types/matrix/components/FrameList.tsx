import { ChevronDown, ChevronUp, Copy, GripVertical, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react'
import type { Frame, Grid, Group } from '../types'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import {
  formatDuration,
  frameDurationMs,
  groupDurationMs,
  groupPassMs,
  timelineDurationMs,
} from '../lib/duration'
import { motionSteps, panelView } from '../lib/simulate'
import { baseSpeedMs, formatFactor, frameStepMs } from '../lib/speed'
import { useProject } from '../state/useProject'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function FrameThumb({ frame, grid, rowColors }: { frame: Frame; grid: Grid; rowColors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const cell = Math.max(1, Math.floor(96 / grid.cols)) || 1
    const w = grid.cols * cell
    const h = grid.rows * cell
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.fillStyle = '#0b0f16'
    ctx.fillRect(0, 0, w, h)
    const cells = panelView(frame, grid)
    for (let r = 0; r < grid.rows; r++) {
      ctx.fillStyle = rowColors[r] ?? DEFAULT_LED_COLOR
      for (let c = 0; c < grid.cols; c++) {
        if (cells[r * grid.cols + c]) ctx.fillRect(c * cell, r * cell, cell, cell)
      }
    }
  }, [frame, grid, rowColors])

  return (
    <canvas
      ref={ref}
      className="pointer-events-none h-auto w-full rounded bg-[#0b0f16] [image-rendering:pixelated]"
    />
  )
}

function motionLabel(frame: Frame): string {
  const m = frame.motion
  if (m.kind === 'static') return `hold ${m.steps}`
  if (m.kind === 'band') {
    return `${m.directions.length} bands ${m.axis === 'vertical' ? '↑↓' : '←→'}, ${m.steps}`
  }
  const parts: string[] = []
  if (m.updown === 1) parts.push('up')
  if (m.updown === -1) parts.push('down')
  if (m.leftright === 1) parts.push('right')
  if (m.leftright === -1) parts.push('left')
  return `${parts.join('+') || 'still'} ${m.steps}`
}

/**
 * How long one sequence takes, repeats included — the number that answers
 * "how long until the panel comes back round to here".
 */
function SequenceTime({
  group,
  base,
  byId,
  basis,
}: {
  group: Group
  base: number
  byId: Map<string, Frame>
  basis: string
}) {
  const runs = Math.max(1, group.repeat)
  const pass = groupPassMs(base, byId, group)
  // A repeated sequence shows its total, so the per-pass length — the part a
  // user would otherwise have to divide out — goes in the tooltip.
  const title =
    runs > 1
      ? `${runs} passes of ${formatDuration(pass)}, ${basis}`
      : `One pass of this sequence ${basis}`
  return (
    <span className="mr-auto cursor-help text-xs tabular-nums whitespace-nowrap text-muted-foreground" title={title}>
      ~{formatDuration(groupDurationMs(base, byId, group))}
    </span>
  )
}

/**
 * Where a dragged sequence would land. Always in the tree, coloured only when
 * it is the live target, so the list does not shift as the marker moves.
 */
function DropLine({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        '-my-1.5 h-0.5 shrink-0 rounded-full transition-colors',
        active ? 'bg-primary' : 'bg-transparent',
      )}
    />
  )
}

export function FrameList() {
  const { project, selectedFrameId, dispatch } = useProject()
  const [dragId, setDragId] = useState<string | null>(null)
  // Sequences drag by their grip alone, so the header's name and repeat fields
  // stay selectable: the card only turns draggable while the grip is held.
  const [gripId, setGripId] = useState<string | null>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const byId = new Map(project.frames.map((f) => [f.id, f]))

  // With a controller fitted these times track the knob, so say so rather than
  // letting a number that moves on its own look wrong.
  const base = baseSpeedMs(project.speed)
  const total = timelineDurationMs(base, byId, project.groups)
  const basis = project.speed.useController
    ? `at the knob's current ${base} ms per step`
    : `at ${base} ms per step`

  const drop = (groupId: string, index: number) => {
    if (dragId) dispatch({ type: 'moveFrame', frameId: dragId, toGroupId: groupId, toIndex: index })
    setDragId(null)
  }

  const endGroupDrag = () => {
    setDragGroupId(null)
    setGripId(null)
    setDropIndex(null)
  }

  /** Which side of the hovered sequence the dragged one would land on. */
  const groupSlot = (e: DragEvent, index: number) => {
    const box = e.currentTarget.getBoundingClientRect()
    return e.clientY > box.top + box.height / 2 ? index + 1 : index
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="m-0 text-sm font-semibold">Timeline</h3>
          <span
            className="cursor-help text-xs tabular-nums whitespace-nowrap text-muted-foreground"
            title={`One lap of the timeline ${basis}`}
          >
            ~{formatDuration(total)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => dispatch({ type: 'addFrame' })}>+ Frame</Button>
          <Button type="button" variant="outline" onClick={() => dispatch({ type: 'addGroup' })}>+ Sequence</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {project.groups.map((group, gi) => (
          <Fragment key={group.id}>
            <DropLine active={dropIndex === gi} />
            <div
              className={cn(
                'rounded-lg border bg-muted p-2.5',
                dragGroupId === group.id && 'opacity-50',
              )}
              draggable={gripId === group.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setDragGroupId(group.id)
              }}
              onDragEnd={endGroupDrag}
              onDragOver={(e) => {
                if (!dragGroupId) return
                e.preventDefault()
                setDropIndex(dragGroupId === group.id ? null : groupSlot(e, gi))
              }}
              onDrop={(e) => {
                if (!dragGroupId) return
                e.preventDefault()
                e.stopPropagation()
                const to = groupSlot(e, gi)
                if (dragGroupId !== group.id) dispatch({ type: 'moveGroupTo', id: dragGroupId, toIndex: to })
                endGroupDrag()
              }}
            >
              <header className="mb-2 flex items-center gap-2">
                <span
                  className="-ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  title="Drag to reorder sequence"
                  aria-hidden="true"
                  onPointerDown={() => setGripId(group.id)}
                  onPointerUp={() => setGripId(null)}
                >
                  <GripVertical className="size-4" />
                </span>
                <Input
                  className="max-w-[220px] font-semibold"
                  value={group.name}
                  onChange={(e) =>
                    dispatch({ type: 'updateGroup', id: group.id, patch: { name: e.target.value } })
                  }
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>repeat</span>
                  <Input
                    className="w-[58px]"
                    type="number"
                    min={1}
                    value={group.repeat}
                    onChange={(e) =>
                      dispatch({
                        type: 'updateGroup',
                        id: group.id,
                        patch: { repeat: Math.max(1, Number(e.target.value)) },
                      })
                    }
                  />
                  <span>x</span>
                </label>
                <SequenceTime group={group} base={base} byId={byId} basis={basis} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Move sequence up"
                  aria-label="Move sequence up"
                  disabled={gi === 0}
                  onClick={() => dispatch({ type: 'moveGroup', id: group.id, delta: -1 })}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Move sequence down"
                  aria-label="Move sequence down"
                  disabled={gi === project.groups.length - 1}
                  onClick={() => dispatch({ type: 'moveGroup', id: group.id, delta: 1 })}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Duplicate sequence"
                  aria-label="Duplicate sequence"
                  onClick={() => dispatch({ type: 'duplicateGroup', id: group.id })}
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  title="Delete sequence"
                  aria-label="Delete sequence"
                  onClick={() => dispatch({ type: 'deleteGroup', id: group.id })}
                >
                  <X />
                </Button>
              </header>

              <div
                className="flex min-h-24 gap-2 overflow-x-auto pb-1"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(group.id, group.frameIds.length)}
              >
                {group.frameIds.map((fid, i) => {
                  const frame = byId.get(fid)
                  if (!frame) return null
                  return (
                    <div
                      key={fid}
                      className={cn(
                        'group/frame relative flex w-[124px] shrink-0 cursor-grab flex-col gap-1 rounded-lg border bg-card p-2 text-left',
                        fid === selectedFrameId && 'border-primary ring-1 ring-primary',
                      )}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        setDragId(fid)
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        // A sequence dropped onto a frame is still a sequence
                        // move, so let it through to the card behind.
                        if (dragGroupId) return
                        e.stopPropagation()
                        drop(group.id, i)
                      }}
                      onClick={() => dispatch({ type: 'selectFrame', id: fid })}
                    >
                      <FrameThumb frame={frame} grid={project.grid} rowColors={project.rowColors} />
                      <Input
                        className="h-7 px-1.5 text-[0.76rem]"
                        value={frame.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          dispatch({ type: 'updateFrame', id: fid, patch: { name: e.target.value } })
                        }
                      />
                      {/* The card is narrow, so the motion label yields before the time does. */}
                      <span className="flex items-baseline justify-between gap-1.5 text-[0.7rem] text-muted-foreground">
                        {motionLabel(frame)}
                        <span
                          className="shrink-0 cursor-help whitespace-nowrap tabular-nums"
                          title={`${motionSteps(frame.motion)} steps of ${frameStepMs(base, frame)} ms${
                            frame.speedMs === null ? ` (${formatFactor(frame.speedFactor)} of base)` : ' (pinned)'
                          }`}
                        >
                          ~{formatDuration(frameDurationMs(base, frame))}
                        </span>
                      </span>
                      <div className="absolute top-1 right-1 hidden gap-0.5 group-hover/frame:flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Duplicate"
                          aria-label="Duplicate"
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch({ type: 'duplicateFrame', id: fid })
                          }}
                        >
                          <Copy />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch({ type: 'deleteFrame', id: fid })
                          }}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-[124px] shrink-0 border-dashed text-muted-foreground"
                  onClick={() => dispatch({ type: 'addFrame', groupId: group.id })}
                >
                  + Frame
                </Button>
              </div>
            </div>
          </Fragment>
        ))}
        <DropLine active={dropIndex === project.groups.length} />
      </div>
    </section>
  )
}
