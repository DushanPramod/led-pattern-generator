import type { Grid, Hardware, SpeedControl } from '../../types'
import { sourceCols } from '../grid'
import { baseSpeedMs, clampMs, SCALE_UNIT } from '../speed'
import { has, NO_PASSES, type CodegenOptions } from './options'

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
  /** Row bands rotating left or right — the horizontal rotator. */
  bandsHorizontal: boolean
  /** Column bands rotating up or down — the vertical rotator. */
  bandsVertical: boolean
  /** A half-width panel reflects the pattern as it is fed in. */
  mirrorFeed: boolean
  /** A full-width panel reflects the pattern buffer itself. */
  mirrorPattern: boolean
  scroll: boolean
  hold: boolean
  tiled: boolean
  /** Some step plays at other than 1x, so the sketch needs the scaling helper. */
  scaledSpeed: boolean
  /** Some step is pinned to a fixed delay, so the table has to carry one. */
  fixedSpeed: boolean
}

export function emitConstants(
  g: Grid,
  hw: Hardware,
  speed: SpeedControl,
  options: CodegenOptions = NO_PASSES,
): string {
  const sc = sourceCols(g)
  const halfNote = g.halfWidth
    ? [
        ``,
        `// Half-width source: only ${sc} of the ${g.cols} columns are stored, and the`,
        `// panel repeats or reflects them across the full width.`,
      ]
    : []
  // Reading patterns straight out of PROGMEM costs a six-byte descriptor
  // instead of a whole second bit-packed buffer, which on a 16x48 panel is 96
  // bytes of SRAM back.
  const patternState = has(options, 'progmemPatternRead')
    ? [
        `const uint8_t* patternData = 0;   // the pattern being played, still in PROGMEM`,
        `uint8_t patternRows = 1;`,
        `uint8_t patternCols = 1;`,
        `uint8_t patternStride = 1;`,
        `bool patternMirrored = false;`,
      ]
    : [`uint8_t pattern[PANEL_ROWS][PATTERN_BYTES_PER_ROW];     // the pattern being played`]

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
    ...(speed.useController
      ? [
          ``,
          `/* ---- speed preset controller ---- */`,
          `#define PIN_SPEED_DIAL ${speed.pin}`,
          `#define SPEED_MIN_MS ${clampMs(speed.minMs)}`,
          `#define SPEED_MAX_MS ${clampMs(speed.maxMs)}`,
        ]
      : []),
    ``,
    `/* ---- state ---- */`,
    `uint8_t frameBuffer[PANEL_ROWS][FRAME_BYTES_PER_ROW];   // what the panel shows`,
    ...patternState,
    // With a dial fitted this is replaced before the first step. The value
    // compiled in is where the dial sits in the editor, so the sketch still
    // runs at the speed the project was designed at until the pot is read.
    `uint16_t frameDelayMs = ${baseSpeedMs(speed)};${
      speed.useController ? '   // replaced by the first dial reading' : ''
    }`,
    `unsigned long stepStartedAt = 0;`,
  ].join('\n')
}

export function emitSetup(speed: SpeedControl): string {
  return [
    `void setup() {`,
    ...(speed.useController ? [`  pinMode(PIN_SPEED_DIAL, INPUT);`] : []),
    `  pinMode(PIN_COLUMN_DATA, OUTPUT);`,
    `  pinMode(PIN_COLUMN_CLOCK, OUTPUT);`,
    `  pinMode(PIN_ROW_DATA, OUTPUT);`,
    `  pinMode(PIN_ROW_CLOCK, OUTPUT);`,
    `  pinMode(PIN_LATCH, OUTPUT);`,
    ...(speed.useController ? [``, `  frameDelayMs = readSpeedDial();`] : []),
    ``,
    `  stepStartedAt = millis();`,
    `}`,
  ].join('\n')
}

/** Bit addressing. One inline helper pair replaces the old per-buffer loops. */
function emitBitHelpers(options: CodegenOptions = NO_PASSES): string {
  if (has(options, 'progmemPatternRead')) return emitProgmemBitHelpers()
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

/**
 * Pattern bits addressed directly in PROGMEM.
 *
 * The two modulos are the tiling: loadPattern() used to materialise a repeated
 * copy across a RAM buffer, and reading \`row % patternRows\` by
 * \`col % patternCols\` gives the same bit without storing it. Mirroring folds
 * into the column the same way, replacing the in-place reflection — the old
 * mirrorPattern() copied the left half onto the right, so a reflected column
 * simply reads from its opposite number.
 */
function emitProgmemBitHelpers(): string {
  return `static inline bool patternPixel(uint8_t row, uint8_t col) {
  uint8_t c = (patternMirrored && col >= PATTERN_COLS - PATTERN_COLS / 2)
    ? (uint8_t)(PATTERN_COLS - 1 - col)
    : col;
  c %= patternCols;
  uint16_t index = (uint16_t)(row % patternRows) * patternStride + (c >> 3);
  return pgm_read_byte(&patternData[index]) & (0x80 >> (c & 7));
}

static inline bool framePixel(uint8_t row, uint8_t col) {
  return frameBuffer[row][col >> 3] & (0x80 >> (col & 7));
}

static inline void setFramePixel(uint8_t row, uint8_t col, bool on) {
  uint8_t mask = 0x80 >> (col & 7);
  if (on) frameBuffer[row][col >> 3] |= mask;
  else frameBuffer[row][col >> 3] &= ~mask;
}

void clearPanel() {
  memset(frameBuffer, 0, sizeof(frameBuffer));
}`
}

function emitDisplay(hw: Hardware, speed: SpeedControl, needs: EngineNeeds): string {
  const speedFn = speed.useController
    ? `
/** The speed dial is read continuously, so it responds while a pattern plays. */
uint16_t readSpeedDial() {
  return map(analogRead(PIN_SPEED_DIAL), 0, 1024, SPEED_MIN_MS, SPEED_MAX_MS);
}
`
    : ''
  // Only emitted when some step is not 1x: a timeline that runs entirely at the
  // base speed reads frameDelayMs directly and pays nothing for this.
  const scaleFn = needs.scaledSpeed
    ? `
/**
 * A step's speed preset applied to the base delay. Presets are carried in
 * sixteenths — ${SCALE_UNIT} is 1x, ${SCALE_UNIT / 2} is 0.5x — so this is one multiply and a
 * shift, rather than the floating point that would otherwise be linked in.
 */
uint16_t scaleStepSpeed(uint8_t scale) {
  uint32_t ms = ((uint32_t)frameDelayMs * scale) >> 4;
  if (ms < 1) return 1;
  if (ms > 65535UL) return 65535;
  return (uint16_t)ms;
}
`
    : ''
  const refreshSpeed = speed.useController ? `  frameDelayMs = readSpeedDial();\n` : ''
  // Column order is the one thing that depends on how the chain is physically
  // wired: reverse it here if the pattern comes out mirrored on the panel.
  const colLoop =
    hw.scanOrder === 'ascending'
      ? `  for (uint8_t col = 0; col < PANEL_COLS; col++) {`
      : `  for (uint8_t col = PANEL_COLS; col-- > 0;) {`
  // A PNP high-side switch conducts with its base pulled LOW, and an NPN
  // low-side switch with its base driven HIGH, so each transistor stage flips
  // the level its register has to put out. Without one, the text is unchanged.
  const columnBit =
    hw.columnDriver === 'pnp'
      ? `    // PNP column drivers switch on with a LOW base, so a lit pixel is clocked as LOW.
    digitalWrite(PIN_COLUMN_DATA, framePixel(row, col) ? LOW : HIGH);`
      : `    digitalWrite(PIN_COLUMN_DATA, framePixel(row, col) ? HIGH : LOW);`
  const rowSelect =
    hw.rowDriver === 'npn'
      ? {
          doc: `/** Row select is active-high: NPN row drivers sink the row whose base is driven HIGH. */`,
          bit: `    digitalWrite(PIN_ROW_DATA, row == activeRow ? HIGH : LOW);`,
        }
      : {
          doc: `/** Row select is active-low: every row high except the one being lit. */`,
          bit: `    digitalWrite(PIN_ROW_DATA, row == activeRow ? LOW : HIGH);`,
        }

  return `${speedFn}${scaleFn}
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
${columnBit}
    digitalWrite(PIN_COLUMN_CLOCK, HIGH);
  }
}

${rowSelect.doc}
void shiftRowSelect(uint8_t activeRow) {
  digitalWrite(PIN_LATCH, LOW);
  for (uint8_t row = 0; row < PANEL_ROWS; row++) {
    digitalWrite(PIN_ROW_CLOCK, LOW);
${rowSelect.bit}
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

function emitPatternLoading(
  needs: EngineNeeds,
  options: CodegenOptions = NO_PASSES,
): string {
  if (has(options, 'progmemPatternRead')) return emitProgmemPatternLoading(needs)
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

/**
 * Pointing at a pattern instead of copying it.
 *
 * loadPattern() used to unpack the PROGMEM bytes into a RAM buffer and then
 * tile them across it; patternPixel() now does that addressing as it reads, so
 * all that is left is recording where the pattern lives. Tiling costs nothing
 * here, so there is no `needs.tiled` branch — the modulo handles every case.
 */
function emitProgmemPatternLoading(needs: EngineNeeds): string {
  const mirrorFn = needs.mirrorPattern
    ? `

/** Reflects the pattern about its centre column, applied as it is read. */
void mirrorPattern() {
  patternMirrored = true;
}`
    : ''

  return `/**
 * Points the engine at a pattern in PROGMEM. Nothing is copied: patternPixel()
 * tiles it by modulo as it reads.
 */
void loadPattern(const uint8_t* data, uint8_t tileRows, uint8_t tileCols) {
  patternData = data;
  patternRows = tileRows;
  patternCols = tileCols;
  patternStride = (tileCols + 7) / 8;
  patternMirrored = false;
}${mirrorFn}

/**
 * Writes one panel row from one pattern row. When the pattern is narrower than
 * the panel it repeats across it, or reflects when \`mirrored\` is set.
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

/** Only the rotator(s) the timeline's band frames actually turn. */
function emitBands(needs: EngineNeeds): string {
  const parts: string[] = []

  if (needs.bandsHorizontal) {
    parts.push(`/**
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
}`)
  }

  // The columns of a band are not byte-aligned, so this one moves pixel by
  // pixel rather than borrowing the row shifters above.
  if (needs.bandsVertical) {
    parts.push(`/**
 * Splits the panel into equal vertical bands, each rotating up or down
 * independently. One bit of ${'`'}directions${'`'} per band: set means downwards.
 */
void scrollBandsVertical(uint8_t bandCount, uint8_t directions) {
  uint8_t bandWidth = PANEL_COLS / bandCount;
  for (uint8_t band = 0; band < bandCount; band++) {
    bool downwards = directions & (1 << band);
    for (uint8_t offset = 0; offset < bandWidth; offset++) {
      uint8_t col = band * bandWidth + offset;
      if (downwards) {
        bool carry = framePixel(PANEL_ROWS - 1, col);
        for (uint8_t row = PANEL_ROWS - 1; row > 0; row--) {
          setFramePixel(row, col, framePixel(row - 1, col));
        }
        setFramePixel(0, col, carry);
      } else {
        bool carry = framePixel(0, col);
        for (uint8_t row = 0; row + 1 < PANEL_ROWS; row++) {
          setFramePixel(row, col, framePixel(row + 1, col));
        }
        setFramePixel(PANEL_ROWS - 1, col, carry);
      }
    }
  }
}`)
  }

  return parts.join('\n\n')
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

  if (needs.bandsHorizontal || needs.bandsVertical) {
    // A timeline that turns bands one way only knows which rotator it means, so
    // it is called directly; only a mixed one pays for the axis argument.
    const both = needs.bandsHorizontal && needs.bandsVertical
    const axisParam = both ? 'bool vertical, ' : ''
    const turn = both
      ? `    if (vertical) scrollBandsVertical(bandCount, directions);
    else scrollBands(bandCount, directions);`
      : `    ${needs.bandsVertical ? 'scrollBandsVertical' : 'scrollBands'}(bandCount, directions);`
    parts.push(`void runBands(uint8_t bandCount, uint8_t directions, ${axisParam}uint16_t stepMs, uint16_t steps) {
  stepStartedAt = millis();
  for (uint16_t step = 0; step < steps; step++) {
    holdFrame(stepMs);
${turn}
  }
}`)
  }

  return parts.join('\n\n')
}

export function emitEngine(
  g: Grid,
  hw: Hardware,
  speed: SpeedControl,
  needs: EngineNeeds,
  options: CodegenOptions = NO_PASSES,
): string {
  const parts = [
    emitBitHelpers(options),
    emitDisplay(hw, speed, needs),
    emitPatternLoading(needs, options),
    emitShifts(g),
    emitBands(needs),
    emitMotions(needs),
  ]
  return parts.filter(Boolean).join('\n\n')
}
