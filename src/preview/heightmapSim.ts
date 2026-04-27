import type { Toolpath } from '@/types'
import type { BitType } from '@/types'

export interface SimParams {
  bedWidth: number
  bedHeight: number
  thickness: number
  bitType: BitType
  diameter: number
  vBitAngle: number
  resolution: number   // pixels per side (e.g. 256 or 512)
}

export interface HeightmapResult {
  data: Float32Array   // [row * width + col] = Z value; 0 = surface, negative = cut
  width: number
  height: number
}

export function simulateHeightmap(
  toolpaths: Toolpath[],
  params: SimParams,
): HeightmapResult {
  const { bedWidth, bedHeight, thickness, bitType, diameter, vBitAngle, resolution: res } = params

  const scaleX = res / bedWidth
  const scaleY = res / bedHeight
  const R = diameter / 2
  const halfAngleRad = (vBitAngle / 2) * (Math.PI / 180)
  const tanHalf = Math.tan(halfAngleRad) || 1e-6

  // All zeroes = stock surface untouched
  const data = new Float32Array(res * res)

  for (const tp of toolpaths) {
    const moves = tp.moves
    if (moves.length === 0) continue

    let prevX = moves[0].x
    let prevY = moves[0].y

    for (let mi = 1; mi < moves.length; mi++) {
      const move = moves[mi]
      const x1 = move.x, y1 = move.y, z = move.z
      const x0 = prevX, y0 = prevY
      prevX = x1; prevY = y1

      // Skip rapids and moves at or above surface
      if (move.rapid || z >= 0) continue

      const segDx = x1 - x0
      const segDy = y1 - y0
      const segLen2 = segDx * segDx + segDy * segDy

      // Scan pixels in the bounding box of the swept tool path
      const minPx = Math.max(0, Math.floor((Math.min(x0, x1) - R) * scaleX))
      const maxPx = Math.min(res - 1, Math.ceil((Math.max(x0, x1) + R) * scaleX))
      const minPy = Math.max(0, Math.floor((Math.min(y0, y1) - R) * scaleY))
      const maxPy = Math.min(res - 1, Math.ceil((Math.max(y0, y1) + R) * scaleY))

      for (let py = minPy; py <= maxPy; py++) {
        const wy = (py + 0.5) / scaleY

        for (let px = minPx; px <= maxPx; px++) {
          const wx = (px + 0.5) / scaleX

          // Distance from pixel centre to nearest point on segment
          let r: number
          if (segLen2 < 1e-12) {
            const dx = wx - x0, dy = wy - y0
            r = Math.sqrt(dx * dx + dy * dy)
          } else {
            const t = Math.max(0, Math.min(1,
              ((wx - x0) * segDx + (wy - y0) * segDy) / segLen2))
            const cpx = x0 + t * segDx
            const cpy = y0 + t * segDy
            const dx = wx - cpx, dy = wy - cpy
            r = Math.sqrt(dx * dx + dy * dy)
          }

          // Z that the tool removes at this lateral distance
          let zPix: number
          if (bitType === 'flat-end-mill' || bitType === 'drag-knife') {
            if (r > R) continue
            zPix = z
          } else if (bitType === 'ball-nose') {
            if (r > R) continue
            // Ball centre is at z+R; sphere surface at distance r from centreline
            zPix = z + R - Math.sqrt(Math.max(0, R * R - r * r))
          } else {
            // v-bit: depth tapers outward; zPix = z + r/tan(halfAngle)
            zPix = z + r / tanHalf
            if (zPix >= 0) continue   // outside the V-bit cutting cone
          }

          // Clamp to stock bottom so we don't dig below the bed
          if (zPix < -thickness) zPix = -thickness

          // Keep minimum (deepest) Z across all moves
          const idx = py * res + px
          if (zPix < data[idx]) data[idx] = zPix
        }
      }
    }
  }

  return { data, width: res, height: res }
}
