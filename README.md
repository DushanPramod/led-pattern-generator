# LED Pattern Generator

Draw LED matrix patterns in the browser and download a ready-to-flash Arduino sketch.

The generated code drives the same hardware as the hand-written sketches in `../Matrix8x32`,
`../Matrix16x32`, `../Matrix16x48` and `../Matrix20x48` — two 74HC595 chains sharing a latch, one
shifting column bits and one selecting rows — with the same refresh and timing behaviour, but
written to be read: named constants, bit-packed buffers and patterns stored as data.

## Running it

```bash
npm install
npm run dev
```

## How a pattern becomes code

Every frame you draw becomes a bit-packed `PROGMEM` table, and the timeline becomes a table of steps
that a small player walks:

```c
// Hourglass - 8x8, 16 lit
const uint8_t PATTERN_HOURGLASS[] PROGMEM = {
  0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81,
};

const Step STEPS[] PROGMEM = {
  { PATTERN_HOURGLASS, 8, 8, 0, MOTION_SCROLL, 1, 0, 0, 0, 8, 0 },   // up, 8 steps
};

const Sequence SEQUENCES[] PROGMEM = {
  { 0, 1, 10 },   // Scroll up, repeated 10x
};
```

The hex is legible as the art itself, which makes patterns easy to tweak by hand afterwards.

- **Panel size** - any rows x columns; presets match the existing panels. The SRAM figure updates
  live and warns when a panel will not fit an Uno.
- **Tile** - draw a small block and `loadPattern()` repeats it across the panel. Only divisors of
  the source size are offered, since tiling repeats whole copies.
- **Half-width source** - as in `Matrix20x48`: store the pattern `cols/2` wide and let the panel
  repeat or reflect it, halving what a pattern costs.
- **Movement** - `runScroll()` in eight directions, `runHold()`, or `scrollBands()` where each
  horizontal band moves left or right independently.
- **Pins** - configurable under *Wiring & pins*, defaulting to the example wiring
  (`data1=2, str1=3, clock1=4, data2=5, clock2=6`) with the speed dial on `A0`.

## Why it is built this way

Two measured decisions, both checked with `arduino-cli`.

**Buffers are bit-packed**, one bit per LED instead of one `boolean` byte:

| Panel | one byte per LED | bit-packed |
| --- | --- | --- |
| 8x32 | 527 B | **79 B** |
| 16x48 | 1551 B | **207 B** |
| 20x48 half-width | 1455 B | **195 B** |

**Patterns live in PROGMEM** rather than being emitted as a statement per lit pixel. Benchmarked on
`arduino:avr:uno`, an 8x8 pattern costs **10 bytes of Flash as data against 54 as code**, so a
library of 120 patterns fits in 2.2 KB instead of 7.5 KB. It costs a slightly larger fixed base
(~2.4 KB), which pays for itself after a handful of patterns.

Timing is deliberately unchanged: each step holds while `refreshPanel()` multiplexes the rows, so
brightness and refresh behaviour on real hardware match the originals.

## Verification

`src/lib/simulate.ts` is the behavioural spec - one byte per pixel, straightforward, and verified
function by function against the hand-written sketches (18/18 identical for `Matrix8x32`, 17/18 for
`Matrix16x48`, 18/19 for `Matrix20x48`; the exception each time is `sr1w`, whose column order
depends on how the chain is physically wired). The preview runs that simulator, so what plays on
screen is what the panel does.

The generated C cannot be executed here - there is no AVR emulator - so two scripts stand in:

```bash
node scripts/verify-engine.mjs     # 400 timelines, 6517 frames, 7 geometries
node scripts/calibrate-flash.mjs   # refits the offline memory model
```

`verify-engine.mjs` re-implements the emitted engine in JS, operation for operation, and diffs every
frame against the simulator across all motions, tile sizes, mirroring, half-width panels and column
counts that are not multiples of 8. It passes on all 6517 frames, and that is what backs the
bit-packed carry propagation and padding logic.

It has already earned its keep: it caught a real off-by-one where the preview advanced band frames
one shift before rendering, while `runBands()` on hardware renders first and shifts afterwards.

## Checking memory

The **Memory** tab picks a board and reports how much Flash and SRAM the generated sketch needs.

Running `npm run dev` exposes `POST /api/arduino/compile`, a Vite middleware
(`plugins/arduinoCli.ts`) that shells out to `arduino-cli` and reports the real figures. It finds
the CLI on `PATH`, in the Arduino IDE 2.x bundle, or at `ARDUINO_CLI_PATH`, and lists every board
that CLI has installed. The route only exists under `serve` — the production build is untouched, so
the deployed site falls back to the offline estimate and says so.

|         | Offline estimate | With the compiler |
| --- | --- | --- |
| SRAM    | **Exact** | Measured |
| Flash   | ±10% | Measured |

SRAM is exact because the generator knows every global it emits: both bit-packed buffers, 6 bytes of
counters, and 9 the Arduino core uses. That 9 held across all 26 calibration samples and on every
held-out geometry since.

Flash gets a range. The model prices pattern bytes, timeline steps and each optional engine piece
the timeline pulls in, and the fitted coefficients are physically meaningful: 1.01 bytes of Flash
per byte of PROGMEM pattern, and 13.4 per step, matching the `Step` struct size.

## Saving work

Patterns autosave to `localStorage`. **Save project** / **Open project** export and import a
`.ledproj.json` file.

## Developer

Built by **Dushan Pramod** — [dushanpramod@gmail.com](mailto:dushanpramod@gmail.com)
