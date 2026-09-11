import type { Grid, Hardware } from '../../types'
import { sourceCols } from '../grid'

/**
 * Emits the Arduino engine.
 *
 * Two decisions shape everything here:
 *
 * - **Buffers are bit-packed**, one bit per LED rather than one `boolean` byte.
 *   A 20x48 panel drops from 1935 to ~195 bytes of SRAM, which is the
 *   difference between filling an Uno and barely touching it.
 * - **Patterns live in PROGMEM**, not as generated assignment statements.
 *   Measured at 10 bytes of Flash per 8x8 pattern against 54 as code, so a
 *   large pattern set costs about a fifth as much program space.
 *
 * Timing is deliberately unchanged from the hand-written sketches: each step
 * holds while `refreshPanel()` multiplexes the rows, so brightness and refresh
 * behaviour on real hardware stay exactly as they were.
 */

export const framePad = (g: Grid) => (8 - (g.cols % 8)) % 8
export const frameBytes = (g: Grid) => Math.ceil(g.cols / 8)
export const patternBytes = (g: Grid) => Math.ceil(sourceCols(g) / 8)

export type EngineNeeds = {
  /** Band counts used on the timeline; no band frames means no band code. */
  bandCounts: number[]
  /** A half-width panel reflects the pattern as it is fed in. */
  mirrorFeed: boolean
  /** A full-width panel reflects the pattern buffer itself. */
  mirrorPattern: boolean
  scroll: boolean
  hold: boolean
  tiled: boolean
}

export function emitConstants(g: Grid, hw: Hardware): string {
  const sc = sourceCols(g)
  const halfNote = g.halfWidth
    ? [
        ``,
        `// Half-width source: only ${sc} of the ${g.cols} columns are stored, and the`,
        `// panel repeats or reflects them across the full width.`,
      ]
    : []
  return [
    `/* ---- panel geometry ---- */`,
    `#define PANEL_ROWS ${g.rows}`,
    `#define PANEL_COLS ${g.cols}`,
    `#define FRAME_BYTES_PER_ROW ${frameBytes(g)}`,
    ...halfNote,
    `#define PATTERN_COLS ${sc}`,
    `#define PATTERN_BYTES_PER_ROW ${patternBytes(g)}`,
    ``,
    `/* ---- wiring: two 74HC595 chains sharing one latch ---- */`,
    `#define PIN_COLUMN_DATA ${hw.data1}`,
    `#define PIN_COLUMN_CLOCK ${hw.clock1}`,
    `#define PIN_ROW_DATA ${hw.data2}`,
    `#define PIN_ROW_CLOCK ${hw.clock2}`,
    `#define PIN_LATCH ${hw.str1}`,
    ...(hw.useSpeedPot
      ? [
          `#define PIN_SPEED_DIAL ${hw.speedPin}`,
          `#define SPEED_MIN_MS ${hw.speedMin}`,
          `#define SPEED_MAX_MS ${hw.speedMax}`,
        ]
      : []),
    ``,
    `/* ---- state ---- */`,
    `uint8_t frameBuffer[PANEL_ROWS][FRAME_BYTES_PER_ROW];   // what the panel shows`,
    `uint8_t pattern[PANEL_ROWS][PATTERN_BYTES_PER_ROW];     // the pattern being played`,
    `uint16_t frameDelayMs = ${hw.defaultSpeed};`,
    `unsigned long stepStartedAt = 0;`,
  ].join('\n')
}

export function emitSetup(hw: Hardware): string {
  return [
    `void setup() {`,
    ...(hw.useSpeedPot ? [`  pinMode(PIN_SPEED_DIAL, INPUT);`] : []),
    `  pinMode(PIN_COLUMN_DATA, OUTPUT);`,
    `  pinMode(PIN_COLUMN_CLOCK, OUTPUT);`,
    `  pinMode(PIN_ROW_DATA, OUTPUT);`,
    `  pinMode(PIN_ROW_CLOCK, OUTPUT);`,
    `  pinMode(PIN_LATCH, OUTPUT);`,
    ...(hw.useSpeedPot ? [``, `  frameDelayMs = readSpeedDial();`] : []),
    ``,
    `  stepStartedAt = millis();`,
    `}`,
  ].join('\n')
}

/** Bit addressing. One inline helper pair replaces the old per-buffer loops. */
function emitBitHelpers(): string {
  return `static inline bool patternPixel(uint8_t row, uint8_t col) {
  return pattern[row][col >> 3] & (0x80 >> (col & 7));
}

static inline bool framePixel(uint8_t row, uint8_t col) {
  return frameBuffer[row][col >> 3] & (0x80 >> (col & 7));
}

static inline void setPatternPixel(uint8_t row, uint8_t col, bool on) {
  uint8_t mask = 0x80 >> (col & 7);
  if (on) pattern[row][col >> 3] |= mask;
  else pattern[row][col >> 3] &= ~mask;
}

static inline void setFramePixel(uint8_t row, uint8_t col, bool on) {
  uint8_t mask = 0x80 >> (col & 7);
  if (on) frameBuffer[row][col >> 3] |= mask;
  else frameBuffer[row][col >> 3] &= ~mask;
}

void clearPattern() {
  memset(pattern, 0, sizeof(pattern));
}

void clearPanel() {
  memset(frameBuffer, 0, sizeof(frameBuffer));
}`
}

function emitDisplay(hw: Hardware): string {
  const speedFn = hw.useSpeedPot
    ? `
/** The speed dial is read continuously, so it responds while a pattern plays. */
uint16_t readSpeedDial() {
  return map(analogRead(PIN_SPEED_DIAL), 0, 1024, SPEED_MIN_MS, SPEED_MAX_MS);
}
`
    : ''
  const refreshSpeed = hw.useSpeedPot ? `  frameDelayMs = readSpeedDial();\n` : ''
  // Column order is the one thing that depends on how the chain is physically
  // wired: reverse it here if the pattern comes out mirrored on the panel.
  const colLoop =
    hw.scanOrder === 'ascending'
      ? `  for (uint8_t col = 0; col < PANEL_COLS; col++) {`
      : `  for (uint8_t col = PANEL_COLS; col-- > 0;) {`

  return `${speedFn}
/** Multiplexes the panel once: every row lit briefly, in turn. */
void refreshPanel() {
${refreshSpeed}  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    shiftColumnBits(row);
    shiftRowSelect(row);
    digitalWrite(PIN_LATCH, HIGH);
  }
}

void shiftColumnBits(uint8_t row) {
  digitalWrite(PIN_LATCH, LOW);
${colLoop}
    digitalWrite(PIN_COLUMN_CLOCK, LOW);
    digitalWrite(PIN_COLUMN_DATA, framePixel(row, col) ? HIGH : LOW);
    digitalWrite(PIN_COLUMN_CLOCK, HIGH);
  }
}

/** Row select is active-low: every row high except the one being lit. */
void shiftRowSelect(uint8_t activeRow) {
  digitalWrite(PIN_LATCH, LOW);
  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    digitalWrite(PIN_ROW_CLOCK, LOW);
    digitalWrite(PIN_ROW_DATA, row == activeRow ? LOW : HIGH);
    digitalWrite(PIN_ROW_CLOCK, HIGH);
  }
}

/** Holds the current frame on screen, refreshing it for the whole duration. */
void holdFrame(uint16_t durationMs) {
  while (millis() - stepStartedAt < durationMs) {
    refreshPanel();
  }
  stepStartedAt = millis();
}`
}

function emitPatternLoading(needs: EngineNeeds): string {
  const tiling = needs.tiled
    ? `
  // Repeat the tile down the panel, then across it.
  for (uint8_t row = tileRows; row < PANEL_ROWS; row++) {
    for (uint8_t col = 0; col < tileCols; col++) {
      setPatternPixel(row, col, patternPixel(row % tileRows, col));
    }
  }
  for (uint8_t col = tileCols; col < PATTERN_COLS; col++) {
    for (uint8_t row = 0; row < PANEL_ROWS; row++) {
      setPatternPixel(row, col, patternPixel(row, col % tileCols));
    }
  }`
    : ''

  const mirrorFn = needs.mirrorPattern
    ? `

/** Reflects the pattern about its centre column. */
void mirrorPattern() {
  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    for (uint8_t col = 0; col < PATTERN_COLS / 2; col++) {
      setPatternPixel(row, PATTERN_COLS - 1 - col, patternPixel(row, col));
    }
  }
}`
    : ''

  return `/**
 * Unpacks a pattern out of PROGMEM${needs.tiled ? ' and tiles it across the pattern buffer' : ''}.
 * Rows are stored bit-packed, ${'`'}(tileCols + 7) / 8${'`'} bytes each.
 */
void loadPattern(const uint8_t* data, uint8_t tileRows, uint8_t tileCols) {
  uint8_t stride = (tileCols + 7) / 8;
  clearPattern();
  for (uint8_t row = 0; row < tileRows; row++) {
    for (uint8_t col = 0; col < tileCols; col++) {
      uint8_t packed = pgm_read_byte(&data[row * stride + (col >> 3)]);
      setPatternPixel(row, col, packed & (0x80 >> (col & 7)));
    }
  }${tiling}
}${mirrorFn}

/**
 * Writes one panel row from one pattern row. When the pattern is narrower than
 * the panel it repeats across it, or reflects when ${'`'}mirrored${'`'} is set.
 */
void writePanelRow(uint8_t panelRow, uint8_t patternRow, bool mirrored) {
  for (uint8_t col = 0; col < PANEL_COLS; col++) {
    uint8_t source = (mirrored && col >= PATTERN_COLS)
      ? (uint8_t)(PANEL_COLS - 1 - col)
      : (uint8_t)(col % PATTERN_COLS);
    setFramePixel(panelRow, col, patternPixel(patternRow, source));
  }
}

void writePanelColumn(uint8_t panelCol, uint8_t patternCol) {
  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    setFramePixel(row, panelCol, patternPixel(row, patternCol));
  }
}

/** Pushes the whole pattern onto the panel at once. */
void fillPanelFromPattern(bool mirrored) {
  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    writePanelRow(row, row, mirrored);
  }
}`
}

function emitShifts(g: Grid): string {
  const pad = framePad(g)
  // With a column count that is not a multiple of 8 the last byte carries spare
  // bits; shifting would drag them into real columns, so clear them each time.
  const trim =
    pad > 0
      ? `
/** Clears the ${pad} spare bit${pad === 1 ? '' : 's'} past PANEL_COLS in the last byte of a row. */
static inline void trimRow(uint8_t row) {
  frameBuffer[row][FRAME_BYTES_PER_ROW - 1] &= (uint8_t)(0xFF << ${pad});
}
`
      : ''
  const trimCall = pad > 0 ? `\n    trimRow(row);` : ''

  const vertical = `void shiftPanelUp() {
  for (uint8_t row = 0; row + 1 < PANEL_ROWS; row++) {
    memcpy(frameBuffer[row], frameBuffer[row + 1], FRAME_BYTES_PER_ROW);
  }
}

void shiftPanelDown() {
  for (uint8_t row = PANEL_ROWS - 1; row > 0; row--) {
    memcpy(frameBuffer[row], frameBuffer[row - 1], FRAME_BYTES_PER_ROW);
  }
}`

  const horizontal = `void shiftRowLeft(uint8_t row) {
  for (uint8_t b = 0; b < FRAME_BYTES_PER_ROW; b++) {
    uint8_t next = (b + 1 < FRAME_BYTES_PER_ROW) ? frameBuffer[row][b + 1] : 0;
    frameBuffer[row][b] = (uint8_t)(frameBuffer[row][b] << 1) | (uint8_t)(next >> 7);
  }${trimCall}
}

void shiftRowRight(uint8_t row) {
  for (uint8_t b = FRAME_BYTES_PER_ROW; b-- > 0;) {
    uint8_t previous = (b > 0) ? frameBuffer[row][b - 1] : 0;
    frameBuffer[row][b] = (uint8_t)(frameBuffer[row][b] >> 1) | (uint8_t)(previous << 7);
  }${trimCall}
}

void shiftPanelLeft() {
  for (uint8_t row = 0; row < PANEL_ROWS; row++) shiftRowLeft(row);
}

void shiftPanelRight() {
  for (uint8_t row = 0; row < PANEL_ROWS; row++) shiftRowRight(row);
}`

  return `${trim}${trim ? '\n' : ''}${vertical}\n\n${horizontal}`
}

function emitBands(): string {
  return `/**
 * Splits the panel into equal horizontal bands, each rotating left or right
 * independently. One bit of ${'`'}directions${'`'} per band: set means rightwards.
 */
void scrollBands(uint8_t bandCount, uint8_t directions) {
  uint8_t bandHeight = PANEL_ROWS / bandCount;
  for (uint8_t band = 0; band < bandCount; band++) {
    bool rightwards = directions & (1 << band);
    for (uint8_t offset = 0; offset < bandHeight; offset++) {
      uint8_t row = band * bandHeight + offset;
      if (rightwards) {
        bool carry = framePixel(row, PANEL_COLS - 1);
        shiftRowRight(row);
        setFramePixel(row, 0, carry);
      } else {
        bool carry = framePixel(row, 0);
        shiftRowLeft(row);
        setFramePixel(row, PANEL_COLS - 1, carry);
      }
    }
  }
}`
}

function emitMotions(needs: EngineNeeds): string {
  const parts: string[] = []

  if (needs.scroll) {
    parts.push(`/**
 * Scrolls the pattern across the panel. Each step shifts the panel and feeds in
 * one fresh row or column, indexed modulo the pattern size so a short pattern
 * scrolls endlessly.
 */
void runScroll(int8_t vertical, int8_t horizontal, bool mirrored, uint16_t stepMs, uint16_t steps) {
  stepStartedAt = millis();
  for (uint16_t step = 0; step < steps; step++) {
    if (vertical > 0) {
      shiftPanelUp();
      writePanelRow(PANEL_ROWS - 1, step % PANEL_ROWS, mirrored);
    }
    if (vertical < 0) {
      shiftPanelDown();
      writePanelRow(0, PANEL_ROWS - 1 - (step % PANEL_ROWS), mirrored);
    }
    if (horizontal > 0) {
      shiftPanelRight();
      writePanelColumn(0, PATTERN_COLS - 1 - (step % PATTERN_COLS));
    }
    if (horizontal < 0) {
      shiftPanelLeft();
      writePanelColumn(PANEL_COLS - 1, step % PATTERN_COLS);
    }
    holdFrame(stepMs);
  }
}`)
  }

  if (needs.hold) {
    parts.push(`/** Keeps the pattern still on screen for a while. */
void runHold(uint16_t stepMs, uint16_t steps) {
  stepStartedAt = millis();
  for (uint16_t step = 0; step < steps; step++) {
    holdFrame(stepMs);
  }
}`)
  }

  if (needs.bandCounts.length > 0) {
    parts.push(`void runBands(uint8_t bandCount, uint8_t directions, uint16_t stepMs, uint16_t steps) {
  stepStartedAt = millis();
  for (uint16_t step = 0; step < steps; step++) {
    holdFrame(stepMs);
    scrollBands(bandCount, directions);
  }
}`)
  }

  return parts.join('\n\n')
}

export function emitEngine(g: Grid, hw: Hardware, needs: EngineNeeds): string {
  const parts = [
    emitBitHelpers(),
    emitDisplay(hw),
    emitPatternLoading(needs),
    emitShifts(g),
    ...(needs.bandCounts.length > 0 ? [emitBands()] : []),
    emitMotions(needs),
  ]
  return parts.filter(Boolean).join('\n\n')
}
