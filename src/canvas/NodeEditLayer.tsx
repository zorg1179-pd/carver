import { useState } from 'react'
import { Layer, Circle, Line, Rect, Path } from 'react-konva'
import Konva from 'konva'
import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import { findSegmentHit, insertNodeAt, weldNearestEndpoints } from '@/toolpath/pathUtils'
import type { LineShape, PathShape } from '@/types'
import NodeEditControls from './NodeEditControls'

interface Props { scale: number }

export default function NodeEditLayer({ scale }: Props) {
  const { nodeEditShapeId, snapEnabled, snapGridSize } = useUIStore()
  const { shapes, updateShape, replaceShapesWithOne, addShape } = useDocumentStore()

  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null)
  const [hoveredSegmentIdx, setHoveredSegmentIdx] = useState<number | null>(null)
  const [snapTarget, setSnapTarget] = useState<{ shapeId: string; x: number; y: number } | null>(null)

  if (!nodeEditShapeId) return null
  const shape = shapes.find(s => s.id === nodeEditShapeId)
  if (!shape) return null

  const r  = 5   / scale
  const sw = 1.5 / scale

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!snapEnabled) return
    const g = snapGridSize
    e.target.x(Math.round(e.target.x() / g) * g)
    e.target.y(Math.round(e.target.y() / g) * g)
  }

  // ── Line shape: points are in canvas space directly ────────────────────────
  if (shape.type === 'line') {
    const s = shape as LineShape
    const pts = s.points
    const count = Math.floor(pts.length / 2)
    return (
      <Layer>
        {Array.from({ length: count }, (_, i) => (
          <Circle
            key={i}
            x={pts[i * 2]} y={pts[i * 2 + 1]}
            radius={r}
            fill="white" stroke="#3b82f6" strokeWidth={sw}
            draggable
            onDragMove={onDragMove}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              const newPts = [...pts]
              newPts[i * 2]     = e.target.x()
              newPts[i * 2 + 1] = e.target.y()
              updateShape(shape.id, { points: newPts })
            }}
          />
        ))}
      </Layer>
    )
  }

  // ── Path shape: node coords are in local space, transform via x/y/scale ───
  if (shape.type === 'path') {
    const s = shape as PathShape
    const ox = s.x ?? 0, oy = s.y ?? 0
    const sx = s.scaleX ?? 1, sy = s.scaleY ?? 1

    const parsed = new SVGPathData(s.data)
      .transform(SVGPathDataTransformer.TO_ABS())
      .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
      .transform(SVGPathDataTransformer.NORMALIZE_ST())

    type AnchorEntry = { cmdIdx: number; cx: number; cy: number }
    const anchors = parsed.commands.reduce<AnchorEntry[]>((acc, cmd, i) => {
      if (
        cmd.type === SVGPathData.MOVE_TO  ||
        cmd.type === SVGPathData.LINE_TO  ||
        cmd.type === SVGPathData.CURVE_TO ||
        cmd.type === SVGPathData.QUAD_TO
      ) {
        acc.push({ cmdIdx: i, cx: ox + (cmd as any).x * sx, cy: oy + (cmd as any).y * sy })
      }
      return acc
    }, [])

    type HandleEntry = {
      key: string
      anchorCanvas: { x: number; y: number }
      handleCanvas: { x: number; y: number }
      cmdIdx: number
      which: 'cp1' | 'cp2'
      anchorNodeIdx: number
    }
    const handles: HandleEntry[] = []
    let anchorIdx = 0
    for (let i = 0; i < parsed.commands.length; i++) {
      const cmd = parsed.commands[i] as any
      if (
        cmd.type === SVGPathData.MOVE_TO  ||
        cmd.type === SVGPathData.LINE_TO  ||
        cmd.type === SVGPathData.QUAD_TO
      ) { anchorIdx++; continue }
      if (cmd.type === SVGPathData.CURVE_TO) {
        const prevAnchor = anchors[anchorIdx - 1]
        if (prevAnchor) {
          handles.push({
            key: `${i}-cp1`,
            anchorCanvas: { x: prevAnchor.cx, y: prevAnchor.cy },
            handleCanvas: { x: ox + cmd.x1 * sx, y: oy + cmd.y1 * sy },
            cmdIdx: i, which: 'cp1', anchorNodeIdx: anchorIdx - 1,
          })
        }
        handles.push({
          key: `${i}-cp2`,
          anchorCanvas: { x: ox + cmd.x * sx, y: oy + cmd.y * sy },
          handleCanvas: { x: ox + cmd.x2 * sx, y: oy + cmd.y2 * sy },
          cmdIdx: i, which: 'cp2', anchorNodeIdx: anchorIdx,
        })
        anchorIdx++
      }
    }

    const hr = 4 / scale
    const hsw = 1 / scale

    return (
      <Layer>
        {/* Transparent hit area for segment click / hover */}
        <Path
          data={s.data}
          x={ox} y={oy}
          scaleX={sx} scaleY={sy}
          fill="transparent"
          stroke="transparent"
          strokeWidth={12 / scale}
          hitStrokeWidth={12 / scale}
          listening={true}
          onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage(); if (!stage) return
            const pos = stage.getPointerPosition(); if (!pos) return
            const localX = (pos.x / scale - ox) / sx
            const localY = (pos.y / scale - oy) / sy
            const hit = findSegmentHit(s.data, localX, localY, 8 / scale)
            setHoveredSegmentIdx(hit ? hit.segmentIdx : null)
          }}
          onMouseLeave={() => setHoveredSegmentIdx(null)}
          onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage(); if (!stage) return
            const pos = stage.getPointerPosition(); if (!pos) return
            const localX = (pos.x / scale - ox) / sx
            const localY = (pos.y / scale - oy) / sy
            const hit = findSegmentHit(s.data, localX, localY, 8 / scale)
            if (!hit) return
            updateShape(shape.id, { data: insertNodeAt(s.data, hit.segmentIdx, hit.t) })
          }}
        />
        {handles.map(h => (
          <Line
            key={`arm-${h.key}`}
            points={[h.anchorCanvas.x, h.anchorCanvas.y, h.handleCanvas.x, h.handleCanvas.y]}
            stroke="#475569" strokeWidth={hsw} dash={[3 / scale, 2 / scale]}
            listening={false}
          />
        ))}
        {handles.map(h => {
          const hx = h.handleCanvas.x
          const hy = h.handleCanvas.y
          return (
            <Rect
              key={`hdl-${h.key}`}
              x={hx} y={hy}
              width={hr * 2} height={hr * 2}
              offsetX={hr} offsetY={hr}
              rotation={45}
              fill="#3b82f6" stroke="#1e3a5f" strokeWidth={hsw}
              draggable
              onDragMove={onDragMove}
              onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                const newHx = (e.target.x() - ox) / sx
                const newHy = (e.target.y() - oy) / sy
                const cmd = parsed.commands[h.cmdIdx] as any
                const nodeType = (s.nodeTypes ?? [])[h.anchorNodeIdx] ?? 'corner'
                if (h.which === 'cp2') {
                  cmd.x2 = newHx; cmd.y2 = newHy
                  if (nodeType === 'smooth') {
                    const thisAnchor = anchors[h.anchorNodeIdx]
                    const mirrorX = (thisAnchor.cx - ox) / sx - (newHx - (thisAnchor.cx - ox) / sx)
                    const mirrorY = (thisAnchor.cy - oy) / sy - (newHy - (thisAnchor.cy - oy) / sy)
                    for (let j = h.cmdIdx + 1; j < parsed.commands.length; j++) {
                      const nc = parsed.commands[j] as any
                      if (nc.type === SVGPathData.CURVE_TO) { nc.x1 = mirrorX; nc.y1 = mirrorY; break }
                      if (nc.type === SVGPathData.MOVE_TO) break
                    }
                  }
                } else {
                  cmd.x1 = newHx; cmd.y1 = newHy
                  if (nodeType === 'smooth') {
                    const prevAnchor = anchors[h.anchorNodeIdx]
                    const mirrorX = (prevAnchor.cx - ox) / sx - (newHx - (prevAnchor.cx - ox) / sx)
                    const mirrorY = (prevAnchor.cy - oy) / sy - (newHy - (prevAnchor.cy - oy) / sy)
                    cmd.x2 = mirrorX; cmd.y2 = mirrorY
                  }
                }
                updateShape(shape.id, { data: parsed.encode() })
              }}
            />
          )
        })}
        {anchors.map(({ cmdIdx, cx, cy }, nodeIdx) => (
          <Circle
            key={cmdIdx}
            x={cx} y={cy}
            radius={r}
            fill={selectedNodeIdx === nodeIdx ? '#3b82f6' : 'white'}
            stroke="#3b82f6" strokeWidth={sw}
            draggable
            onClick={() => setSelectedNodeIdx(nodeIdx === selectedNodeIdx ? null : nodeIdx)}
            onDblClick={() => {
              const types = [...(s.nodeTypes ?? anchors.map(() => 'corner' as const))]
              while (types.length <= nodeIdx) types.push('corner')
              const current = types[nodeIdx] ?? 'corner'
              types[nodeIdx] = current === 'smooth' ? 'corner' : 'smooth'
              if (types[nodeIdx] === 'smooth') {
                const cmd = parsed.commands[cmdIdx] as any
                if (cmd.type === SVGPathData.CURVE_TO) {
                  const bwdDx = cmd.x2 - cmd.x, bwdDy = cmd.y2 - cmd.y
                  for (let j = cmdIdx + 1; j < parsed.commands.length; j++) {
                    const nc = parsed.commands[j] as any
                    if (nc.type === SVGPathData.CURVE_TO) {
                      nc.x1 = cmd.x - bwdDx; nc.y1 = cmd.y - bwdDy
                      break
                    }
                    if (nc.type === SVGPathData.MOVE_TO) break
                  }
                }
              }
              updateShape(shape.id, { data: parsed.encode(), nodeTypes: types })
            }}
            onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
              onDragMove(e)
              // Weld snap: only check endpoints (first and last anchor)
              if (nodeIdx !== 0 && nodeIdx !== anchors.length - 1) return
              const cx2 = e.target.x(), cy2 = e.target.y()
              const WELD_THRESHOLD = 8 / scale
              let found: { shapeId: string; x: number; y: number } | null = null
              for (const other of shapes) {
                if (other.id === shape.id || other.type !== 'path') continue
                const os = other as PathShape
                const ocmds = new SVGPathData(os.data)
                  .transform(SVGPathDataTransformer.TO_ABS())
                  .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
                  .transform(SVGPathDataTransformer.NORMALIZE_ST())
                  .commands
                const oAnchors = ocmds.filter((c: any) =>
                  c.type === SVGPathData.MOVE_TO || c.type === SVGPathData.LINE_TO || c.type === SVGPathData.CURVE_TO
                )
                const endpoints = [oAnchors[0], oAnchors[oAnchors.length - 1]]
                const oox = os.x ?? 0, ooy = os.y ?? 0, oosx = os.scaleX ?? 1, oosy = os.scaleY ?? 1
                for (const ep of endpoints) {
                  if (!ep) continue
                  const epCx = oox + (ep as any).x * oosx
                  const epCy = ooy + (ep as any).y * oosy
                  if (Math.hypot(cx2 - epCx, cy2 - epCy) < WELD_THRESHOLD) {
                    found = { shapeId: other.id, x: epCx, y: epCy }
                    e.target.x(epCx); e.target.y(epCy)
                    break
                  }
                }
                if (found) break
              }
              setSnapTarget(found)
            }}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              if (snapTarget) {
                const other = shapes.find(sh => sh.id === snapTarget.shapeId) as PathShape | undefined
                if (other) {
                  const merged = weldNearestEndpoints(s.data, other.data)
                  replaceShapesWithOne([s.id, other.id], {
                    id: crypto.randomUUID(), type: 'path', data: merged,
                    style: s.style, layerId: s.layerId,
                  } as PathShape)
                  setSnapTarget(null)
                  return
                }
              }
              setSnapTarget(null)
              const newLx = (e.target.x() - ox) / sx
              const newLy = (e.target.y() - oy) / sy
              parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy } as unknown as (typeof parsed.commands)[number]
              updateShape(shape.id, { data: parsed.encode() })
            }}
          />
        ))}
        {/* Weld snap ring */}
        {snapTarget && (
          <Circle
            x={snapTarget.x} y={snapTarget.y}
            radius={10 / scale}
            fill="transparent"
            stroke="#34d399" strokeWidth={1.5 / scale}
            listening={false}
          />
        )}
        <NodeEditControls
          selectedNodeIdx={selectedNodeIdx}
          hoveredSegmentIdx={hoveredSegmentIdx}
          onClearSelection={() => setSelectedNodeIdx(null)}
        />
      </Layer>
    )
  }

  return null
}
