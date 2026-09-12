import { useState } from 'react'
import { AboutDialog } from './AboutDialog'
import { Button } from './ui/button'

export function AppFooter() {
  const [about, setAbout] = useState(false)
  return (
    <footer className="border-t pt-1 pb-2 text-center">
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbout(true)}>
        Built by Dushan Pramod
      </Button>
      <AboutDialog open={about} onClose={() => setAbout(false)} />
    </footer>
  )
}
