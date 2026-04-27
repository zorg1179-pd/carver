import { Layer, Circle } from 'react-konva'
import Konva from 'konva'
import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import type { LineShape, PathShape } from '@/types'

interface Props { scale: number }

export default function NodeEditLayer({ scale }: Props) {
  const { nodeEditShapeId, snapEnabled, snapGridSize } = useUIStore()
  const { shapes, updateShape } = useDocumentStore()

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

    // Normalise to absolute M/L/C/Q/Z (H/V→L, S→C, T→Q)
    const parsed = new SVGPathData(s.data)
      .transform(SVGPathDataTransformer.TO_ABS())
      .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
      .transform(SVGPathDataTransformer.NORMALIZE_ST())

    type NodeEntry = { cmdIdx: number; lx: number; ly: number }
    const nodes = parsed.commands.reduce<NodeEntry[]>((acc, cmd, i) => {
      if (
        cmd.type === SVGPathData.MOVE_TO  ||
        cmd.type === SVGPathData.LINE_TO  ||
        cmd.type === SVGPathData.CURVE_TO ||
        cmd.type === SVGPathData.QUAD_TO  ||
        cmd.type === SVGPathData.ARC
      ) {
        acc.push({ cmdIdx: i, lx: cmd.x, ly: cmd.y })
      }
      return acc
    }, [])

    return (
      <Layer>
        {nodes.map(({ cmdIdx, lx, ly }) => (
          <Circle
            key={cmdIdx}
            x={ox + lx * sx} y={oy + ly * sy}
            radius={r}
            fill="white" stroke="#3b82f6" strokeWidth={sw}
            draggable
            onDragMove={onDragMove}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              // Convert dragged canvas position → local path-data coordinates
              const newLx = (e.target.x() - ox) / sx
              const newLy = (e.target.y() - oy) / sy
              parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy }
              updateShape(shape.id, { data: parsed.encode() })
            }}
          />
        ))}
      </Layer>
    )
  }

  return null
}
