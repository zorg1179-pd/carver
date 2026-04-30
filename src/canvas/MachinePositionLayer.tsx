import { Layer, Line, Circle } from 'react-konva'
import { useSerialStore } from '@/stores/useSerialStore'
import { useMachineStore } from '@/stores'

interface Props {
  scale: number
}

export default function MachinePositionLayer({ scale }: Props) {
  const { status, workPos } = useSerialStore()
  const { bedWidth, bedHeight, originPosition } = useMachineStore()

  if (status === 'disconnected' || !workPos) return null

  // Convert GRBL WPos (CNC: X right, Y up) → canvas coordinates (X right, Y down)
  const cx = originPosition === 'center'
    ? workPos.x + bedWidth / 2
    : workPos.x
  const cy = originPosition === 'center'
    ? bedHeight / 2 - workPos.y
    : bedHeight - workPos.y

  const lineW = 1 / scale

  return (
    <Layer listening={false}>
      {/* Horizontal crosshair line */}
      <Line
        points={[0, cy, bedWidth, cy]}
        stroke="#4caf50"
        strokeWidth={lineW * 0.5}
        opacity={0.5}
        perfectDrawEnabled={false}
      />
      {/* Vertical crosshair line */}
      <Line
        points={[cx, 0, cx, bedHeight]}
        stroke="#4caf50"
        strokeWidth={lineW * 0.5}
        opacity={0.5}
        perfectDrawEnabled={false}
      />
      {/* Outer circle */}
      <Circle
        x={cx}
        y={cy}
        radius={lineW * 4}
        stroke="#4caf50"
        strokeWidth={lineW * 0.8}
        fill="transparent"
        perfectDrawEnabled={false}
      />
      {/* Center dot */}
      <Circle
        x={cx}
        y={cy}
        radius={lineW * 1}
        fill="#4caf50"
        perfectDrawEnabled={false}
      />
    </Layer>
  )
}
