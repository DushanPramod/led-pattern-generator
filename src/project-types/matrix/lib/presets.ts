import type { Grid } from '../types'
import { sourceCols } from './grid'

/**
 * Ready-made artwork for a frame. Each design is ASCII art — '#' is a lit LED,
 * every other character is off — so adding one only means drawing it below.
 * All rows of a design must be the same length.
 */
export type Design = {
  id: string
  name: string
  /** Heading the design is filed under in the picker. */
  group: string
  art: string[]
}

export const designRows = (design: Design) => design.art.length
export const designCols = (design: Design) => design.art[0]?.length ?? 0

/** Doubles every pixel, so an 8x8 design also reads as a 16x16 tile. */
function scale2(design: Design): Design {
  return {
    id: `${design.id}-2x`,
    name: design.name,
    group: design.group,
    art: design.art.flatMap((line) => {
      const wide = [...line].map((ch) => ch + ch).join('')
      return [wide, wide]
    }),
  }
}

type Art = Omit<Design, 'group'>

const tag = (group: string, list: Art[]): Design[] => list.map((d) => ({ ...d, group }))

const BASE: Art[] = [
  {
    id: 'heart',
    name: 'Heart',
    art: [
      '.##..##.',
      '########',
      '########',
      '########',
      '.######.',
      '..####..',
      '...##...',
      '........',
    ],
  },
  {
    id: 'smiley',
    name: 'Smiley',
    art: [
      '..####..',
      '.#....#.',
      '#.#..#.#',
      '#......#',
      '#.#..#.#',
      '#..##..#',
      '.#....#.',
      '..####..',
    ],
  },
  {
    id: 'star',
    name: 'Star',
    art: [
      '...##...',
      '...##...',
      '########',
      '.######.',
      '..####..',
      '.##..##.',
      '##....##',
      '........',
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    art: [
      '...##...',
      '..####..',
      '.######.',
      '########',
      '########',
      '.######.',
      '..####..',
      '...##...',
    ],
  },
  {
    id: 'ring',
    name: 'Ring',
    art: [
      '..####..',
      '.#....#.',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '.#....#.',
      '..####..',
    ],
  },
  {
    id: 'box',
    name: 'Box',
    art: [
      '########',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ],
  },
  {
    id: 'arrow-up',
    name: 'Arrow up',
    art: [
      '...##...',
      '..####..',
      '.######.',
      '########',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
    ],
  },
  {
    id: 'arrow-right',
    name: 'Arrow right',
    art: [
      '....#...',
      '....##..',
      '#######.',
      '########',
      '########',
      '#######.',
      '....##..',
      '....#...',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    art: [
      '...##...',
      '...##...',
      '...##...',
      '########',
      '########',
      '...##...',
      '...##...',
      '...##...',
    ],
  },
  {
    id: 'cross',
    name: 'Cross',
    art: [
      '##....##',
      '.##..##.',
      '..####..',
      '...##...',
      '...##...',
      '..####..',
      '.##..##.',
      '##....##',
    ],
  },
  {
    id: 'triangle',
    name: 'Triangle',
    art: [
      '...##...',
      '...##...',
      '..####..',
      '..####..',
      '.######.',
      '.######.',
      '########',
      '########',
    ],
  },
  {
    id: 'invader',
    name: 'Invader',
    art: [
      '..#..#..',
      '...##...',
      '..####..',
      '.##..##.',
      '########',
      '#.####.#',
      '#.#..#.#',
      '..#..#..',
    ],
  },
  {
    id: 'note',
    name: 'Music note',
    art: [
      '...#####',
      '...#...#',
      '...#...#',
      '...#...#',
      '...#...#',
      '.###.###',
      '.###.###',
      '........',
    ],
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    art: [
      '#...#...',
      '.#...#..',
      '..#...#.',
      '...#...#',
      '#...#...',
      '.#...#..',
      '..#...#.',
      '...#...#',
    ],
  },
  {
    id: 'checker',
    name: 'Checker',
    art: ['##..', '##..', '..##', '..##'],
  },
  {
    id: 'stripes',
    name: 'Stripes',
    art: ['##..', '##..', '##..', '##..'],
  },
  {
    id: 'bars',
    name: 'Bars',
    art: ['####', '####', '....', '....'],
  },
  {
    id: 'dots',
    name: 'Dots',
    art: ['#.', '..'],
  },
]

const SHAPES_GROUP = 'Shapes'
const VESAK_GROUP = 'Vesak & Poson'

/**
 * Vesak artwork. These are the motifs that go up for the festival — lanterns,
 * the lotus, the bo leaf, the dhamma wheel, the dagoba and the oil lamp — drawn
 * both at 8x8 for an 8-row panel and at 16x16 where a 16-row panel gives the
 * detail room to read.
 */
const VESAK: Art[] = [
  {
    id: 'lotus',
    name: 'Lotus',
    art: [
      '........',
      '...##...',
      '.#.##.#.',
      '##.##.##',
      '########',
      '.######.',
      '..####..',
      '........',
    ],
  },
  {
    id: 'bo-leaf',
    name: 'Bo leaf',
    art: [
      '.##..##.',
      '########',
      '########',
      '.######.',
      '.######.',
      '..####..',
      '...##...',
      '....#...',
    ],
  },
  {
    id: 'lantern',
    name: 'Vesak lantern',
    art: [
      '...##...',
      '..####..',
      '.######.',
      '########',
      '.######.',
      '..####..',
      '...##...',
      '..#..#..',
    ],
  },
  {
    id: 'oil-lamp',
    name: 'Oil lamp',
    art: [
      '...#....',
      '...##...',
      '..####..',
      '..####..',
      '...##...',
      '.######.',
      '########',
      '.######.',
    ],
  },
  {
    id: 'stupa',
    name: 'Dagoba',
    art: [
      '...##...',
      '...##...',
      '..####..',
      '..####..',
      '.######.',
      '########',
      '########',
      '########',
    ],
  },
  {
    id: 'wheel',
    name: 'Dhamma wheel',
    art: [
      '..####..',
      '.##..##.',
      '#..##..#',
      '########',
      '########',
      '#..##..#',
      '.##..##.',
      '..####..',
    ],
  },
  {
    id: 'lotus-16',
    name: 'Lotus',
    art: [
      '................',
      '.......##.......',
      '......####......',
      '.#....####....#.',
      '.##...####...##.',
      '.###..####..###.',
      '.####.####.####.',
      '.##############.',
      '################',
      '################',
      '.##############.',
      '..############..',
      '...##########...',
      '....########....',
      '......####......',
      '................',
    ],
  },
  {
    id: 'bo-leaf-16',
    name: 'Bo leaf',
    art: [
      '...####..####...',
      '.######..######.',
      '################',
      '################',
      '################',
      '################',
      '.##############.',
      '.##############.',
      '..############..',
      '..############..',
      '...##########...',
      '....########....',
      '.....######.....',
      '......####......',
      '.......##.......',
      '........#.......',
    ],
  },
  {
    id: 'lantern-16',
    name: 'Vesak lantern',
    art: [
      '.......##.......',
      '.......##.......',
      '......####......',
      '.....######.....',
      '....########....',
      '...##########...',
      '..############..',
      '.##############.',
      '.##############.',
      '..############..',
      '...##########...',
      '....########....',
      '.....######.....',
      '......####......',
      '......#..#......',
      '......#..#......',
    ],
  },
  {
    id: 'stupa-16',
    name: 'Dagoba',
    art: [
      '.......##.......',
      '.......##.......',
      '.......##.......',
      '......####......',
      '......####......',
      '.....######.....',
      '....########....',
      '...##########...',
      '..############..',
      '.##############.',
      '.##############.',
      '.##############.',
      '.##############.',
      '################',
      '################',
      '................',
    ],
  },
  {
    id: 'wheel-16',
    name: 'Dhamma wheel',
    art: [
      '......####......',
      '....##.##.##....',
      '..##...##...##..',
      '..##...##...##..',
      '.#..#..##..#..#.',
      '.#...#.##.#...#.',
      '#......##......#',
      '################',
      '################',
      '#......##......#',
      '.#...#.##.#...#.',
      '.#..#..##..#..#.',
      '..##...##...##..',
      '..##...##...##..',
      '....##.##.##....',
      '......####......',
    ],
  },
  {
    id: 'buddha-16',
    name: 'Seated Buddha',
    art: [
      '......####......',
      '.....######.....',
      '.....######.....',
      '.....######.....',
      '......####......',
      '....########....',
      '...##########...',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '.##############.',
      '################',
      '################',
      '.##############.',
      '................',
    ],
  },
]

/** The 16-row variants matter on 16x32 panels, where an 8x8 tile looks small. */
const SCALED = ['heart', 'smiley', 'invader', 'star'].map((id) =>
  scale2(tag(SHAPES_GROUP, BASE).find((d) => d.id === id)!),
)

export const DESIGNS: Design[] = [
  ...tag(SHAPES_GROUP, BASE),
  ...SCALED,
  ...tag(VESAK_GROUP, VESAK),
]

/** A design can be used as a tile only when its size divides the source array. */
export function tilesGrid(design: Design, grid: Grid): boolean {
  return grid.rows % designRows(design) === 0 && sourceCols(grid) % designCols(design) === 0
}

/**
 * Draws the design into a fresh cell buffer, centred in `target` (the tile the
 * design will drive, or the frame's existing region when it cannot tile).
 */
export function stampDesign(
  design: Design,
  grid: Grid,
  target: { rows: number; cols: number },
): Uint8Array {
  const cells = new Uint8Array(grid.rows * grid.cols)
  const offRow = Math.max(0, Math.floor((target.rows - designRows(design)) / 2))
  const offCol = Math.max(0, Math.floor((target.cols - designCols(design)) / 2))
  design.art.forEach((line, r) => {
    const row = offRow + r
    if (row >= target.rows || row >= grid.rows) return
    for (let c = 0; c < line.length; c++) {
      const col = offCol + c
      if (col >= target.cols || col >= grid.cols) continue
      if (line[c] === '#') cells[row * grid.cols + col] = 1
    }
  })
  return cells
}
