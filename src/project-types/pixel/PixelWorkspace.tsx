import { Construction } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { rememberLastProject } from '@/core/lastProject'
import { useIncomingProjectFile } from '@/core/navigation'
import type { ProjectMeta } from '@/core/projectTypes'
import { pixelType } from './index'

const STORAGE_KEY = 'budurasmala:pixel:v1'

function loadMeta(): ProjectMeta {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProjectMeta>
      return { name: parsed.name ?? 'Untitled', description: parsed.description ?? '' }
    }
  } catch {
    // Fall through to an untitled project.
  }
  return { name: 'Untitled', description: '' }
}

/** Placeholder until the Pixel Budurasmala editor is built. */
export default function PixelWorkspace() {
  const incoming = useIncomingProjectFile(pixelType.id)
  const [meta, setMeta] = useState<ProjectMeta>(() => incoming.file?.meta ?? loadMeta())
  const [seenKey, setSeenKey] = useState(incoming.key)
  if (incoming.key !== seenKey && incoming.file) {
    setSeenKey(incoming.key)
    setMeta(incoming.file.meta)
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
    } catch {
      // Not worth interrupting the user over.
    }
    rememberLastProject({ type: pixelType.id, name: meta.name })
  }, [meta])

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1680px] flex-col gap-4 p-4">
      <AppHeader title={meta.name || 'Untitled'} subtitle={pixelType.label} />

      <section className="flex grow flex-col items-center justify-center gap-3 rounded-xl border bg-card p-12 text-center">
        <Construction className="size-10 text-muted-foreground" />
        <h2 className="m-0 text-lg font-semibold">The Pixel Budurasmala editor is coming soon</h2>
        {meta.description && <p className="m-0 max-w-prose text-muted-foreground">{meta.description}</p>}
      </section>

      <AppFooter />
    </div>
  )
}
