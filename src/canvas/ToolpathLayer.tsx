import { useRef, useEffect, useMemo, memo } from 'react'
import { Layer, Shape, Circle } from 'react-konva'
import Konva from 'konva'
import { useToolpathStore, useToolStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import type { Move } from '@/types'

// ── Color constants ───────────────────────────────────────────────────────
const C_RAPID  = '#ef4444'   // red   – G0 rapid traverse
const C_PLUNGE = '#4ade80'   // green – Z-only cutting moves
const C_CUT    = '#60a5fa'   // blue  – XY cutting moves

// ── Segment data types ────────────────────────────────────────────────────
interface Seg { x1: number; y1: number; x2: number; y2: number }

function classifySegments(moves: Move[]) {
  const rapid: Seg[] = [], plunge: Seg[] = [], cut: Seg[] = []
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1], b = moves[i]
    const seg: Seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    if (b.rapid)              rapid.push(seg)
    else if (b.z !== a.z)     plunge.push(seg)
    else                      cut.push(seg)
  }
  return { rapid, plunge, cut }
}

// ── Single-pass canvas drawing for one color group ────────────────────────
function drawSegs(
  ctx: Konva.Context,
  segs: Seg[],
  color: string,
  width: number,
  dashed: boolean,
) {
  if (!segs.length) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (ctx as any)._context as CanvasRenderingContext2D
  raw.save()
  raw.strokeStyle = color
  raw.lineWidth   = width
  if (dashed) raw.setLineDash([2, 2])
  raw.beginPath()
  for (const s of segs) { raw.moveTo(s.x1, s.y1); raw.lineTo(s.x2, s.y2) }
  raw.stroke()
  raw.restore()
}

// ── Memoized static line layer — only re-builds when toolpaths change ─────
const StaticLines = memo(function StaticLines({
  rapidSegs, plungeSegs, cutSegs,
}: { rapidSegs: Seg[]; plungeSegs: Seg[]; cutSegs: Seg[] }) {
  return (
    <>
      <Shape
        sceneFunc={(ctx) => drawSegs(ctx, cutSegs,    C_CUT,    0.4, false)}
        listening={false} perfectDrawEnabled={false}
      />
      <Shape
        sceneFunc={(ctx) => drawSegs(ctx, plungeSegs, C_PLUNGE, 0.4, false)}
        listening={false} perfectDrawEnabled={false}
      />
      <Shape
        sceneFunc={(ctx) => drawSegs(ctx, rapidSegs,  C_RAPID,  0.3, true)}
        listening={false} perfectDrawEnabled={false}
      />
    </>
  )
})

// ── Main layer ────────────────────────────────────────────────────────────
export default function ToolpathLayer() {
  const layerRef    = useRef<Konva.Layer>(null)
  const headRef     = useRef<Konva.Circle>(null)
  const rafRef      = useRef<number | null>(null)
  const progressRef = useRef(0)

  const { toolpaths }    = useToolpathStore()
  const { diameter }     = useToolStore()
  const {
    showToolpaths, toolpathPlaying, toolpathSpeed,
    toolpathResetToken, setToolpathPlaying,
  } = useUIStore()

  // Flatten all moves once across all toolpaths
  const allMoves = useMemo(() => toolpaths.flatMap(tp => tp.moves), [toolpaths])

  // Pre-classify segments for the three color groups
  const { rapid: rapidSegs, plunge: plungeSegs, cut: cutSegs } = useMemo(
    () => classifySegments(allMoves),
    [allMoves],
  )

  // Reset head position when token changes or toolpaths are replaced
  useEffect(() => {
    progressRef.current = 0
    const head = headRef.current
    if (!head || !allMoves.length) return
    head.x(allMoves[0].x)
    head.y(allMoves[0].y)
    head.visible(false)
    layerRef.current?.batchDraw()
  }, [toolpathResetToken, allMoves])

  // RAF-driven animation
  useEffect(() => {
    const cancel = () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
    if (!toolpathPlaying || !allMoves.length) { cancel(); return }

    // Auto-reset if we were at the end
    if (progressRef.current >= allMoves.length - 1) progressRef.current = 0

    const mps: Record<string, number> = { slow: 100, normal: 1500, fast: 15000 }
    const movesPerSec = mps[toolpathSpeed] ?? 1500
    let last: number | null = null

    const step = (t: number) => {
      if (last === null) { last = t; rafRef.current = requestAnimationFrame(step); return }
      const dt = (t - last) / 1000; last = t

      progressRef.current = Math.min(progressRef.current + movesPerSec * dt, allMoves.length - 1)
      const move = allMoves[Math.floor(progressRef.current)]
      const head = headRef.current
      if (head && move) {
        head.x(move.x); head.y(move.y); head.visible(true)
        layerRef.current?.batchDraw()
      }
      if (progressRef.current >= allMoves.length - 1) { setToolpathPlaying(false); return }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return cancel
  }, [toolpathPlaying, toolpathSpeed, allMoves, setToolpathPlaying])

  if (!showToolpaths || !toolpaths.length) return null

  const headR    = Math.max(diameter / 2, 0.8)
  const startPos = allMoves[0] ?? { x: 0, y: 0 }

  return (
    <Layer ref={layerRef} opacity={0.85}>
      <StaticLines rapidSegs={rapidSegs} plungeSegs={plungeSegs} cutSegs={cutSegs} />
      <Circle
        ref={headRef}
        x={startPos.x} y={startPos.y}
        radius={headR}
        fill="#facc15"
        visible={false}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Layer>
  )
}
