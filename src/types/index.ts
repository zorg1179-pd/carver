export type Units = 'mm' | 'in'

export type BitType = 'flat-end-mill' | 'ball-nose' | 'v-bit' | 'drag-knife'

export type OperationType = 'contour' | 'pocket' | 'v-carve' | 'engrave'

export type ContourSide = 'inside' | 'outside' | 'on-line'

export interface CutConfig {
  operation: OperationType
  totalDepth: number
  maxDepthPerPass: number
  contourSide?: ContourSide
  pocketStepover?: number    // fraction: 0.0–1.0
  holeShapeIds?: string[]    // nested pocket: shape IDs that define inner holes
}

export type ShapeType = 'line' | 'rect' | 'circle' | 'ellipse' | 'text' | 'path'

interface BaseShape {
  id: string
  type: ShapeType
  style: {
    stroke: string
    fill: string
    strokeWidth: number
  }
  cutConfig?: CutConfig
}

export interface LineShape extends BaseShape {
  type: 'line'
  points: number[]   // [x1,y1, x2,y2, ...]
}

export interface RectShape extends BaseShape {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface CircleShape extends BaseShape {
  type: 'circle'
  x: number
  y: number
  radius: number
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse'
  x: number
  y: number
  radiusX: number
  radiusY: number
  rotation?: number
}

export interface TextShape extends BaseShape {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  fontFamily: string
  rotation?: number
}

export interface PathShape extends BaseShape {
  type: 'path'
  data: string       // SVG path data string
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
}

export type Shape =
  | LineShape
  | RectShape
  | CircleShape
  | EllipseShape
  | TextShape
  | PathShape

// Permissive update type — accepts any valid property from any shape variant
export type ShapeUpdate = Partial<
  Omit<LineShape, 'id' | 'type'> &
  Omit<RectShape, 'id' | 'type'> &
  Omit<CircleShape, 'id' | 'type'> &
  Omit<EllipseShape, 'id' | 'type'> &
  Omit<TextShape, 'id' | 'type'> &
  Omit<PathShape, 'id' | 'type'>
>

export interface Move {
  x: number
  y: number
  z: number
  feed?: number
  rapid: boolean
}

export interface Toolpath {
  shapeId: string
  operation: OperationType
  moves: Move[]
}
