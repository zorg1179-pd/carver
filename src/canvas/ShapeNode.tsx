import Konva from 'konva'
import { Line, Rect, Circle, Ellipse, Text, Path } from 'react-konva'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import type {
  Shape, LineShape, RectShape, CircleShape, EllipseShape, TextShape, PathShape,
} from '@/types'

function snapVal(v: number, grid: number) { return Math.round(v / grid) * grid }

interface Props {
  shape: Shape
  isSelected: boolean
  onSelect: (addToSelection: boolean) => void
  isPreview?: boolean
  isLocked?: boolean
}

export default function ShapeNode({ shape, isSelected, onSelect, isPreview, isLocked }: Props) {
  const { updateShape } = useDocumentStore()
  const { currentTool, snapEnabled, snapGridSize, nodeEditShapeId } = useUIStore()

  const snap = (x: number, y: number) => snapEnabled
    ? { x: snapVal(x, snapGridSize), y: snapVal(y, snapGridSize) }
    : { x, y }

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!snapEnabled) return
    const node = e.target
    const s = snap(node.x(), node.y())
    node.x(s.x); node.y(s.y)
  }

  const isNodeEditing = nodeEditShapeId === shape.id
  // Locked shapes and node-edit mode shapes cannot be dragged
  const draggable = currentTool === 'select' && !isPreview && !isNodeEditing && !isLocked
  // Shapes are non-interactive in draw mode so clicks reach the Stage
  const listening = currentTool === 'select' || isPreview === true ? true : false

  const stroke = isPreview
    ? '#60a5fa'
    : isSelected
    ? '#60a5fa'
    : shape.style.stroke

  const opacity = isPreview ? 0.6 : 1

  const baseProps = {
    id: shape.id,
    stroke,
    strokeWidth: shape.style.strokeWidth,
    opacity,
    draggable,
    listening,
    dash: isPreview ? [2, 2] : undefined,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (currentTool !== 'select' || isPreview) return
      e.cancelBubble = true
      onSelect(e.evt.shiftKey)
    },
  }

  if (shape.type === 'line') {
    const s = shape as LineShape
    return (
      <Line
        {...baseProps}
        fill={shape.style.fill}
        points={s.points}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const dx = e.target.x()
          const dy = e.target.y()
          e.target.x(0); e.target.y(0)
          updateShape(shape.id, {
            points: s.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
          })
        }}
      />
    )
  }

  if (shape.type === 'rect') {
    const s = shape as RectShape
    return (
      <Rect
        {...baseProps}
        fill={shape.style.fill}
        x={s.x} y={s.y}
        width={s.width} height={s.height}
        rotation={s.rotation ?? 0}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateShape(shape.id, { x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
          const node = e.target
          const sx = node.scaleX(), sy = node.scaleY()
          node.scaleX(1); node.scaleY(1)
          updateShape(shape.id, {
            x: node.x(), y: node.y(),
            width: Math.max(0.5, s.width * sx),
            height: Math.max(0.5, s.height * sy),
            rotation: node.rotation(),
          })
        }}
      />
    )
  }

  if (shape.type === 'circle') {
    const s = shape as CircleShape
    return (
      <Circle
        {...baseProps}
        fill={shape.style.fill}
        x={s.x} y={s.y} radius={s.radius}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateShape(shape.id, { x: e.target.x(), y: e.target.y() })
        }}
      />
    )
  }

  if (shape.type === 'ellipse') {
    const s = shape as EllipseShape
    return (
      <Ellipse
        {...baseProps}
        fill={shape.style.fill}
        x={s.x} y={s.y}
        radiusX={s.radiusX} radiusY={s.radiusY}
        rotation={s.rotation ?? 0}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateShape(shape.id, { x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
          const node = e.target
          const sx = node.scaleX(), sy = node.scaleY()
          node.scaleX(1); node.scaleY(1)
          updateShape(shape.id, {
            x: node.x(), y: node.y(),
            radiusX: Math.max(0.25, s.radiusX * sx),
            radiusY: Math.max(0.25, s.radiusY * sy),
            rotation: node.rotation(),
          })
        }}
      />
    )
  }

  if (shape.type === 'text') {
    const s = shape as TextShape
    return (
      <Text
        {...baseProps}
        fill={stroke}          // text rendered via fill, not stroke
        stroke={undefined}
        x={s.x} y={s.y}
        text={s.text}
        fontSize={s.fontSize}
        fontFamily={s.fontFamily}
        rotation={s.rotation ?? 0}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateShape(shape.id, { x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
          const node = e.target
          const sx = node.scaleX()
          node.scaleX(1); node.scaleY(1)
          updateShape(shape.id, {
            x: node.x(), y: node.y(),
            fontSize: Math.max(1, s.fontSize * sx),
            rotation: node.rotation(),
          })
        }}
      />
    )
  }

  if (shape.type === 'path') {
    const s = shape as PathShape
    return (
      <Path
        {...baseProps}
        fill={shape.style.fill}
        data={s.data}
        x={s.x ?? 0} y={s.y ?? 0}
        scaleX={s.scaleX ?? 1} scaleY={s.scaleY ?? 1}
        onDragMove={onDragMove}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateShape(shape.id, { x: e.target.x(), y: e.target.y() })
        }}
      />
    )
  }

  return null
}
