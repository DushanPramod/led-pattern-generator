import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { ARDUINO_CLI_INSTALL_URL, BRIDGE_PORTS } from '../lib/arduino/arduinoBridge'
import type { BridgeStatus } from '../lib/arduino/arduinoBridge'
import {
  BRIDGE_SCRIPT_NAME,
  OS_LABEL,
  appOrigin,
  browserBlocksLocalhost,
  detectOs,
  downloadBridgeScript,
  oneLiner,
  runDownloaded,
} from '../lib/arduino/bridgeSetup'
import type { HostOs } from '../lib/arduino/bridgeSetup'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { cn } from '../lib/utils'

const OS_ORDER: HostOs[] = ['windows', 'macos', 'linux']

/** What each platform needs said differently. Everything else is shared. */
const GUIDE: Record<
  HostOs,
  {
    terminal: string
    installDir: string
    profile: string
    notes: string[]
  }
> = {
  windows: {
    terminal: 'Press Win+R, type powershell, press Enter.',
    installDir: '%LOCALAPPDATA%\\led-pattern-generator\\arduino-cli',
    profile: 'your user PATH',
    notes: [
      'Windows PowerShell 5.1 is already on your machine — nothing else to install first.',
      'The -ExecutionPolicy Bypass part applies to that one command only; your machine-wide setting is not changed.',
    ],
  },
  macos: {
    terminal: 'Open Terminal (Command+Space, type Terminal, press Enter).',
    installDir: '~/.local/share/led-pattern-generator/arduino-cli',
    profile: '~/.zshrc',
    notes: [
      'The server is the python3 that comes with the Xcode command line tools. If it is missing, the script tells you the one command that installs it.',
      'Nothing is installed with sudo, and nothing is put in /usr/local.',
    ],
  },
  linux: {
    terminal: 'Open your terminal.',
    installDir: '~/.local/share/led-pattern-generator/arduino-cli',
    profile: '~/.bashrc',
    notes: [
      'The server is python3, which your distribution almost certainly has. If not, the script prints the exact install command for your package manager.',
      'Nothing is installed with sudo, and nothing is put outside your home directory.',
    ],
  },
}

// ---------------------------------------------------------------------------

function CommandBox({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    } catch {
      // Clipboard access can be refused; the text is selectable either way.
    }
  }, [command])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex items-stretch gap-1.5">
      <pre className="m-0 min-w-0 grow overflow-x-auto rounded-md border bg-code p-2 text-[0.72rem] leading-relaxed">
        <code>{command}</code>
      </pre>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 self-start"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5">
      <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-accent text-[0.72rem] font-semibold">
        {number}
      </span>
      <strong className="self-center text-sm">{title}</strong>
      <div className="col-start-2 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------

export function BridgeSetupDialog({
  open,
  onOpenChange,
  status,
  onRecheck,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: BridgeStatus
  onRecheck: () => Promise<void>
}) {
  const [os, setOs] = useState<HostOs>(detectOs)
  const [checking, setChecking] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const guide = GUIDE[os]
  const origin = appOrigin()
  const safariWarning = useMemo(() => browserBlocksLocalhost(), [])

  const download = useCallback(async () => {
    setDownloadError(null)
    try {
      await downloadBridgeScript(os)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err))
    }
  }, [os])

  const recheck = useCallback(async () => {
    setChecking(true)
    try {
      await onRecheck()
    } finally {
      setChecking(false)
    }
  }, [onRecheck])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        The dialog lays its children out in a grid, and a grid track sizes
        itself to its widest content — the setup command is one long unbreakable
        string, which would otherwise stretch the whole dialog past the screen.
        Capping the track at the container width is what lets the command scroll
        inside its own box instead.
      */}
      <DialogContent className="max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Measure memory for real</DialogTitle>
          <DialogDescription>
            {status.state === 'ready' ? (
              status.via === 'dev' ? (
                <>
                  The dev server is compiling for you, so the figures in the Memory tab are the
                  compiler&rsquo;s own. Anyone using the deployed site instead runs the helper
                  below — the steps are here so you can see what they get.
                </>
              ) : (
                <>
                  The helper is running and this page is talking to it, so the figures in the
                  Memory tab are the compiler&rsquo;s own. What it does, where it put things and
                  what to check if it stops answering are all below.
                </>
              )
            ) : (
              <>
                Flash is estimated until something compiles the sketch, and a browser cannot. Run a
                small helper on your own computer and this page will talk to it directly: it finds
                arduino-cli, installs it if you have not got it, and reports the compiler&rsquo;s
                own figures. No admin rights, and no Node.js.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <StatusStrip status={status} />

        <Tabs value={os} onValueChange={(next) => setOs(next as HostOs)}>
          <TabsList className="w-full">
            {OS_ORDER.map((id) => (
              <TabsTrigger key={id} value={id} className="grow">
                {OS_LABEL[id]}
              </TabsTrigger>
            ))}
          </TabsList>

          {OS_ORDER.map((id) => (
            <TabsContent key={id} value={id} className="mt-1">
              {id === os && (
                <ol className="m-0 flex list-none flex-col gap-4 p-0">
                  <Step number={1} title="Get the helper">
                    <p className="m-0">
                      One command does the whole thing — fetch it and run it. {guide.terminal} Then
                      paste this in:
                    </p>
                    <CommandBox command={oneLiner(os)} label="the setup command" />
                    <p className="m-0">
                      Would rather read it first? Download it, open it in any editor, then run it.
                      The downloaded copy already knows this site&rsquo;s address, so it needs no
                      arguments.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void download()}>
                        <DownloadIcon />
                        Download {BRIDGE_SCRIPT_NAME[os]}
                      </Button>
                      <span className="text-[0.72rem]">then</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[0.72rem]">
                        {runDownloaded(os)}
                      </code>
                    </div>
                    {downloadError && (
                      <p className="m-0 text-destructive">{downloadError}</p>
                    )}
                  </Step>

                  <Step number={2} title="Let it set itself up">
                    <p className="m-0">The first run does everything you would otherwise do by hand:</p>
                    <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                      <li>
                        Looks for <code className="rounded bg-muted px-1 py-0.5">arduino-cli</code> on
                        your PATH, inside an Arduino IDE 2.x installation, and at{' '}
                        <code className="rounded bg-muted px-1 py-0.5">ARDUINO_CLI_PATH</code>. If you
                        already have it, it is used as-is and nothing is downloaded.
                      </li>
                      <li>
                        Otherwise it downloads the official build (~30 MB) into{' '}
                        <code className="rounded bg-muted px-1 py-0.5">{guide.installDir}</code> and
                        offers to add it to {guide.profile}. Say no and the helper still works —
                        it uses the full path.
                      </li>
                      <li>
                        Installs the <code className="rounded bg-muted px-1 py-0.5">arduino:avr</code>{' '}
                        board package if it is not there yet — about 50 MB, once. That is what makes
                        an Uno or Nano compilable at all.
                      </li>
                      <li>
                        Starts listening on{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                          http://127.0.0.1:{BRIDGE_PORTS[0]}
                        </code>{' '}
                        and prints <em>Bridge is running</em>. Leave that window open.
                      </li>
                    </ul>
                    {guide.notes.map((note) => (
                      <p key={note} className="m-0">
                        {note}
                      </p>
                    ))}
                  </Step>

                  <Step number={3} title="Come back to this page">
                    <p className="m-0">
                      The page finds the helper on its own, on reload or when you press this:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={status.state === 'ready' ? 'outline' : 'default'}
                        onClick={() => void recheck()}
                        disabled={checking}
                      >
                        {checking ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
                        {checking ? 'Looking…' : status.state === 'ready' ? 'Check again' : 'Connect'}
                      </Button>
                      {status.state === 'ready' && (
                        <span className="text-[0.72rem] text-primary">
                          Connected. Close this and press <strong>Check memory</strong>.
                        </span>
                      )}
                    </div>
                  </Step>
                </ol>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {safariWarning && (
          <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/5 p-2.5 text-xs leading-relaxed">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warn" />
            <p className="m-0">
              <strong>Safari will block this.</strong> It refuses plain-HTTP requests to 127.0.0.1
              from a page served over HTTPS, which Chrome, Edge and Firefox allow. Open this app in
              one of those to use the helper.
            </p>
          </div>
        )}

        <Separator />
        <Troubleshooting os={os} origin={origin} />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function StatusStrip({ status }: { status: BridgeStatus }) {
  const ready = status.state === 'ready'
  const checking = status.state === 'checking'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border p-2.5 text-xs',
        ready && 'border-primary/40 bg-accent',
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          ready ? 'bg-primary' : checking ? 'bg-muted-foreground' : 'bg-warn',
        )}
        aria-hidden
      />
      {checking && <span>Looking for a compiler…</span>}
      {ready && (
        <>
          <strong>Connected</strong>
          <span className="text-muted-foreground">
            arduino-cli {status.version} via{' '}
            {status.via === 'dev' ? 'the local dev server' : status.endpoint.replace('/api/arduino', '')}
          </span>
        </>
      )}
      {status.state === 'absent' && (
        <span className="text-muted-foreground">
          {status.kind === 'no-cli'
            ? 'A compile bridge is running, but it cannot find arduino-cli. Restart it and let it install one.'
            : 'Not connected — Flash below is an estimate.'}
        </span>
      )}
    </div>
  )
}

function Troubleshooting({ os, origin }: { os: HostOs; origin: string }) {
  const items: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: 'The helper says it is running, but this page still cannot see it',
      a: (
        <>
          Check that the address it printed is one of{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            127.0.0.1:{BRIDGE_PORTS[0]}–{BRIDGE_PORTS[BRIDGE_PORTS.length - 1]}
          </code>{' '}
          — those are the only ports this page looks at. Also check it printed{' '}
          <code className="rounded bg-muted px-1 py-0.5">{origin}</code> as an allowed origin; if it
          says none was configured, you ran a copy without the address baked in. Use the command in
          step 1, which passes it explicitly.
        </>
      ),
    },
    {
      q: 'Chrome asks for permission to reach a device on your local network',
      a: <>Allow it. That prompt is Chrome guarding requests from a public page to 127.0.0.1; the helper answers the check it requires, but you still have to say yes.</>,
    },
    {
      q: 'A firewall prompt appeared',
      a: (
        <>
          The helper only ever binds to 127.0.0.1, which is your own machine and never reachable
          from the network, so you can deny any prompt asking to open it up.
        </>
      ),
    },
    {
      q: 'Compiling fails with a message about the platform not being installed',
      a: (
        <>
          The <code className="rounded bg-muted px-1 py-0.5">arduino:avr</code> package did not
          finish installing. Stop the helper and run{' '}
          <code className="rounded bg-muted px-1 py-0.5">arduino-cli core install arduino:avr</code>{' '}
          yourself, then start it again.
        </>
      ),
    },
    {
      q: 'You already have arduino-cli somewhere unusual',
      a: (
        <>
          Set <code className="rounded bg-muted px-1 py-0.5">ARDUINO_CLI_PATH</code> to the
          executable before starting the helper, and it will use that one. Installing it by hand
          works too:{' '}
          <a
            className="font-medium underline underline-offset-2 hover:text-primary"
            href={ARDUINO_CLI_INSTALL_URL}
            target="_blank"
            rel="noreferrer"
          >
            the official instructions
          </a>
          .
        </>
      ),
    },
  ]

  if (os === 'windows') {
    items.push({
      q: 'Windows says running scripts is disabled on this system',
      a: (
        <>
          Start it the way step 1 does, with{' '}
          <code className="rounded bg-muted px-1 py-0.5">-ExecutionPolicy Bypass</code>. That
          applies to the one command and changes nothing permanently. Double-clicking the{' '}
          <code className="rounded bg-muted px-1 py-0.5">.ps1</code> file opens it in Notepad
          instead of running it, which is Windows behaving normally.
        </>
      ),
    })
  } else {
    items.push({
      q: 'Permission denied when running the downloaded file',
      a: (
        <>
          Run it through bash rather than as a program:{' '}
          <code className="rounded bg-muted px-1 py-0.5">bash led-bridge.sh</code>. No{' '}
          <code className="rounded bg-muted px-1 py-0.5">chmod</code> needed.
        </>
      ),
    })
  }

  items.push({
    q: 'What it does with your data, and how to remove it',
    a: (
      <>
        Sketches are compiled in your temp folder and nothing leaves your machine — the page sends
        the sketch to 127.0.0.1 and gets two numbers back. Stop the helper with Ctrl+C; delete the
        folder it installed arduino-cli into to undo the install completely.
      </>
    ),
  })

  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium select-none">If something goes wrong</summary>
      <dl className="m-0 mt-2 flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={item.q} className="flex flex-col gap-0.5">
            <dt className="font-medium">{item.q}</dt>
            <dd className="m-0 leading-relaxed text-muted-foreground">{item.a}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
