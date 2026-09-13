import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DEFAULT_LED_COLOR } from '../lib/colors'
import type { LedLayout, PanelShape } from '../lib/layout'
import type { Grid } from '../types'
import { Button } from '@/components/ui/button'

const SCREEN_BG = '#07090d'
const BOARD_THICKNESS = 0.25
/** Half the size of the board's larger side, in world units. */
const BOARD_EXTENT = 5
/** A real LED lights almost instantly but its glow lingers a little as it goes out. */
// Exponential time constants. An LED counts as fully on or off once it is
// within FADE_SNAP of it, so the whole fade lasts about ln(1/FADE_SNAP) ≈ 4x
// these: ~12 ms on and ~25 ms off — a quick soften, not a trail.
const RISE_MS = 3
const FALL_MS = 6
const FADE_SNAP = 0.02
/** How hot a lit die is drawn: well past 1 so the bloom pass picks it up. */
const DIE_GLOW = 5
const CAMERA_FOV = 40
const CAMERA_TILT = 0.4

type Scene3D = {
  renderer: WebGLRenderer
  composer: EffectComposer
  bloom: UnrealBloomPass
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  /** Starts the render loop if it is idle; it stops itself once nothing moves. */
  invalidate: () => void
  /** Frames the current board from the default angle. */
  resetView: () => void
  board: {
    meshes: Mesh[]
    body: InstancedMesh | null
    die: InstancedMesh | null
    /** Linear rgb of every LED, 3 per LED. */
    colors: Float32Array
    brightness: Float32Array
    target: Float32Array
    halfW: number
    halfH: number
    /** Which board the camera was last framed for. */
    framedFor: string
  }
}

/** A 5 mm LED standing on the board along +z: flange, body and dome, radius 1. */
function ledBodyGeometry(): BufferGeometry {
  const flange = new CylinderGeometry(1.12, 1.12, 0.25, 24)
  flange.rotateX(Math.PI / 2)
  flange.translate(0, 0, 0.125)
  const barrel = new CylinderGeometry(1, 1, 1.4, 24, 1, true)
  barrel.rotateX(Math.PI / 2)
  barrel.translate(0, 0, 0.25 + 0.7)
  const dome = new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.rotateX(Math.PI / 2)
  dome.translate(0, 0, 1.65)
  const merged = mergeGeometries([flange, barrel, dome])
  flange.dispose()
  barrel.dispose()
  dome.dispose()
  return merged
}

/** The glowing chip inside the lens. */
function ledDieGeometry(): BufferGeometry {
  const die = new SphereGeometry(0.38, 12, 8)
  die.translate(0, 0, 1.15)
  return die
}

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose()
  const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) material.dispose()
}

export default function Preview3D({
  grid,
  rowColors,
  cells,
  layout,
  shape,
  background = SCREEN_BG,
  className = 'h-[460px]',
}: {
  /** Sizes the view; the renderer follows whatever size that gives it. */
  className?: string
  grid: Grid
  rowColors: string[]
  cells: Uint8Array | undefined
  layout: LedLayout
  shape: PanelShape
  /** Backdrop behind the board. */
  background?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene3D | null>(null)
  const [supported] = useState(hasWebGL)
  // Latest step, so a rebuild of the board can light the right LEDs at once.
  const cellsRef = useRef(cells)

  // The renderer, camera and render loop live as long as the 3D view is open.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // The view may sit in a pop-out window: render, animate and measure on that
    // window, not the main one.
    const win = host.ownerDocument.defaultView ?? window
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        canvas: host.ownerDocument.createElement('canvas'),
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(2, win.devicePixelRatio || 1))
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.setClearColor(SCREEN_BG)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(SCREEN_BG)
    // Kept dim: bright highlights on the dark lenses read as lit LEDs.
    scene.add(new AmbientLight(0xffffff, 0.25))
    const key = new DirectionalLight(0xffffff, 0.8)
    key.position.set(4, 6, 10)
    scene.add(key)
    const fill = new DirectionalLight(0x9fb4ff, 0.4)
    fill.position.set(-6, -4, 5)
    scene.add(fill)

    const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.05, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    // A tight, gentle halo: a wide one bleeds into the dark neighbours and
    // the whole board looks lit.
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.6, 0.1, 1)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    let raf = 0
    let last = 0
    let interacting = false

    const frame = (now: number) => {
      const s = sceneRef.current
      if (!s) return
      const dt = last ? Math.min(100, now - last) : 16
      last = now
      const { board } = s
      let fading = false
      if (board.body && board.die) {
        const rise = 1 - Math.exp(-dt / RISE_MS)
        const fall = 1 - Math.exp(-dt / FALL_MS)
        const { brightness, target, colors } = board
        const bodyColors = board.body.instanceColor!.array as Float32Array
        const dieColors = board.die.instanceColor!.array as Float32Array
        for (let i = 0; i < brightness.length; i++) {
          const goal = target[i]
          let b = brightness[i]
          const gap = goal - b
          if (gap !== 0) {
            b += gap * (gap > 0 ? rise : fall)
            if (Math.abs(goal - b) < FADE_SNAP) b = goal
            else fading = true
            brightness[i] = b
          }
          const j = i * 3
          // The lens keeps a tint of its colour when dark and takes it fully when lit.
          const lens = 0.03 + 0.9 * b
          const die = DIE_GLOW * b
          for (let k = 0; k < 3; k++) {
            bodyColors[j + k] = colors[j + k] * lens
            dieColors[j + k] = colors[j + k] * die
          }
        }
        board.body.instanceColor!.needsUpdate = true
        board.die.instanceColor!.needsUpdate = true
      }
      const moved = controls.update()
      composer.render()
      if (fading || moved || interacting) {
        raf = win.requestAnimationFrame(frame)
      } else {
        raf = 0
        last = 0
      }
    }

    const invalidate = () => {
      if (!raf) raf = win.requestAnimationFrame(frame)
    }

    const resetView = () => {
      const s = sceneRef.current
      if (!s) return
      const { halfW, halfH } = s.board
      const tan = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180)
      const distance = Math.max(halfH / tan, halfW / (tan * camera.aspect)) * 1.08
      camera.position.set(0, -Math.sin(CAMERA_TILT) * distance, Math.cos(CAMERA_TILT) * distance)
      camera.up.set(0, 1, 0)
      controls.target.set(0, 0, 0)
      controls.minDistance = distance * 0.25
      controls.maxDistance = distance * 3
      controls.update()
      invalidate()
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      composer.setSize(width, height)
      composer.setPixelRatio(renderer.getPixelRatio())
      bloom.resolution.set(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      invalidate()
    }
    const observer = new win.ResizeObserver(resize)
    observer.observe(host)

    const onStart = () => {
      interacting = true
      invalidate()
    }
    const onEnd = () => {
      interacting = false
      invalidate()
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    controls.addEventListener('change', invalidate)

    sceneRef.current = {
      renderer,
      composer,
      bloom,
      scene,
      camera,
      controls,
      invalidate,
      resetView,
      board: {
        meshes: [],
        body: null,
        die: null,
        colors: new Float32Array(0),
        brightness: new Float32Array(0),
        target: new Float32Array(0),
        halfW: BOARD_EXTENT,
        halfH: BOARD_EXTENT,
        framedFor: '',
      },
    }
    resize()

    return () => {
      win.cancelAnimationFrame(raf)
      observer.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      for (const mesh of sceneRef.current?.board.meshes ?? []) disposeMesh(mesh)
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.renderer.setClearColor(background)
    s.scene.background = new Color(background)
    s.invalidate()
  }, [background])

  // Declared before the rebuild so a rebuild in the same commit sees this step.
  useEffect(() => {
    cellsRef.current = cells
    const s = sceneRef.current
    if (!s) return
    const { target } = s.board
    for (let i = 0; i < target.length; i++) target[i] = cells?.[i] ? 1 : 0
    s.invalidate()
  }, [cells])

  // The board and its LEDs are rebuilt only when the build itself changes;
  // stepping through the pattern just moves the brightness targets.
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const { board, scene } = s
    for (const mesh of board.meshes) {
      scene.remove(mesh)
      disposeMesh(mesh)
    }

    const { rows, cols } = grid
    const count = rows * cols
    const { positions, pitch } = layout
    let scale: number
    let boardMesh: Mesh
    const boardMaterial = new MeshStandardMaterial({ color: '#0c2016', roughness: 0.75, metalness: 0.15 })

    if (shape === 'flat') {
      scale = (BOARD_EXTENT * 2) / Math.max(cols, rows)
      const margin = 0.8
      const width = (cols + margin) * scale
      const height = (rows + margin) * scale
      const geometry = new BoxGeometry(width, height, BOARD_THICKNESS)
      geometry.translate(0, 0, -BOARD_THICKNESS / 2)
      boardMesh = new Mesh(geometry, boardMaterial)
      board.halfW = width / 2
      board.halfH = height / 2
    } else {
      scale = BOARD_EXTENT
      const margin = pitch * 0.7
      const outer = (layout.outer + margin) * scale
      const inner = Math.max(0, layout.inner - margin) * scale
      const outline = new Shape()
      if (shape === 'round') {
        outline.absarc(0, 0, outer, 0, Math.PI * 2, false)
        const hole = new Path()
        hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
        outline.holes.push(hole)
      } else {
        // Screen angles run clockwise with y down; the world has y up, so they flip.
        const pad = Math.min(margin / Math.max(layout.inner, 1e-3), (Math.PI * 2 - layout.arc) / 2)
        const from = -(layout.start + layout.arc) - pad
        const to = -layout.start + pad
        outline.absarc(0, 0, outer, from, to, false)
        outline.absarc(0, 0, inner, to, from, true)
      }
      const geometry = new ExtrudeGeometry(outline, {
        depth: BOARD_THICKNESS,
        bevelEnabled: false,
        curveSegments: 96,
      })
      geometry.translate(0, 0, -BOARD_THICKNESS)
      boardMesh = new Mesh(geometry, boardMaterial)
      board.halfW = outer
      board.halfH = outer
    }

    const ledRadius = pitch * scale * 0.38
    const body = new InstancedMesh(
      ledBodyGeometry(),
      new MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.55,
        clearcoat: 0.2,
        clearcoatRoughness: 0.5,
        transparent: true,
        opacity: 0.62,
      }),
      count,
    )
    const die = new InstancedMesh(ledDieGeometry(), new MeshBasicMaterial({ color: 0xffffff }), count)
    const matrix = new Matrix4()
    const unit = new Vector3(ledRadius, ledRadius, ledRadius)
    const position = new Vector3()
    const upright = new Quaternion()
    const colors = new Float32Array(count * 3)
    const color = new Color()
    for (let r = 0; r < rows; r++) {
      color.set(rowColors[r] ?? DEFAULT_LED_COLOR)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        position.set(positions[i * 2] * scale, -positions[i * 2 + 1] * scale, 0)
        matrix.compose(position, upright, unit)
        body.setMatrixAt(i, matrix)
        die.setMatrixAt(i, matrix)
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
      }
    }
    body.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage)
    die.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage)
    body.frustumCulled = false
    die.frustumCulled = false

    scene.add(boardMesh, die, body)
    board.meshes = [boardMesh, die, body]
    board.body = body
    board.die = die
    board.colors = colors
    // A rebuild shows the current step straight away rather than fading it in.
    const lit = new Float32Array(count)
    for (let i = 0; i < count; i++) lit[i] = cellsRef.current?.[i] ? 1 : 0
    board.brightness = lit
    board.target = lit.slice()
    // Bloom scales with the screen, so small LEDs on a big board need less of it.
    s.bloom.radius = shape === 'flat' ? 0.1 : 0.05
    // Recolouring rows or changing the sweep keeps the angle you orbited to;
    // a different board gets framed afresh.
    const framing = `${shape}:${rows}x${cols}`
    if (board.framedFor !== framing) {
      board.framedFor = framing
      s.resetView()
    } else {
      s.invalidate()
    }
  }, [grid, layout, rowColors, shape])

  if (!supported) {
    return (
      <p className="m-0 p-6 text-center text-sm text-muted-foreground">
        3D preview needs WebGL, which this browser has turned off. Switch back to 2D.
      </p>
    )
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div ref={hostRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute right-2 top-2"
        onClick={() => sceneRef.current?.resetView()}
      >
        <RotateCcw /> Reset view
      </Button>
    </div>
  )
}
