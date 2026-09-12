import { Redo2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { CodeView } from './components/CodeView'
import { DesignPresets } from './components/DesignPresets'
import { FrameCanvas } from './components/FrameCanvas'
import { FrameList } from './components/FrameList'
import { MemoryCheck } from './components/MemoryCheck'
import { MotionControls } from './components/MotionControls'
import { PanelSetup } from './components/PanelSetup'
import { Preview, type PreviewView } from './components/Preview'
import { ThemeToggle } from './components/ThemeToggle'
import { TileControls } from './components/TileControls'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog'
import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { deserialize, serialize } from './lib/grid'
import { starterProject } from './state/defaults'
import { ProjectProvider } from './state/projectStore'
import { useFrameActions, useProject } from './state/useProject'
import type { SerializedProject } from './types'

function Workspace() {
  const { project, selectedFrame, canUndo, canRedo, dispatch } = useProject()
  const { setCells } = useFrameActions(selectedFrame?.id ?? null)
  const [tab, setTab] = useState<'preview' | 'code' | 'memory'>('preview')
  // Only the open tab is mounted, so the preview's viewing options are kept
  // here and survive a trip to the code tab.
  const [previewView, setPreviewView] = useState<PreviewView>({
    shape: 'flat',
    sweep: 270,
    rimFirst: false,
    rate: 1,
    soloFrame: false,
  })
  const [about, setAbout] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const exportProject = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(serialize(project), null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name.replace(/\s+/g, '-').toLowerCase() || 'pattern'}.ledproj.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as SerializedProject
      dispatch({ type: 'loadProject', project: deserialize(data) })
    } catch {
      alert('That file is not a LED Pattern Generator project.')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 flex items-baseline gap-2.5 text-xl">
          LED Pattern Generator
          <small className="text-[0.8rem] font-normal text-muted-foreground">
            draw a pattern, get the Arduino sketch
          </small>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!canUndo}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <Undo2 /> Undo
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!canRedo}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 /> Redo
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button type="button" variant="outline" onClick={exportProject}>Save project</Button>
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>Open project</Button>
          <Button type="button" variant="outline" onClick={() => setConfirmNew(true)}>New</Button>
          <ThemeToggle />
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importProject(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              This discards the current pattern and starts over. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dispatch({ type: 'loadProject', project: starterProject() })}
            >
              Start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PanelSetup />

      <div className="grid grid-cols-1 items-start gap-4 wide:grid-cols-[minmax(0,1fr)_minmax(340px,620px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {selectedFrame ? (
            <>
              <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <h3 className="m-0 text-sm font-semibold">
                  {selectedFrame.name}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {project.grid.rows} x {project.grid.cols}
                  </span>
                </h3>
                <FrameCanvas
                  frame={selectedFrame}
                  grid={project.grid}
                  rowColors={project.rowColors}
                  onCells={(cells, coalesce) => setCells(cells, coalesce)}
                />
              </section>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                <DesignPresets frame={selectedFrame} grid={project.grid} />
                <TileControls frame={selectedFrame} grid={project.grid} />
                <MotionControls frame={selectedFrame} grid={project.grid} />
              </div>
            </>
          ) : (
            <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-12 text-muted-foreground">
              <p>No frame selected. Add one from the timeline below.</p>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="code">Arduino code</TabsTrigger>
              <TabsTrigger value="memory">Memory</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              {tab === 'preview' && <Preview view={previewView} onView={setPreviewView} />}
            </TabsContent>
            <TabsContent value="code">{tab === 'code' && <CodeView />}</TabsContent>
            <TabsContent value="memory">{tab === 'memory' && <MemoryCheck />}</TabsContent>
          </Tabs>
        </aside>
      </div>

      <FrameList />

      <footer className="border-t pt-1 pb-2 text-center">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbout(true)}>
          Built by Dushan Pramod
        </Button>
      </footer>

      <AboutDialog open={about} onClose={() => setAbout(false)} />
    </div>
  )
}

export default function App() {
  return (
    <ProjectProvider>
      <Workspace />
    </ProjectProvider>
  )
}
