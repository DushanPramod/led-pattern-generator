/**
 * A fixed set of projects that exercise the shapes the emitter cares about:
 * tiled and full-panel, half-width, a column count that is not a multiple of
 * eight, bands, holds, and a set with duplicates, a blank and a mirror pair for
 * the passes that look for redundancy.
 *
 * Ids are sequential rather than time-based so the generated sketches hash the
 * same on every run.
 */

export const GEOMETRIES = {
  G8: { rows: 8, cols: 32 },
  G16: { rows: 16, cols: 48 },
  GHALF: { rows: 20, cols: 48, halfWidth: true },
  GODD: { rows: 12, cols: 30 },
}

const checker = (cells, grid) => {
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++) if ((r + c) % 2 === 0) cells[r * grid.cols + c] = 1
}
const diagonal = (cells, grid) => {
  for (let r = 0; r < grid.rows; r++) cells[r * grid.cols + (r % grid.cols)] = 1
}
const hourglass = (cells, grid) => {
  for (let r = 0; r < 8; r++) {
    cells[r * grid.cols + r] = 1
    cells[r * grid.cols + (7 - r)] = 1
  }
}
const blank = () => {}

export function buildProjects(hardware, speed) {
  let n = 0
  const frame = (grid, name, paint, extra = {}) => {
    const cells = new Uint8Array(grid.rows * grid.cols)
    paint(cells, grid)
    return {
      id: `f${n++}`,
      name,
      cells,
      tile: 'full',
      mirror: false,
      preload: false,
      motion: { kind: 'scroll', updown: 1, leftright: 0, steps: grid.rows },
      speedFactor: 1,
      speedMs: null,
      ...extra,
    }
  }
  const project = (name, grid, frames, groups) => ({
    name,
    grid,
    hardware,
    speed,
    rowColors: Array.from({ length: grid.rows }, () => '#ff3b30'),
    frames,
    groups,
  })

  const { G8, G16, GHALF, GODD } = GEOMETRIES
  const out = []

  {
    const f = frame(G8, 'Hourglass', hourglass, { tile: { yy: 8, xx: 8 } })
    out.push(
      project('Starter', G8, [f], [{ id: 'g0', name: 'Scroll up', repeat: 10, frameIds: [f.id] }]),
    )
  }
  {
    const a = frame(G16, 'Checker', checker)
    const b = frame(G16, 'Diagonal', diagonal, {
      motion: { kind: 'static', steps: 4 },
      preload: true,
    })
    out.push(
      project('Mixed', G16, [a, b], [
        { id: 'g0', name: 'Both', repeat: 2, frameIds: [a.id, b.id] },
      ]),
    )
  }
  {
    const a = frame(GHALF, 'HalfMirror', diagonal, { mirror: true })
    out.push(
      project('HalfWidth', GHALF, [a], [{ id: 'g0', name: 'Run', repeat: 1, frameIds: [a.id] }]),
    )
  }
  {
    const a = frame(GODD, 'Bands', checker, {
      motion: { kind: 'band', directions: [true, false, true, false], steps: 6 },
    })
    out.push(
      project('OddCols', GODD, [a], [{ id: 'g0', name: 'Bands', repeat: 3, frameIds: [a.id] }]),
    )
  }
  {
    const a = frame(G8, 'Twin A', hourglass, { tile: { yy: 8, xx: 8 } })
    const b = frame(G8, 'Twin B', hourglass, { tile: { yy: 8, xx: 8 } })
    const dark = frame(G8, 'Dark', blank, {
      tile: { yy: 8, xx: 8 },
      motion: { kind: 'static', steps: 2 },
    })
    const d = frame(G8, 'Slope', diagonal, { tile: { yy: 8, xx: 8 } })
    out.push(
      project('Redundant', G8, [a, b, dark, d], [
        { id: 'g0', name: 'All', repeat: 1, frameIds: [a.id, b.id, dark.id, d.id] },
      ]),
    )
  }
  {
    // A larger library: what a real panel's worth of designs costs.
    const frames = []
    for (let i = 0; i < 24; i++) {
      frames.push(
        frame(G16, `Design ${i + 1}`, (cells, grid) => {
          for (let r = 0; r < grid.rows; r++)
            for (let c = 0; c < grid.cols; c++)
              if ((r * 7 + c * 5 + i * 11) % 9 < 4) cells[r * grid.cols + c] = 1
        }),
      )
    }
    out.push(
      project('Library', G16, frames, [
        { id: 'g0', name: 'All', repeat: 1, frameIds: frames.map((f) => f.id) },
      ]),
    )
  }

  return out
}
