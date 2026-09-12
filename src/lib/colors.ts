/**
 * LED colours are a property of the board, not of the sketch: the 74HC595
 * chains only switch each LED on or off, so the colour comes from whichever
 * LED is physically soldered into that row. Rows are therefore the unit — a
 * fan or ring board is built one coloured ring at a time — and everything here
 * only feeds the editor, the preview and a wiring note in the sketch header.
 */

export const DEFAULT_LED_COLOR = '#ff3b30'

export type LedPreset = { name: string; hex: string }

/** The colours discrete 5 mm / SMD LEDs actually come in. */
export const LED_PRESETS: LedPreset[] = [
  { name: 'Red', hex: '#ff3b30' },
  { name: 'Orange', hex: '#ff7a1a' },
  { name: 'Amber', hex: '#ffb01f' },
  { name: 'Yellow', hex: '#ffe93d' },
  { name: 'Lime', hex: '#9ee83a' },
  { name: 'Green', hex: '#30d84c' },
  { name: 'Cyan', hex: '#2ce6e0' },
  { name: 'Ice blue', hex: '#63c4ff' },
  { name: 'Blue', hex: '#2f6bff' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Magenta', hex: '#e449e4' },
  { name: 'Pink', hex: '#ff4fa3' },
  { name: 'White', hex: '#f2f6ff' },
  { name: 'Warm white', hex: '#ffd9a0' },
]

/** Accepts `#abc`, `abc`, `#aabbcc`, `aabbcc`; returns a lower-case `#aabbcc`. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.toLowerCase().split('').map((ch) => ch + ch).join('')}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`
  return null
}

export function toRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex) ?? DEFAULT_LED_COLOR
  const n = parseInt(clean.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Blends `amount` of `other` into `hex` (0 = hex, 1 = other). */
export function mix(hex: string, other: string, amount: number): string {
  const a = toRgb(hex)
  const b = toRgb(other)
  return `#${a.map((v, i) => hex2(v + (b[i] - v) * amount)).join('')}`
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * An unlit LED keeps a hint of its own colour so the rows stay readable while
 * the panel is dark. Pale LEDs (white, ice blue) have to be pushed back
 * further or an unlit white row looks lit.
 */
export function unlit(hex: string, background: string, extra = 0): string {
  const [r, g, b] = toRgb(hex)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return mix(hex, background, Math.min(0.97, 0.87 + 0.08 * luminance + extra))
}

/** Name of the stock LED closest to an arbitrary colour, for labels and comments. */
export function nearestPresetName(hex: string): string {
  const [r, g, b] = toRgb(hex)
  let best = LED_PRESETS[0]
  let bestD = Infinity
  for (const preset of LED_PRESETS) {
    const [pr, pg, pb] = toRgb(preset.hex)
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (d < bestD) {
      bestD = d
      best = preset
    }
  }
  return best.name
}

export function describeColor(hex: string): string {
  const name = nearestPresetName(hex)
  const preset = LED_PRESETS.find((p) => p.name === name)
  return preset && preset.hex === normalizeHex(hex) ? name : `${name}-ish ${hex}`
}

/** Pads or trims a saved colour list to the current row count. */
export function normalizeRowColors(colors: string[] | undefined, rows: number): string[] {
  const saved = (colors ?? []).map((c) => normalizeHex(c) ?? DEFAULT_LED_COLOR)
  // Extra rows inherit the outermost colour, so growing the panel stays tidy.
  const fallback = saved.at(-1) ?? DEFAULT_LED_COLOR
  return Array.from({ length: rows }, (_, r) => saved[r] ?? fallback)
}

/** Groups equal neighbouring rows, so `1-4 red, 5-8 blue` can be printed. */
export function colorRuns(colors: string[]): Array<{ from: number; to: number; hex: string }> {
  const runs: Array<{ from: number; to: number; hex: string }> = []
  for (let i = 0; i < colors.length; i++) {
    const last = runs.at(-1)
    if (last && last.hex === colors[i]) last.to = i
    else runs.push({ from: i, to: i, hex: colors[i] })
  }
  return runs
}

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`
}

const byName = (name: string) => LED_PRESETS.find((p) => p.name === name)?.hex ?? DEFAULT_LED_COLOR

export type ColorScheme = { name: string; hint: string; build: (rows: number) => string[] }

/** Whole-panel layouts, the way ring boards are usually populated. */
export const COLOR_SCHEMES: ColorScheme[] = [
  {
    name: 'All red',
    hint: 'Every row the same colour',
    build: (rows) => Array.from({ length: rows }, () => byName('Red')),
  },
  {
    name: 'Red / blue',
    hint: 'Alternating rows',
    build: (rows) => Array.from({ length: rows }, (_, r) => (r % 2 ? byName('Blue') : byName('Red'))),
  },
  {
    name: 'Red / white / blue',
    hint: 'Repeating every three rows',
    build: (rows) =>
      Array.from({ length: rows }, (_, r) => [byName('Red'), byName('White'), byName('Blue')][r % 3]),
  },
  {
    name: 'Buddhist flag',
    hint: 'Blue, yellow, red, white, orange repeating every five rows',
    build: (rows) =>
      Array.from(
        { length: rows },
        (_, r) => [byName('Blue'), byName('Yellow'), byName('Red'), byName('White'), byName('Orange')][r % 5],
      ),
  },
  {
    name: 'Rainbow rings',
    hint: 'Hue swept from the hub outwards',
    build: (rows) =>
      Array.from({ length: rows }, (_, r) => hsl((r / Math.max(1, rows)) * 320, 0.85, 0.58)),
  },
  {
    name: 'Warm to cool',
    hint: 'Amber at the hub, ice blue at the rim',
    build: (rows) =>
      Array.from({ length: rows }, (_, r) =>
        mix(byName('Amber'), byName('Ice blue'), rows < 2 ? 0 : r / (rows - 1)),
      ),
  },
]
