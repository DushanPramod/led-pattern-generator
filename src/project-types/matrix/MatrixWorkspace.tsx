import { Redo2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { SaveProjectButton } from '@/components/SaveProjectButton'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const [tab, setTab] = useState<'preview' | 'code' | 'memory'>('preview')
  // Only the open tab is mounted, so the preview's viewing options are kept
  // here and survive a trip to the code tab.
  const [previewView, setPreviewView] = useState<PreviewView>({
    shape: 'fan',
    dimension: '2d',
    sweep: 270,
    rimFirst: false,
    soloFrame: false,
    light: false,
  })

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
