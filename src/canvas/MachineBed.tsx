import { Group, Rect, Shape } from 'react-konva'
import Konva from 'konva'

interface Props {
  width: number
  height: number
  scale: number
}

// Grid spacing in machine units (mm). Inches handled in Phase 5 when units toggle lands.
const MINOR = 10
const MAJOR = 50

export default function MachineBed({ width, height, scale }: Props) {
  const lineW = 1 / scale

  const drawMinorGrid = (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath()
    for (let x = 0; x <= width; x += MINOR) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = 0; y <= height; y += MINOR) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.fillStrokeShape(shape)
  }

  const drawMajorGrid = (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath()
    for (let x = 0; x <= width; x += MAJOR) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = 0; y <= height; y += MAJOR) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.fillStrokeShape(shape)
  }

  return (
    <Group>
      {/* Bed surface */}
      <Rect x={0} y={0} width={width} height={height} fill="#1a1a1a" listening={false} />

      {/* Minor grid (10mm) */}
      <Shape
        sceneFunc={drawMinorGrid}
        stroke="#252525"
        strokeWidth={lineW}
        listening={false}
      />

      {/* Major grid (50mm) */}
      <Shape
        sceneFunc={drawMajorGrid}
        stroke="#333333"
        strokeWidth={lineW * 1.5}
        listening={false}
      />

      {/* Bed boundary */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        stroke="#3b82f6"
        strokeWidth={lineW * 2}
        fill="transparent"
        listening={false}
      />
    </Group>
  )
}
