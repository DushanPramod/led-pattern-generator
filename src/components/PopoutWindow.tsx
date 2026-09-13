import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PortalContainerContext } from '@/components/ui/portal-container'

const WINDOW_NAME = 'led-preview'

// StrictMode mounts, unmounts and remounts straight away. Closing is deferred
// a tick so that remount picks the same window back up instead of reopening it.
let pendingClose: ReturnType<typeof setTimeout> | undefined

/** Everything in the main head that styles the page. */
function styleNodes(doc: Document) {
  return Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]'))
}

/**
 * Renders its children into a separate browser window, so it can be dragged
 * to another screen. The children stay part of this React tree: state,
 * context and updates carry straight across.
 */
export function PopoutWindow({
  title,
  onOpen,
  onClose,
  children,
}: {
  title: string
  onOpen?: (win: Window) => void
  /** The window was closed, or the browser refused to open it (`blocked`). */
  onClose: (blocked: boolean) => void
  children: ReactNode
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const winRef = useRef<Window | null>(null)
  const handlers = useRef({ onOpen, onClose })
  useEffect(() => {
    handlers.current = { onOpen, onClose }
  })

  useEffect(() => {
    clearTimeout(pendingClose)
    const win = window.open('', WINDOW_NAME, 'popup,width=1280,height=800')
    if (!win) {
      handlers.current.onClose(true)
      return
    }
    const doc = win.document

    // Mirror the page's stylesheets, re-syncing when Vite injects or updates one.
    const copied: Node[] = []
    const syncStyles = () => {
      for (const node of copied.splice(0)) doc.head.removeChild(node)
      for (const node of styleNodes(document)) {
        const clone = node.cloneNode(true) as HTMLElement
        // about:blank may not resolve the app's relative asset paths.
        if (node instanceof HTMLLinkElement) clone.setAttribute('href', node.href)
        doc.head.appendChild(clone)
        copied.push(clone)
      }
    }
    // The theme lives as a class on <html>.
    const syncTheme = () => {
      doc.documentElement.className = document.documentElement.className
    }

    doc.head.replaceChildren()
    doc.body.replaceChildren()
    const meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    doc.head.appendChild(meta)
    syncStyles()
    syncTheme()
    doc.body.style.margin = '0'
    const container = doc.createElement('div')
    doc.body.appendChild(container)

    const headObserver = new MutationObserver(syncStyles)
    headObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
    const themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const onHide = () => handlers.current.onClose(false)
    const onMainUnload = () => win.close()
    win.addEventListener('pagehide', onHide)
    window.addEventListener('pagehide', onMainUnload)

    winRef.current = win
    // The window only exists once opened here, so the portal target is set from the effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setRoot(container)
    handlers.current.onOpen?.(win)
    win.focus()

    return () => {
      headObserver.disconnect()
      themeObserver.disconnect()
      win.removeEventListener('pagehide', onHide)
      window.removeEventListener('pagehide', onMainUnload)
      winRef.current = null
      setRoot(null)
      pendingClose = setTimeout(() => win.close(), 0)
    }
  }, [])

  useEffect(() => {
    if (winRef.current) winRef.current.document.title = title
  }, [root, title])

  if (!root) return null
  return createPortal(
    <PortalContainerContext.Provider value={root.ownerDocument.body}>{children}</PortalContainerContext.Provider>,
    root,
  )
}
