import { useEffect, useRef } from 'react'

const EMAIL = 'dushanpramod@gmail.com'

/** Credit, version and where to send bugs. Opened from the footer. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog ref={dialog} className="about" onClose={onClose} onClick={(e) => {
      if (e.target === dialog.current) onClose()
    }}>
      <div className="about-body">
        <h2>LED Pattern Generator</h2>
        <p className="version">Version {__APP_VERSION__}</p>

        <p className="by">Built by Dushan Pramod</p>

        <p className="note">
          Found a bug, or thought of something that would make this better? Send it over — bug
          reports and improvement suggestions are both welcome.
        </p>

        <a className="mail" href={`mailto:${EMAIL}?subject=${encodeURIComponent('LED Pattern Generator — feedback')}`}>
          {EMAIL}
        </a>

        <div className="about-actions">
          <button type="button" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </dialog>
  )
}
