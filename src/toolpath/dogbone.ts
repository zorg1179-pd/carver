/**
 * Dogbone corner relief for CNC pocket / contour operations.
 *
 * A round bit can't cut a perfectly square interior corner. The dogbone fix
 * inserts a small circular overcut at each concave corner so a square-edged
 * part can fit into the pocket.
 *
 * Algorithm: for every concave vertex B (interior angle > 180°), the bit
 * visits a point offset from B along the interior bisector by toolRadius * √2
 * (exact for 90° corners, conservative for other angles). When the bit is
 * centred at that point it carves a circle of radius toolRadius, removing
 * the uncut triangular nub left by the round bit.
 */

import type { Polyline } from './pathUtils'

function signedArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    a += (bx - ax) * (by + ay)
  }
  return a / 2
}

function cross2(A: [number, number], B: [number, number], C: [number, number]): number {
  return (A[0] - B[0]) * (C[1] - B[1]) - (A[1] - B[1]) * (C[0] - B[0])
}

function norm(v: [number, number]): [number, number] {
  const l = Math.hypot(v[0], v[1])
  return l < 1e-10 ? [0, 0] : [v[0] / l, v[1] / l]
}

export function applyDogbones(poly: Polyline, toolRadius: number): Polyline {
  if (!poly.closed || poly.pts.length < 3 || toolRadius <= 0) return poly

  const pts = poly.pts
  const n = pts.length
  // Negative signed area → CCW in screen Y-down coords
  const ccw = signedArea(pts) < 0
  const newPts: [number, number][] = []

  for (let i = 0; i < n; i++) {
    const A = pts[(i - 1 + n) % n]
    const B = pts[i]
    const C = pts[(i + 1) % n]

    newPts.push(B)

    const c = cross2(A, B, C)
    // Concave corner: interior angle > 180°
    // For CCW polygon cross > 0 is concave; for CW cross < 0 is concave
    const concave = ccw ? c > 0 : c < 0
    if (!concave) continue

    const toA = norm([A[0] - B[0], A[1] - B[1]])
    const toC = norm([C[0] - B[0], C[1] - B[1]])
    const bis = norm([toA[0] + toC[0], toA[1] + toC[1]])
    if (bis[0] === 0 && bis[1] === 0) continue

    // Dogbone centre: toolRadius * √2 along the bisector into the concave region
    const cx = B[0] + bis[0] * toolRadius * Math.SQRT2
    const cy = B[1] + bis[1] * toolRadius * Math.SQRT2

    // Poke: B → dogbone_centre → B  (the bit radius removes material at centre)
    newPts.push([cx, cy], B)
  }

  return { pts: newPts, closed: poly.closed }
}
