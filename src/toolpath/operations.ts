import type { Move, CutConfig, Shape } from '@/types'
import { shapeToPathData, svgPathToPolylines, offsetPolyline, scanlineX } from './pathUtils'
import { subtractPaths } from './booleanOps'
import { computeVcarveMoves } from './vcarve'
import { applyDogbones } from './dogbone'
import { applyTabs } from './tabs'

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
  return Array.from({ length: n }, (_, i) => surfaceZ - step * (i + 1))
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
    : side === 'outside' ?  tool.diameter / 2
    :                       -tool.diameter / 2

  let polys = svgPathToPolylines(d)
  if (offsetDist !== 0) polys = polys.map(p => offsetPolyline(p, offsetDist))
  if (cfg.dogbone) polys = polys.map(p => applyDogbones(p, tool.diameter / 2))

  const hasTabs = (cfg.tabCount ?? 0) > 0 && cfg.tabWidth != null && cfg.tabHeight != null
  // tabZ: the Z the bit rises to at tab positions (tabHeight mm of material left from surface)
  const tabZ = material.stockSurfaceZ - (cfg.tabHeight ?? 2)

  const zs = passeZ(cfg.totalDepth, cfg.maxDepthPerPass, material.stockSurfaceZ)
  const safe = machine.safeHeight
  const moves: Move[] = []

  for (const poly of polys) {
    if (poly.pts.length < 2) continue

    const pathPts = hasTabs
      ? applyTabs(poly, cfg.tabCount!, cfg.tabWidth!)
      : poly.pts.map(([x, y]) => ({ x, y, isTab: false }))

    const sx = pathPts[0].x, sy = pathPts[0].y

    for (const z of zs) {
      // Only raise for tabs when this pass cuts deeper than the tab zone
      const useTabs = hasTabs && z < tabZ

      moves.push(rapid(sx, sy, safe))
      moves.push(feed(sx, sy, useTabs && pathPts[0].isTab ? tabZ : z, tool.plungeRate))

      for (const pt of pathPts.slice(1)) {
        const ptZ = useTabs && pt.isTab ? tabZ : z
        moves.push(feed(pt.x, pt.y, ptZ, tool.feedRate))
      }

      if (poly.closed) {
        moves.push(feed(sx, sy, useTabs && pathPts[0].isTab ? tabZ : z, tool.feedRate))
      }
    }

    const last = pathPts[pathPts.length - 1]
    moves.push(rapid(last.x, last.y, safe))
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
  let polys = svgPathToPolylines(d)
  if (!polys.length) return []

  let minY = Infinity, maxY = -Infinity
  for (const { pts } of polys)
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }

  const zs   = passeZ(cfg.totalDepth, cfg.maxDepthPerPass, material.stockSurfaceZ)
  const safe = machine.safeHeight
  const moves: Move[] = []

  for (const z of zs) {
    let row = 0
    let lastPt: [number, number] | null = null

    for (let y = minY + r; y <= maxY - r + 1e-6; y += step, row++) {
      const xs = scanlineX(polys, y).sort((a, b) => a - b)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x1 = xs[i] + r, x2 = xs[i + 1] - r
        if (x1 >= x2) continue

        const fromX = row % 2 === 0 ? x1 : x2
        const toX   = row % 2 === 0 ? x2 : x1

        if (!lastPt) {
          moves.push(rapid(fromX, y, safe))
          moves.push(feed(fromX, y, z, tool.plungeRate))
        } else {
          moves.push(rapid(fromX, y, z))
        }
        moves.push(feed(toX, y, z, tool.feedRate))
        lastPt = [toX, y]
      }
    }
    if (lastPt) moves.push(rapid(lastPt[0], lastPt[1], safe))
  }

  // Cleanup contour pass with dogbone if requested
  if (cfg.dogbone) {
    const cleanupCfg: CutConfig = {
      ...cfg,
      operation: 'contour',
      contourSide: 'on-line',
      tabCount: 0,
    }
    moves.push(...contourMoves(shape, cleanupCfg, tool, machine, material))
  }

  return moves
}

// ── Engrave ───────────────────────────────────────────────────────────────
export function engraveMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
): Move[] {
  return contourMoves(shape, { ...cfg, contourSide: 'on-line' }, tool, machine, material)
}

// ── V-carve (true medial-axis depth via iterative inward offset) ──────────
export function vcarveMoves(
  shape: Shape, cfg: CutConfig,
  tool: ToolParams, machine: MachineParams, material: MaterialParams,
): Move[] {
  const d = shapeToPathData(shape)
  if (!d) return []

  return computeVcarveMoves(d, {
    vBitAngle: tool.vBitAngle ?? 60,
    vFlatDepth: cfg.vFlatDepth,
    feedRate: tool.feedRate,
    plungeRate: tool.plungeRate,
    safeHeight: machine.safeHeight,
    stockSurfaceZ: material.stockSurfaceZ,
  })
}
