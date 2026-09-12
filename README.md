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
- **Movement** - `runScroll()` in eight directions, `runHold()`, or bands: `scrollBands()` where
  each horizontal band of rows moves left or right independently, and `scrollBandsVertical()` where
  each vertical band of columns moves up or down.
- **Pins** - configurable under *Wiring & pins*, defaulting to the example wiring
  (`data1=2, str1=3, clock1=4, data2=5, clock2=6`).
- **Speed** - a project-level decision under *Speed*. Either the build has an analog preset
  controller fitted, in which case the reading on its pin is mapped onto a millisecond range
  (1-5000 ms, slowest end always above the fastest) and `readSpeedDial()` is emitted, or it has
  not, in which case one step delay is compiled in. Either way that is the *base*, and each frame plays at a multiple of it - 0.5x,
  1x, 2x - so turning the knob rescales the whole timeline and keeps its relative timing. A
  frame can instead pin a delay of its own in milliseconds, which ignores the base and the
  controller both. The step table carries only the columns the timeline uses: nothing when every
  frame follows the base, a byte per step for presets, two more only where a delay is pinned.

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

A browser cannot run a compiler, so the real figures come from a small HTTP server on the user's own
machine that shells out to `arduino-cli`. There are two of them, speaking the same API under
`/api/arduino`, and `src/lib/arduinoBridge.ts` does not care which one answers:

| | Where it runs | Who it is for |
| --- | --- | --- |
| `plugins/arduinoCli.ts` | Vite middleware, same origin, `serve` only | Working on this repo |
| `public/bridge/led-bridge.ps1` | `127.0.0.1:8787`, Windows PowerShell 5.1 | Anyone on the deployed site |
| `public/bridge/led-bridge.sh` | `127.0.0.1:8787`, bash + Python 3 | ditto, macOS and Linux |

All three find the CLI the same way — `ARDUINO_CLI_PATH`, then `PATH`, then the Arduino IDE 2.x
bundle — and report every board that CLI has installed. The two scripts additionally install
`arduino-cli` and the `arduino:avr` core if they are missing, into the user's own home directory,
with no admin rights and no Node.js; **Set up compiling** in the Memory tab hands out a copy with
the site's origin already stamped into it. See [Compiling from the deployed
site](#compiling-from-the-deployed-site).

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

## Optimising for low memory

The **Memory** tab has an *Optimise for low memory* panel with three levels. **Off** is the default
and emits exactly what it always did. **Safe** keeps one readable hex table per frame.
**Aggressive** also allows layouts that trade that legibility for bytes.

*Find the smallest build* does not guess. It compiles candidates with `arduino-cli`, reads the real
Flash and SRAM figures back, and keeps whichever combination actually won — a baseline, then each
applicable pass alone, then the union of the winners, then a hill-climb that tries removing and
re-adding members until nothing improves. Passes that cannot apply are never compiled at all: a
timeline with no repeated artwork has nothing for pattern sharing to find, and counting answers
that in microseconds.

Measuring matters because guessing is unreliable here — avr-gcc links with `--gc-sections`, so code
you thought you were saving may already have been stripped. Measured on `arduino:avr:uno`:

| Project | Flash | SRAM |
| --- | --- | --- |
| 8x32, one tiled 8x8 design | -370 B (-14%) | -25 B (-32%) |
| 16x48, two full-panel designs | -134 B (-5%) | **-89 B (-43%)** |
| 20x48 half-width, mirrored | -128 B (-5%) | -53 B (-27%) |
| 16x48, a 24-design library | **-1554 B (-30%)** | -89 B (-43%) |

The largest single win is dropping the `pattern[]` RAM buffer: patterns are addressed straight in
PROGMEM, and the two modulos that read them *are* the tiling, so `loadPattern()` no longer copies or
repeats anything. It costs seven bytes of descriptor and saves a whole bit-packed buffer.

### The output cannot change

Every candidate is replayed against `src/lib/simulate.ts` — the same simulator the preview runs, and
which is never modified to accommodate a pass — and compared frame by frame, both on the real
project and across the 400-timeline fuzz corpus. A candidate that differs anywhere is rejected
before it costs a compile.

```bash
npm run verify            # engine, every pass, and the unchanged default output
npm run optimize          # search the sample projects end to end
npm run measure-passes    # what each pass saves, per project
```

`verify-optimizations.mjs` also asserts `mirrorApplies` and `needsPreload` directly. Those two are
imported by the generator *from* the simulator, so a bug in either changes both sides of the diff
identically and passes — which it demonstrably does: breaking `mirrorApplies` on purpose still
leaves all 6517 frames reported identical, and only the direct assertions catch it.

## Compiling from the deployed site

The deployed app is a static site, so measuring and optimising need a compiler the visitor runs
themselves. **Set up compiling**, in the Memory tab, is the whole of that story: it hands out a
single self-contained script for their platform with this site's origin already stamped into it,
and the page finds it on `127.0.0.1` afterwards without being told where to look.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://YOUR-SITE/bridge/led-bridge.ps1'))) -Origin 'https://YOUR-SITE'"
```

```bash
curl -fsSL https://YOUR-SITE/bridge/led-bridge.sh | bash -s -- --origin https://YOUR-SITE
```

The first run does what a person would otherwise do by hand: looks for `arduino-cli`, downloads the
official build into `%LOCALAPPDATA%` or `~/.local/share` if there is none, offers to put it on
`PATH`, installs the `arduino:avr` core, and starts serving. Nothing needs admin rights, nothing is
installed system-wide, and deleting one folder undoes all of it. Neither script needs Node.js —
Windows PowerShell 5.1 ships with Windows, and the POSIX script's server is the Python 3 that
macOS and every mainstream Linux already have.

**Why it is safe to run a server for a web page to talk to.** It binds to `127.0.0.1` only, so it
is never reachable from the network. CORS is enforced by the browser, but the browser is not
trusted to be the only caller: the `Origin` header is checked on the server too, and a request from
any site but the one stamped into the script is refused with a 403 before a compiler is invoked.
The client also sends a header it does not read, which is enough to make every request non-simple
and force a preflight, so a hostile page cannot even reach the routes. Chrome's Private Network
Access preflight is answered as well, since a page on the public internet reaching `127.0.0.1` needs
that.

**Browsers.** Chrome, Edge and Firefox treat `127.0.0.1` as trustworthy and allow this from an
HTTPS page. Safari does not, and the dialog says so rather than letting the connection fail
quietly.

## Saving work

Patterns autosave to `localStorage`. **Save project** / **Open project** export and import a
`.ledproj.json` file.

## Developer

Built by **Dushan Pramod** — [dushanpramod@gmail.com](mailto:dushanpramod@gmail.com)
