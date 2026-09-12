export type BoardLimits = {
  fqbn: string
  name: string
  flashMax: number
  sramMax: number
  mcu?: string
}

/**
 * Offline fallback. The dev bridge reports every installed board with its real
 * build properties; this table is what the deployed static site has to work
 * with, so it covers the boards these panels are actually driven by.
 */
export const FALLBACK_BOARDS: BoardLimits[] = [
  { fqbn: 'arduino:avr:uno', name: 'Arduino UNO', flashMax: 32256, sramMax: 2048, mcu: 'atmega328p' },
  { fqbn: 'arduino:avr:nano', name: 'Arduino Nano', flashMax: 30720, sramMax: 2048, mcu: 'atmega328p' },
  { fqbn: 'arduino:avr:mega', name: 'Arduino Mega or Mega 2560', flashMax: 253952, sramMax: 8192, mcu: 'atmega2560' },
  { fqbn: 'arduino:avr:leonardo', name: 'Arduino Leonardo', flashMax: 28672, sramMax: 2560, mcu: 'atmega32u4' },
  { fqbn: 'arduino:avr:micro', name: 'Arduino Micro', flashMax: 28672, sramMax: 2560, mcu: 'atmega32u4' },
  { fqbn: 'arduino:avr:pro', name: 'Arduino Pro or Pro Mini', flashMax: 30720, sramMax: 2048, mcu: 'atmega328p' },
  { fqbn: 'arduino:avr:mini', name: 'Arduino Mini', flashMax: 28672, sramMax: 2048, mcu: 'atmega328p' },
  { fqbn: 'arduino:avr:megaADK', name: 'Arduino Mega ADK', flashMax: 253952, sramMax: 8192, mcu: 'atmega2560' },
]

export const DEFAULT_FQBN = 'arduino:avr:uno'

export function findBoard(list: BoardLimits[], fqbn: string): BoardLimits | undefined {
  return list.find((b) => b.fqbn === fqbn)
}

export function formatBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB` : `${n} B`
}
