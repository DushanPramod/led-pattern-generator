import { DEFAULT_LED_COLOR, unlit } from '../lib/colors'
import { cn } from '../lib/utils'

/** The same dark the frame canvas and the preview draw the board on. */
const CANVAS_BG = '#0b0f16'

type Props = {
  /** Design art: '#' is a lit LED, anything else is off. */
  art: string[]
  /**
   * Repeat the art up to at least this many rows and columns, which is how a
   * small tile actually lands on the panel. Left off, the art is drawn once.
   */
  repeatTo?: number
  /**
   * Colour of the LEDs fitted on each row. Given, the dots are drawn in the
   * colours of the board this pattern will run on rather than a generic red.
   */
  rowColors?: string[]
  className?: string
}

/** Design artwork as a grid of LEDs — lit dots large and bright, dark ones small. */
export function DotArt({ art, repeatTo, rowColors, className }: Props) {
  const rows = art.length
  const cols = art[0]?.length ?? 0
  if (!rows || !cols) return null

  const high = repeatTo ? rows * Math.ceil(repeatTo / rows) : rows
  const wide = repeatTo ? cols * Math.ceil(repeatTo / cols) : cols

  const dots = []
  for (let r = 0; r < high; r++) {
    // Row colours belong to the panel row, so a repeated tile picks up the
    // colour of whichever row it lands on.
    const led = rowColors ? (rowColors[r] ?? DEFAULT_LED_COLOR) : null
    for (let c = 0; c < wide; c++) {
      const on = art[r % rows][c % cols] === '#'
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={c + 0.5}
          cy={r + 0.5}
          r={on ? 0.4 : 0.18}
          className={on ? 'on' : ''}
          fill={led ? (on ? led : unlit(led, CANVAS_BG)) : undefined}
        />,
      )
    }
  }

  // A CSS fill beats the per-circle attribute, so the generic red look is only
  // applied when no row colours were given.
  return (
    <svg
      className={cn(
        !rowColors && '[&_circle]:fill-[#1d2532] [&_circle.on]:fill-[#ff3b30]',
        className,
      )}
      viewBox={`0 0 ${wide} ${high}`}
      aria-hidden="true"
    >
      {dots}
    </svg>
  )
}
