import type { Grid } from '../types'

export type PanelShape = 'flat' | 'round' | 'fan'

/**
 * Where every LED sits on the physical board, shared by the 2D and 3D previews
 * so the two can never disagree about the build.
 *
 * Coordinates are screen-style (y grows downwards) and unitless: a flat panel
 * has a pitch of 1 and is centred on the origin; a round or fan board has its
 * rim at radius 1 around the origin.
 */
export type LedLayout = {
  /** x, y per LED, indexed `(r * cols + c) * 2` like the frame cells. */
  positions: Float32Array
  /** Distance between neighbouring LEDs — the most a single LED may cover. */
  pitch: number
  /** Round and fan only: rim and hub-hole radius. */
  outer: number
  inner: number
  /** Round and fan only: angle covered and angle of column 1's edge, in radians. */
  arc: number
  start: number
}

export function ledLayout(grid: Grid, shape: PanelShape, sweep: number, rimFirst: boolean): LedLayout {
  const { rows, cols } = grid
  const positions = new Float32Array(rows * cols * 2)

  if (shape === 'flat') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 2
        positions[i] = c - (cols - 1) / 2
        positions[i + 1] = r - (rows - 1) / 2
      }
    }
    return { positions, pitch: 1, outer: 0, inner: 0, arc: 0, start: 0 }
  }

  // The panel is bent into a disc — every column becomes a spoke and every row
  // a ring, which is how the board is physically built. A fan sweeps less than
  // the full turn, leaving the usual gap at the bottom.
  const outer = 1
  const arc = shape === 'round' ? Math.PI * 2 : (sweep * Math.PI) / 180
  /*
   * Every LED is the same size, as on the real board, so the hub hole has to
   * be wide enough for the innermost ring to hold all the spokes: solving
   * arc*inner/cols = (outer - inner)/rows for inner puts the gap along a
   * spoke and the gap between spokes at the same pitch. A narrower fan packs
   * the same spokes into less arc, so its hub opens up further.
   */
  const spread = cols / (arc * rows)
  const inner = Math.max(outer * 0.12, (outer * spread) / (1 + spread))
  const ring = (outer - inner) / rows
  const pitch = Math.min(ring, (arc * inner) / cols)
  // A full turn starts column 1 at the top; a fan is centred on the top, so
  // the unlit wedge lands at the bottom of the board.
  const start = shape === 'round' ? -Math.PI / 2 : -Math.PI / 2 - arc / 2

  for (let r = 0; r < rows; r++) {
    // Row 0 sits at the hub unless the board is wired the other way round.
    const ri = rimFirst ? rows - 1 - r : r
    const radius = inner + (ri + 0.5) * ring
    for (let c = 0; c < cols; c++) {
      const angle = start + ((c + 0.5) / cols) * arc
      const i = (r * cols + c) * 2
      positions[i] = Math.cos(angle) * radius
      positions[i + 1] = Math.sin(angle) * radius
    }
  }
  return { positions, pitch, outer, inner, arc, start }
}
