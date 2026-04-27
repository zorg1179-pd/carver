/**
 * Holding tabs (bridges) for contour through-cuts.
 *
 * At N evenly-spaced arc-length positions around the contour, the bit rises
 * to tabZ (leaving tabHeight mm of material intact) so the part stays
 * attached to the stock until the user snaps it free.
 *
 * Tab positions are snapped to the nearest existing polyline vertex for the
 * alpha; a future pass will interpolate precise split points.
 */

import type { Polyline } from './pathUtils'

export interface PathPoint {
  x: number
  y: number
  isTab: boolean
}

export function applyTabs(
  poly: Polyline,
  tabCount: number,
  tabWidth: number,
): PathPoint[] {
  const pts = poly.pts
  const n = pts.length

  if (n < 2 || tabCount <= 0 || tabWidth <= 0) {
    return pts.map(([x, y]) => ({ x, y, isTab: false }))
  }

  // Cumulative arc lengths at each vertex
  const cumLen: number[] = [0]
  for (let i = 1; i < n; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy))
  }
  const last = pts[n - 1], first = pts[0]
  const totalLen = cumLen[n - 1] + Math.hypot(first[0] - last[0], first[1] - last[1])

  if (totalLen < tabWidth * tabCount * 1.5) {
    // Perimeter too small to fit all tabs without overlap — skip
    return pts.map(([x, y]) => ({ x, y, isTab: false }))
  }

  // Tab centres equally spaced (offset by half-spacing so they don't land at vertex 0)
  const half = totalLen / tabCount
  const tabCentres = Array.from({ length: tabCount }, (_, k) => half * (k + 0.5))

  return pts.map(([x, y], i) => {
    const l = cumLen[i]
    const isTab = tabCentres.some(centre => {
      const d = Math.abs(l - centre)
      // Also handle wrap-around
      return Math.min(d, totalLen - d) < tabWidth / 2
    })
    return { x, y, isTab }
  })
}
