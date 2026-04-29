/**
 * True V-carve toolpath via iterative inward polygon offsetting.
 *
 * The bit follows concentric inward offsets of the shape at increasing depths.
 * At offset radius r, depth = r / tan(halfAngle), so narrow regions are cut
 * shallower and wide regions cut deeper — the defining property of V-carving.
 *
 * Alpha note: uses the simple normal-vector offsetPolyline which is accurate
 * for convex/mildly concave shapes. Complex concave designs may show minor
 * artefacts at sharp inward corners. A Clipper-based offset (planned for
 * v2.0-beta) will handle these correctly.
 */

import type { Move } from '@/types'
import { svgPathToPolylines, offsetPolyline } from './pathUtils'

export interface VCarveParams {
  vBitAngle: number      // total included angle in degrees (e.g. 60)
  vFlatDepth?: number    // cap depth; deeper regions get cleared at this Z
  feedRate: number
  plungeRate: number
  safeHeight: number
  stockSurfaceZ: number
  stepSize?: number      // offset increment in document units (default 0.3)
}

function bboxSize(pts: [number, number][]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return Math.max(maxX - minX, maxY - minY)
}

export function computeVcarveMoves(pathData: string, params: VCarveParams): Move[] {
  const {
    vBitAngle, vFlatDepth, feedRate, plungeRate,
    safeHeight, stockSurfaceZ, stepSize = 0.3,
  } = params

  const tanHalf = Math.tan(((vBitAngle / 2) * Math.PI) / 180)

  // Accept open and closed subpaths — SVG imports often lack Z even for closed shapes.
  // Force closed=true so offsetPolyline uses bisector normals at every vertex.
  let polys = svgPathToPolylines(pathData, 0.5)
    .filter(p => p.pts.length >= 3)
    .map(p => ({ pts: p.pts, closed: true as const }))
  if (polys.length === 0) return []

  const moves: Move[] = []
  let r = 0

  for (let iter = 0; iter < 2000; iter++) {
    const depth = r / tanHalf
    const cappedDepth = vFlatDepth != null ? Math.min(depth, vFlatDepth) : depth
    const z = stockSurfaceZ - cappedDepth

    for (const poly of polys) {
      if (poly.pts.length < 2) continue
      const [sx, sy] = poly.pts[0]
      moves.push({ x: sx, y: sy, z: safeHeight, rapid: true })
      moves.push({ x: sx, y: sy, z, rapid: false, feed: plungeRate })
      for (const [x, y] of poly.pts.slice(1))
        moves.push({ x, y, z, rapid: false, feed: feedRate })
      moves.push({ x: sx, y: sy, z, rapid: false, feed: feedRate })  // close ring
      moves.push({ x: sx, y: sy, z: safeHeight, rapid: true })
    }

    // Stop if we've hit the flat-depth cap
    if (vFlatDepth != null && depth >= vFlatDepth) break

    // Inward offset for next level
    r += stepSize
    // Re-stamp closed:true so the type stays consistent with the initial forced-closed array
    const next = polys
      .map(p => ({ ...offsetPolyline(p, stepSize), closed: true as const }))
      .filter(p => p.pts.length >= 3 && bboxSize(p.pts) > stepSize * 1.5)

    if (next.length === 0) break
    polys = next
  }

  return moves
}
