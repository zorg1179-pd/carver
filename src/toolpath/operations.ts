import type { Move, CutConfig, Shape } from '@/types'
import { shapeToPathData, svgPathToPolylines, offsetPolyline, scanlineX } from './pathUtils'
import { subtractPaths } from './booleanOps'

export interface MachineParams { safeHeight: number }
export interface MaterialParams { stockSurfaceZ: number }
export interface ToolParams {
  diameter: number
  feedRate: number
  plungeRate: number
  maxDepthPerPass: number
  vBitAngle?: number
}

// ── Z depths for each pass (surface-relative, negative = cutting) ─────────
function passeZ(totalDepth: number, maxPerPass: number, surfaceZ: number): number[] {
  const n = Math.max(1, Math.ceil(totalDepth / maxPerPass))
  const step = totalDepth / n
  return Array.from({ length: n }, (_, i) => surfaceZ - step * (i+1))
}

function rapid(x: number, y: number, z: number): Move { return { x, y, z, rapid: true } }
function feed(x: number, y: number, z: number, f: number): Move { return { x, y, z, rapid: false, feed: f } }

// ── Contour ───────────────────────────────────────────────────────────────
export function contourMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
): Move[] {
  const d = shapeToPathData(shape)
  if (!d) return []

  const side = cfg.contourSide ?? 'on-line'
  const offsetDist = side === 'on-line' ? 0
    : side === 'outside'               ?  tool.diameter / 2
    :                                    -tool.diameter / 2  // inside

  let polys = svgPathToPolylines(d)
  if (offsetDist !== 0) polys = polys.map(p => offsetPolyline(p, offsetDist))

  const zs  = passeZ(cfg.totalDepth, cfg.maxDepthPerPass, material.stockSurfaceZ)
  const safe = machine.safeHeight
  const moves: Move[] = []

  for (const poly of polys) {
    if (poly.pts.length < 2) continue
    const [sx, sy] = poly.pts[0]

    for (const z of zs) {
      moves.push(rapid(sx, sy, safe))
      moves.push(feed(sx, sy, z, tool.plungeRate))
      for (const [x, y] of poly.pts.slice(1))
        moves.push(feed(x, y, z, tool.feedRate))
      if (poly.closed)
        moves.push(feed(sx, sy, z, tool.feedRate))
    }
    const last = poly.pts[poly.pts.length - 1]
    moves.push(rapid(last[0], last[1], safe))
  }
  return moves
}

// ── Pocket (raster fill, boustrophedon) ──────────────────────────────────
export function pocketMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
  holeShapes: Shape[] = [],
): Move[] {
  let d = shapeToPathData(shape)
  if (!d) return []

  // Boolean subtract any hole shapes before computing fill
  if (holeShapes.length > 0) {
    const holePaths = holeShapes
      .map(h => shapeToPathData(h))
      .filter((p): p is string => p !== null)
    if (holePaths.length) {
      const subtracted = subtractPaths(d, holePaths)
      if (subtracted) d = subtracted
    }
  }

  const r    = tool.diameter / 2
  const step = Math.max(tool.diameter * (cfg.pocketStepover ?? 0.4), 0.01)
  const polys = svgPathToPolylines(d)
  if (!polys.length) return []

  let minY = Infinity, maxY = -Infinity
  for (const { pts } of polys)
    for (const [, y] of pts) { minY=Math.min(minY,y); maxY=Math.max(maxY,y) }

  const zs   = passeZ(cfg.totalDepth, cfg.maxDepthPerPass, material.stockSurfaceZ)
  const safe = machine.safeHeight
  const moves: Move[] = []

  for (const z of zs) {
    let row = 0
    let lastPt: [number, number] | null = null

    for (let y = minY + r; y <= maxY - r + 1e-6; y += step, row++) {
      const xs = scanlineX(polys, y).sort((a, b) => a - b)
      for (let i = 0; i+1 < xs.length; i += 2) {
        const x1 = xs[i] + r, x2 = xs[i+1] - r
        if (x1 >= x2) continue

        // Zigzag direction
        const fromX = row%2===0 ? x1 : x2
        const toX   = row%2===0 ? x2 : x1

        if (!lastPt) {
          moves.push(rapid(fromX, y, safe))
          moves.push(feed(fromX, y, z, tool.plungeRate))
        } else {
          moves.push(rapid(fromX, y, z))   // short rapid between rows at cut depth
        }
        moves.push(feed(toX, y, z, tool.feedRate))
        lastPt = [toX, y]
      }
    }
    if (lastPt) moves.push(rapid(lastPt[0], lastPt[1], safe))
  }
  return moves
}

// ── Engrave (on-line, as shallow as cfg.totalDepth dictates) ──────────────
export function engraveMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
): Move[] {
  return contourMoves(shape, { ...cfg, contourSide: 'on-line' }, tool, machine, material)
}

// ── V-carve (simplified: on-line contour — full medial-axis is v2) ────────
export function vcarveMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
): Move[] {
  return contourMoves(shape, { ...cfg, contourSide: 'on-line' }, tool, machine, material)
}
