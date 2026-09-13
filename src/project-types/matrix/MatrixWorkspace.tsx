import { ChevronUp, Code2, Cpu, ExternalLink, PanelRightClose, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { PopoutWindow } from '@/components/PopoutWindow'
import { SaveProjectButton } from '@/components/SaveProjectButton'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { rememberLastProject } from '@/core/lastProject'
import { useIncomingProjectFile } from '@/core/navigation'
import { buildProjectFile, downloadProjectFile } from '@/core/projectFile'
import { CodeView } from './components/CodeView'
import { FrameCanvas } from './components/FrameCanvas'
import { FrameList } from './components/FrameList'
import { MemoryCheck } from './components/MemoryCheck'
import { MotionControls } from './components/MotionControls'
import { PanelSetup } from './components/PanelSetup'
import { Preview, type PreviewView } from './components/Preview'
import { TileControls } from './components/TileControls'
import { matrixType } from './index'
import { deserialize, serialize } from './lib/grid'
import { ProjectProvider } from './state/projectStore'
import { useFrameActions, useProject } from './state/useProject'
import type { Project, SerializedProject } from './types'

function Workspace() {
  const { project, selectedFrame, canUndo, canRedo, dispatch } = useProject()
  const { setCells } = useFrameActions(selectedFrame?.id ?? null)
  const [output, setOutput] = useState<'code' | 'memory' | null>(null)
  const toggleOutput = (next: 'code' | 'memory') => setOutput((current) => (current === next ? null : next))
  // The preview can be popped out and docked again, so its viewing options are
  // kept here and survive the remount.
  const [previewView, setPreviewView] = useState<PreviewView>({
    shape: 'fan',
    dimension: '2d',
    sweep: 270,
    rimFirst: false,
    soloFrame: false,
    light: false,
  })
  // The preview can live in its own window instead, e.g. on a second screen.
  const [poppedOut, setPoppedOut] = useState(false)
  const [popoutBlocked, setPopoutBlocked] = useState(false)
  const popoutRef = useRef<Window | null>(null)
  const popOut = () => {
    setPopoutBlocked(false)
    setPoppedOut(true)
  }
  const dock = () => setPoppedOut(false)

  useEffect(() => {
    rememberLastProject({ type: matrixType.id, name: project.name })
  }, [project.name])

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

  const saveProject = () =>
    downloadProjectFile(
      buildProjectFile(
        matrixType.id,
        { name: project.name, description: project.description ?? '' },
        serialize(project),
      ),
    )

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-4">
      <AppHeader title={project.name || 'Untitled'} subtitle={matrixType.label}>
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
        <SaveProjectButton onSave={saveProject} />
      </AppHeader>

      <PanelSetup />

      {/* With the preview in its own window, the panel editor takes the full width. */}
      <div
        className={
          poppedOut
            ? 'grid grid-cols-1 items-start gap-4'
            : 'grid grid-cols-1 items-start gap-4 wide:grid-cols-[minmax(0,1fr)_minmax(340px,620px)]'
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          {poppedOut && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2">
              <p className="m-0 flex-1 text-sm text-muted-foreground">The preview is open in a separate window.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => popoutRef.current?.focus()}>
                <ExternalLink /> Show window
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={dock}>
                <PanelRightClose /> Bring back
              </Button>
            </div>
          )}
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

        {!poppedOut && (
          <aside className="flex min-w-0 flex-col gap-4">
            {popoutBlocked && (
              <p className="m-0 text-sm text-destructive">
                The browser blocked the preview window. Allow pop-ups for this site and try again.
              </p>
            )}
            <Preview view={previewView} onView={setPreviewView} onPopout={popOut} />
          </aside>
        )}
      </div>

      <FrameList />

      {/* Code and memory are only needed once the designs are done, so they sit
          at the bottom, collapsed. Both regenerate the sketch on every edit, so
          only the open one is mounted. */}
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 mr-2 text-sm font-semibold">Export</h3>
          <Button
            type="button"
            variant={output === 'code' ? 'secondary' : 'outline'}
            onClick={() => toggleOutput('code')}
          >
            <Code2 /> Arduino code
          </Button>
          <Button
            type="button"
            variant={output === 'memory' ? 'secondary' : 'outline'}
            onClick={() => toggleOutput('memory')}
          >
            <Cpu /> Memory
          </Button>
          <span className="flex-1" />
          {output && (
            <Button type="button" variant="ghost" onClick={() => setOutput(null)}>
              <ChevronUp /> Hide
            </Button>
          )}
        </div>
        {output === 'code' && <CodeView />}
        {output === 'memory' && <MemoryCheck />}
      </section>

      {/* Outside the aside, so the window stays open wherever the page is scrolled. */}
      {poppedOut && (
        <PopoutWindow
          title={`${project.name || 'Untitled'} · Preview`}
          onOpen={(win) => (popoutRef.current = win)}
          onClose={(blocked) => {
            popoutRef.current = null
            setPoppedOut(false)
            setPopoutBlocked(blocked)
          }}
        >
          <Preview popout view={previewView} onView={setPreviewView} onDock={dock} />
        </PopoutWindow>
      )}

      <AppFooter />
    </div>
  )
}

export default function MatrixWorkspace() {
  const incoming = useIncomingProjectFile(matrixType.id)
  const initial = useMemo<Project | undefined>(() => {
    if (!incoming.file) return undefined
    const { meta, data } = incoming.file
    // The envelope's meta is what the landing page and file header show, so it
    // is authoritative over whatever name the data block carries.
    return { ...deserialize(data as SerializedProject), name: meta.name, description: meta.description }
  }, [incoming.file])

  return (
    <ProjectProvider key={incoming.key} initial={initial}>
      <Workspace />
    </ProjectProvider>
  )
}
