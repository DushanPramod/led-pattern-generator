import { useRef, useState } from 'react'
import type { Bounds, Crop, CropHandle } from '../lib/image'
import { dragCrop } from '../lib/image'

type Props = {
  /** Object URL of the picture being imported. */
  src: string
  /** Its natural size, which the crop is expressed in. */
  bounds: Bounds
  crop: Crop
  onCrop: (crop: Crop) => void
}

const CORNERS: Array<{ handle: CropHandle; className: string; cursor: string; label: string }> = [
  { handle: 'nw', className: '-left-1.5 -top-1.5', cursor: 'nwse-resize', label: 'top left' },
  { handle: 'ne', className: '-right-1.5 -top-1.5', cursor: 'nesw-resize', label: 'top right' },
  { handle: 'sw', className: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize', label: 'bottom left' },
  { handle: 'se', className: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize', label: 'bottom right' },
]

/** Arrow keys nudge, shift-arrows resize, both in picture pixels per press. */
const NUDGE = 1
const NUDGE_FAST = 10

/**
 * The picture with a crop box over it: drag the box to move it, drag a corner
 * to resize. Everything outside the box is dimmed, because that is the part
 * that will not reach the panel.
 */
export function ImageCrop({ src, bounds, crop, onCrop }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // The drag is held in a ref (it changes per pointer event, and none of it is
  // drawn), except for which handle is down, which styles the cursor.
  const drag = useRef<{ handle: CropHandle; x: number; y: number; start: Crop } | null>(null)
  const [dragging, setDragging] = useState(false)

  const begin = (handle: CropHandle) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    wrapRef.current?.setPointerCapture(event.pointerId)
    drag.current = { handle, x: event.clientX, y: event.clientY, start: crop }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const active = drag.current
    const wrap = wrapRef.current
    if (!active || !wrap) return
    // The picture is drawn scaled to fit the dialog, so a pointer delta has to
    // come back to the picture's own pixels before it means anything.
    const rect = wrap.getBoundingClientRect()
    const dx = ((event.clientX - active.x) * bounds.w) / rect.width
    const dy = ((event.clientY - active.y) * bounds.h) / rect.height
    onCrop(dragCrop(active.start, active.handle, dx, dy, bounds))
  }

  const end = () => {
    drag.current = null
    setDragging(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? NUDGE_FAST : NUDGE
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = by[event.key]
    if (!delta) return
    event.preventDefault()
    // Alt turns the same keys into a resize, so the box is fully operable
    // without a pointer.
    onCrop(dragCrop(crop, event.altKey ? 'se' : 'move', delta[0], delta[1], bounds))
  }

  const pct = (value: number, of: number) => `${(value / of) * 100}%`

  return (
    <div
      ref={wrapRef}
      className="relative touch-none select-none overflow-hidden rounded-md border bg-[#0b0f16]"
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <img src={src} alt="" className="block w-full" draggable={false} />
      <div
        role="group"
        aria-label={`Crop: ${Math.round(crop.w)} by ${Math.round(crop.h)} pixels. Arrow keys move it, alt with arrow keys resizes it.`}
        tabIndex={0}
        className={`absolute outline-2 outline-primary shadow-[0_0_0_9999px_rgba(4,8,16,0.7)] focus-visible:outline-4 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          left: pct(crop.x, bounds.w),
          top: pct(crop.y, bounds.h),
          width: pct(crop.w, bounds.w),
          height: pct(crop.h, bounds.h),
        }}
        onPointerDown={begin('move')}
        onKeyDown={onKeyDown}
      >
        {CORNERS.map((corner) => (
          <span
            key={corner.handle}
            aria-hidden="true"
            className={`absolute size-3 rounded-[2px] border border-background bg-primary ${corner.className}`}
            style={{ cursor: corner.cursor }}
            onPointerDown={begin(corner.handle)}
          />
        ))}
      </div>
    </div>
  )
}
