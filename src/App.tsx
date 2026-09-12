import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AboutDialog } from './components/AboutDialog'
import { CodeView } from './components/CodeView'
import { DesignPresets } from './components/DesignPresets'
import { FrameCanvas } from './components/FrameCanvas'
import { FrameList } from './components/FrameList'
import { MemoryCheck } from './components/MemoryCheck'
import { MotionControls } from './components/MotionControls'
import { PanelSetup } from './components/PanelSetup'
import { Preview } from './components/Preview'
import { TileControls } from './components/TileControls'
import { deserialize, serialize } from './lib/grid'
import { starterProject } from './state/defaults'
import { ProjectProvider } from './state/projectStore'
import { useFrameActions, useProject } from './state/useProject'
import type { SerializedProject } from './types'

function Workspace() {
  const { project, selectedFrame, canUndo, canRedo, dispatch } = useProject()
  const { setCells } = useFrameActions(selectedFrame?.id ?? null)
  const [tab, setTab] = useState<'preview' | 'code' | 'memory'>('preview')
  const [about, setAbout] = useState(false)
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
    <div className="app">
      <header className="topbar">
        <h1>
          LED Pattern Generator
          <small>draw a pattern, get the Arduino sketch</small>
        </h1>
        <div className="tools">
          <button type="button" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
            ↶ Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
            ↷ Redo
          </button>
          <span className="divider" />
          <button type="button" onClick={exportProject}>Save project</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Open project</button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Discard the current pattern and start over?')) {
                dispatch({ type: 'loadProject', project: starterProject() })
              }
            }}
          >
            New
          </button>
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

      <PanelSetup />

      <div className="workspace">
        <div className="editor">
          {selectedFrame ? (
            <>
              <section className="panel">
                <h3>
                  {selectedFrame.name}
                  <span className="subtle">
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
              <div className="controls">
                <DesignPresets frame={selectedFrame} grid={project.grid} />
                <TileControls frame={selectedFrame} grid={project.grid} />
                <MotionControls frame={selectedFrame} grid={project.grid} />
              </div>
            </>
          ) : (
            <section className="panel empty">
              <p>No frame selected. Add one from the timeline below.</p>
            </section>
          )}
        </div>

        <aside className="side">
          <div className="tabs">
            <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
              Preview
            </button>
            <button type="button" className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>
              Arduino code
            </button>
            <button type="button" className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}>
              Memory
            </button>
          </div>
          {tab === 'preview' && <Preview />}
          {tab === 'code' && <CodeView />}
          {tab === 'memory' && <MemoryCheck />}
        </aside>
      </div>

      <FrameList />

      <footer className="credit">
        <button type="button" onClick={() => setAbout(true)}>Built by Dushan Pramod</button>
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
