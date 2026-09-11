import { useEffect, useRef, useState } from 'react'
import type { Frame, Grid } from '../types'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import { panelView } from '../lib/simulate'
import { useProject } from '../state/useProject'

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

  return <canvas ref={ref} className="thumb" />
}

function motionLabel(frame: Frame): string {
  const m = frame.motion
  if (m.kind === 'static') return `hold ${m.steps}`
  if (m.kind === 'band') return `${m.directions.length} bands, ${m.steps}`
  const parts: string[] = []
  if (m.updown === 1) parts.push('up')
  if (m.updown === -1) parts.push('down')
  if (m.leftright === 1) parts.push('right')
  if (m.leftright === -1) parts.push('left')
  return `${parts.join('+') || 'still'} ${m.steps}`
}

export function FrameList() {
  const { project, selectedFrameId, dispatch } = useProject()
  const [dragId, setDragId] = useState<string | null>(null)
  const byId = new Map(project.frames.map((f) => [f.id, f]))

  const drop = (groupId: string, index: number) => {
    if (dragId) dispatch({ type: 'moveFrame', frameId: dragId, toGroupId: groupId, toIndex: index })
    setDragId(null)
  }

  return (
    <section className="panel timeline">
      <div className="timeline-head">
        <h3>Timeline</h3>
        <div className="tools">
          <button type="button" onClick={() => dispatch({ type: 'addFrame' })}>+ Frame</button>
          <button type="button" onClick={() => dispatch({ type: 'addGroup' })}>+ Sequence</button>
        </div>
      </div>

      <div className="groups">
        {project.groups.map((group, gi) => (
          <div className="group" key={group.id}>
            <header>
              <input
                className="group-name"
                value={group.name}
                onChange={(e) =>
                  dispatch({ type: 'updateGroup', id: group.id, patch: { name: e.target.value } })
                }
              />
              <label className="repeat">
                <span>repeat</span>
                <input
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
              <button
                type="button"
                className="icon"
                title="Move sequence up"
                disabled={gi === 0}
                onClick={() => dispatch({ type: 'moveGroup', id: group.id, delta: -1 })}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon"
                title="Move sequence down"
                disabled={gi === project.groups.length - 1}
                onClick={() => dispatch({ type: 'moveGroup', id: group.id, delta: 1 })}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon danger"
                title="Delete sequence"
                onClick={() => dispatch({ type: 'deleteGroup', id: group.id })}
              >
                ✕
              </button>
            </header>

            <div className="strip" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(group.id, group.frameIds.length)}>
              {group.frameIds.map((fid, i) => {
                const frame = byId.get(fid)
                if (!frame) return null
                return (
                  <div
                    key={fid}
                    className={fid === selectedFrameId ? 'frame-card selected' : 'frame-card'}
                    draggable
                    onDragStart={() => setDragId(fid)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation()
                      drop(group.id, i)
                    }}
                    onClick={() => dispatch({ type: 'selectFrame', id: fid })}
                  >
                    <FrameThumb frame={frame} grid={project.grid} rowColors={project.rowColors} />
                    <input
                      className="frame-name"
                      value={frame.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        dispatch({ type: 'updateFrame', id: fid, patch: { name: e.target.value } })
                      }
                    />
                    <span className="frame-meta">{motionLabel(frame)}</span>
                    <div className="frame-actions">
                      <button
                        type="button"
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'duplicateFrame', id: fid })
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'deleteFrame', id: fid })
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                className="frame-card add"
                onClick={() => dispatch({ type: 'addFrame', groupId: group.id })}
              >
                + Frame
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
