import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

const EMAIL = 'dushanpramod@gmail.com'

/** Credit, version and where to send bugs. Opened from the footer. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LED Pattern Generator</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
        <p className="text-sm">Built by Dushan Pramod</p>

        <p className="text-sm text-muted-foreground">
          Found a bug, or thought of something that would make this better? Send it over — bug
          reports and improvement suggestions are both welcome.
        </p>

        <a
          className="text-sm text-primary underline-offset-4 hover:underline"
          href={`mailto:${EMAIL}?subject=${encodeURIComponent('LED Pattern Generator — feedback')}`}
        >
          {EMAIL}
        </a>

        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
