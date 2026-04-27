import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { HeightmapResult } from './heightmapSim'

export type ViewMode = 'shaded' | 'wireframe' | 'xray'

interface Props {
  heightmap: HeightmapResult
  bedWidth: number
  bedHeight: number
  thickness: number
  viewMode: ViewMode
}

const SURFACE_COLOR = new THREE.Color(0xc8a060)
const CUT_COLOR     = new THREE.Color(0x3d1f0e)

interface Ctx {
  renderer: THREE.WebGLRenderer
  camera:   THREE.PerspectiveCamera
  controls: OrbitControls
  material: THREE.MeshLambertMaterial
  animId:   number
}

export default function PreviewScene({ heightmap, bedWidth, bedHeight, thickness, viewMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef    = useRef<Ctx | null>(null)

  // Build / rebuild scene whenever the heightmap changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Renderer (reuse the canvas element that is already in the DOM) ────────
    // We intentionally do NOT call renderer.dispose() in cleanup below because
    // it would call WEBGL_lose_context.loseContext(), making the next
    // getContext('webgl2') return a lost context.  The second useEffect run
    // (React StrictMode) reuses the same live context — safe because the old
    // animation loop is cancelled before the new one starts.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
    } catch {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, canvas })
      } catch (err) {
        console.error('[carver] WebGL not available:', err)
        return
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x111827)

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const key = new THREE.DirectionalLight(0xffffff, 0.85)
    key.position.set(bedWidth * 0.3, bedHeight * 2, -bedHeight * 0.5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8fa8d0, 0.35)
    fill.position.set(-bedWidth, 0, bedHeight * 1.5)
    scene.add(fill)

    // ── Camera & controls ─────────────────────────────────────────────────────
    const d = Math.max(bedWidth, bedHeight)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, d * 30)
    camera.position.set(bedWidth / 2, d * 0.9, -d * 0.55)
    camera.lookAt(bedWidth / 2, -thickness * 0.2, bedHeight / 2)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(bedWidth / 2, -thickness * 0.2, bedHeight / 2)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    // ── Stock surface mesh ────────────────────────────────────────────────────
    const { geometry, material } = buildMesh(heightmap, bedWidth, bedHeight, thickness)
    scene.add(new THREE.Mesh(geometry, material))

    // ── Stock outline box ─────────────────────────────────────────────────────
    const boxGeo  = new THREE.BoxGeometry(bedWidth, thickness, bedHeight)
    const edges   = new THREE.EdgesGeometry(boxGeo)
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x374151 }))
    outline.position.set(bedWidth / 2, -thickness / 2, bedHeight / 2)
    scene.add(outline)
    boxGeo.dispose()

    // ── Grid below stock ──────────────────────────────────────────────────────
    const gridSz = Math.ceil(d / 10) * 10
    const grid   = new THREE.GridHelper(gridSz, Math.round(gridSz / 10), 0x1f2937, 0x1f2937)
    grid.position.set(bedWidth / 2, -(thickness + 0.5), bedHeight / 2)
    scene.add(grid)

    // ── Resize observer ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    })
    ro.observe(canvas)

    // Apply initial size in case observer fires late
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight
    if (w0 > 0 && h0 > 0) {
      camera.aspect = w0 / h0
      camera.updateProjectionMatrix()
      renderer.setSize(w0, h0, false)
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    const ctx: Ctx = { renderer, camera, controls, material, animId: 0 }
    ctxRef.current = ctx
    const animate = () => {
      ctx.animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(ctx.animId)
      ro.disconnect()
      controls.dispose()
      edges.dispose()
      geometry.dispose()
      material.dispose()
      // Do NOT call renderer.dispose() — that would lose the WebGL context and
      // break React StrictMode's double-invoke.  The canvas leaving the DOM on
      // final unmount lets the browser GC the context naturally.
      ctxRef.current = null
    }
  }, [heightmap, bedWidth, bedHeight, thickness])

  // Update material properties on view-mode change (no scene rebuild needed)
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.material.wireframe   = viewMode === 'wireframe'
    ctx.material.transparent = viewMode === 'xray'
    ctx.material.opacity     = viewMode === 'xray' ? 0.55 : 1
  }, [viewMode])

  // Canvas fills the parent — Three.js manages its pixel dimensions via setSize
  return <canvas ref={canvasRef} className="block w-full h-full" />
}

// ── Build displaced surface geometry from heightmap ───────────────────────────
function buildMesh(
  { data, width: hW, height: hH }: HeightmapResult,
  bedWidth: number,
  bedHeight: number,
  thickness: number,
) {
  const segX = hW - 1, segY = hH - 1

  const positions = new Float32Array(hW * hH * 3)
  const colors    = new Float32Array(hW * hH * 3)

  for (let row = 0; row < hH; row++) {
    for (let col = 0; col < hW; col++) {
      const vi = row * hW + col
      const z  = data[vi]

      // XZ ground plane, Y = height (0 = surface, negative = cut)
      positions[vi * 3 + 0] = (col / segX) * bedWidth
      positions[vi * 3 + 1] = z
      positions[vi * 3 + 2] = (row / segY) * bedHeight

      const t = Math.max(0, Math.min(1, -z / Math.max(thickness, 0.001)))
      colors[vi * 3 + 0] = SURFACE_COLOR.r + (CUT_COLOR.r - SURFACE_COLOR.r) * t
      colors[vi * 3 + 1] = SURFACE_COLOR.g + (CUT_COLOR.g - SURFACE_COLOR.g) * t
      colors[vi * 3 + 2] = SURFACE_COLOR.b + (CUT_COLOR.b - SURFACE_COLOR.b) * t
    }
  }

  // Two CCW triangles per quad → normals face +Y (upward)
  const indices = new Uint32Array(segX * segY * 6)
  let ii = 0
  for (let row = 0; row < segY; row++) {
    for (let col = 0; col < segX; col++) {
      const a = row * hW + col
      const b = a + 1
      const c = a + hW
      const d = c + 1
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  return { geometry, material }
}
