import { Layer, Circle, Line, Rect } from 'react-konva'
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
        {handles.map(h => (
          <Line
            key={`arm-${h.key}`}
            points={[h.anchorCanvas.x, h.anchorCanvas.y, h.handleCanvas.x, h.handleCanvas.y]}
            stroke="#475569" strokeWidth={hsw} dash={[3 / scale, 2 / scale]}
            listening={false}
          />
        ))}
        {handles.map(h => (
          <Rect
            key={`hdl-${h.key}`}
            x={h.handleCanvas.x} y={h.handleCanvas.y}
            width={hr * 2} height={hr * 2}
            offsetX={hr} offsetY={hr}
            rotation={45}
            fill="#3b82f6" stroke="#1e3a5f" strokeWidth={hsw}
            listening={false}
          />
        ))}
        {anchors.map(({ cmdIdx, cx, cy }) => (
          <Circle
            key={cmdIdx}
            x={cx} y={cy}
            radius={r}
            fill="white" stroke="#3b82f6" strokeWidth={sw}
            draggable
            onDragMove={onDragMove}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              const newLx = (e.target.x() - ox) / sx
              const newLy = (e.target.y() - oy) / sy
              parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy } as unknown as (typeof parsed.commands)[number]
              updateShape(shape.id, { data: parsed.encode() })
            }}
          />
        ))}
      </Layer>
    )
  }

  return null
}
