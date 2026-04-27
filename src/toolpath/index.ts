import type { Shape, Toolpath } from '@/types'
import type { MachineParams, MaterialParams, ToolParams } from './operations'
import { contourMoves, pocketMoves, engraveMoves, vcarveMoves } from './operations'

export type { MachineParams, MaterialParams, ToolParams }

export function computeToolpath(
  shape: Shape,
  allShapes: Shape[],
  tool: ToolParams,
  machine: MachineParams,
  material: MaterialParams,
): Toolpath | null {
  const cfg = shape.cutConfig
  if (!cfg) return null

  const holeShapes = cfg.holeShapeIds
    ? cfg.holeShapeIds
        .map(id => allShapes.find(s => s.id === id))
        .filter((s): s is Shape => s != null)
    : []

  const moves = (() => {
    switch (cfg.operation) {
      case 'contour': return contourMoves(shape, cfg, tool, machine, material)
      case 'pocket':  return pocketMoves(shape, cfg, tool, machine, material, holeShapes)
      case 'engrave': return engraveMoves(shape, cfg, tool, machine, material)
      case 'v-carve': return vcarveMoves(shape, cfg, tool, machine, material)
    }
  })()

  if (!moves || !moves.length) return null
  return { shapeId: shape.id, operation: cfg.operation, moves }
}

export function computeAllToolpaths(
  shapes: Shape[],
  tool: ToolParams,
  machine: MachineParams,
  material: MaterialParams,
): Toolpath[] {
  return shapes
    .filter(s => s.cutConfig != null)
    .flatMap(s => {
      const tp = computeToolpath(s, shapes, tool, machine, material)
      return tp ? [tp] : []
    })
}
