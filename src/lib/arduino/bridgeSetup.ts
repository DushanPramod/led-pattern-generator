/**
 * Handing the user the helper that does the compiling.
 *
 * The deployed app is a static site: it cannot compile anything, and it cannot
 * run a server. What it can do is give the visitor a script that runs on their
 * own machine, and then talk to it over 127.0.0.1.
 *
 * The scripts ship with the origin they trust left as a placeholder, because a
 * static file cannot know where it is being served from. The copy handed out
 * here has this page's own origin substituted in, so the helper accepts this
 * app and refuses every other site that tries to reach it.
 */

export type HostOs = 'windows' | 'macos' | 'linux'

export const BRIDGE_SCRIPT_PATH: Record<HostOs, string> = {
  windows: '/bridge/led-bridge.ps1',
  macos: '/bridge/led-bridge.sh',
  linux: '/bridge/led-bridge.sh',
}

export const BRIDGE_SCRIPT_NAME: Record<HostOs, string> = {
  windows: 'led-bridge.ps1',
  macos: 'led-bridge.sh',
  linux: 'led-bridge.sh',
}

const ORIGIN_PLACEHOLDER = '__APP_ORIGIN__'

export const OS_LABEL: Record<HostOs, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
}

/** Best guess at what the visitor is on, only used to preselect a tab. */
export function detectOs(): HostOs {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const hint = `${nav.userAgentData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase()
  if (hint.includes('win')) return 'windows'
  if (hint.includes('mac') || hint.includes('iphone') || hint.includes('ipad')) return 'macos'
  return 'linux'
}

export function appOrigin(): string {
  return window.location.origin
}

/** The command that fetches and runs the helper in one go, origin included. */
export function oneLiner(os: HostOs): string {
  const origin = appOrigin()
  const url = `${origin}${BRIDGE_SCRIPT_PATH[os]}`
  if (os === 'windows') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm '${url}'))) -Origin '${origin}'"`
  }
  return `curl -fsSL ${url} | bash -s -- --origin ${origin}`
}

/** The command that runs a copy already downloaded, which needs no arguments. */
export function runDownloaded(os: HostOs): string {
  if (os === 'windows') {
    return 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\led-bridge.ps1'
  }
  return 'bash ~/Downloads/led-bridge.sh'
}

/**
 * Fetches the script, stamps this origin into it and saves it.
 *
 * Throws with something worth showing if the file cannot be fetched — the
 * usual cause is an offline reload from the service worker cache.
 */
export async function downloadBridgeScript(os: HostOs): Promise<void> {
  const res = await fetch(BRIDGE_SCRIPT_PATH[os], { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not fetch the helper script (${res.status}).`)
  const template = await res.text()

  // Every occurrence, so the comment that explains the line stays truthful.
  const script = template.split(ORIGIN_PLACEHOLDER).join(appOrigin())

  const url = URL.createObjectURL(new Blob([script], { type: 'text/plain' }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = BRIDGE_SCRIPT_NAME[os]
    document.body.append(link)
    link.click()
    link.remove()
  } finally {
    // Revoking straight away can beat the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/**
 * Safari refuses a plain-HTTP request from an HTTPS page even when it goes to
 * 127.0.0.1, which the other browsers allow. Nothing the helper can do about
 * it, so the dialog says so rather than letting the connection quietly fail.
 */
export function browserBlocksLocalhost(): boolean {
  if (window.location.protocol !== 'https:') return false
  const ua = navigator.userAgent
  return /safari/i.test(ua) && !/chrome|chromium|crios|edg|android/i.test(ua)
}
