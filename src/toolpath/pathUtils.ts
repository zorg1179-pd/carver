import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata'
import type { Shape } from '@/types'

const K = 0.5522847498  // kappa for cubic bezier circle approximation

// ── Shape → SVG path data ─────────────────────────────────────────────────
export function shapeToPathData(shape: Shape): string | null {
  switch (shape.type) {
    case 'path': return shape.data
    case 'line': {
      const p = shape.points
      if (p.length < 4) return null
      const parts = [`M${p[0]},${p[1]}`]
      for (let i = 2; i + 1 < p.length; i += 2) parts.push(`L${p[i]},${p[i+1]}`)
      return parts.join('')
    }
    case 'rect': {
      const { x, y, width: w, height: h } = shape
      if (w <= 0 || h <= 0) return null
      return `M${x},${y}H${x+w}V${y+h}H${x}Z`
    }
    case 'circle': {
      const { x: cx, y: cy, radius: r } = shape
      if (r <= 0) return null
      const k = K * r
      return `M${cx+r},${cy}` +
        `C${cx+r},${cy+k} ${cx+k},${cy+r} ${cx},${cy+r}` +
        `C${cx-k},${cy+r} ${cx-r},${cy+k} ${cx-r},${cy}` +
        `C${cx-r},${cy-k} ${cx-k},${cy-r} ${cx},${cy-r}` +
        `C${cx+k},${cy-r} ${cx+r},${cy-k} ${cx+r},${cy}Z`
    }
    case 'ellipse': {
      const { x: cx, y: cy, radiusX: rx, radiusY: ry } = shape
      if (rx <= 0 || ry <= 0) return null
      const kx = K * rx, ky = K * ry
      return `M${cx+rx},${cy}` +
        `C${cx+rx},${cy+ky} ${cx+kx},${cy+ry} ${cx},${cy+ry}` +
        `C${cx-kx},${cy+ry} ${cx-rx},${cy+ky} ${cx-rx},${cy}` +
        `C${cx-rx},${cy-ky} ${cx-kx},${cy-ry} ${cx},${cy-ry}` +
        `C${cx+kx},${cy-ry} ${cx+rx},${cy-ky} ${cx+rx},${cy}Z`
    }
    case 'text': return null
  }
}

// ── Flat polyline representation ──────────────────────────────────────────
export interface Polyline {
  pts: [number, number][]
  closed: boolean
}

// ── SVG path data → flat polylines (adaptive bezier sampling, tol in units) ──
export function svgPathToPolylines(d: string, tol = 0.1): Polyline[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmds: any[] = new SVGPathData(d)
    .transform(SVGPathDataTransformer.TO_ABS())
    .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
    .transform(SVGPathDataTransformer.NORMALIZE_ST())
    .transform(SVGPathDataTransformer.A_TO_C())
    .commands

  const polys: Polyline[] = []
  let cur: [number, number][] = []
  let cx = 0, cy = 0, sx = 0, sy = 0

  const flush = (closed: boolean) => {
    if (cur.length >= 2) polys.push({ pts: [...cur], closed })
  }

  for (const cmd of cmds) {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO:
        flush(false)
        cur = [[cmd.x, cmd.y]]
        cx = sx = cmd.x; cy = sy = cmd.y
        break
      case SVGPathData.LINE_TO:
        cur.push([cmd.x, cmd.y])
        cx = cmd.x; cy = cmd.y
        break
      case SVGPathData.CURVE_TO:
        sampleCubic(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, cur, tol)
        cx = cmd.x; cy = cmd.y
        break
      case SVGPathData.QUAD_TO: {
        // Quadratic → cubic conversion
        const qx1 = cx + (2/3) * (cmd.x1 - cx)
        const qy1 = cy + (2/3) * (cmd.y1 - cy)
        const qx2 = cmd.x + (2/3) * (cmd.x1 - cmd.x)
        const qy2 = cmd.y + (2/3) * (cmd.y1 - cmd.y)
        sampleCubic(cx, cy, qx1, qy1, qx2, qy2, cmd.x, cmd.y, cur, tol)
        cx = cmd.x; cy = cmd.y
        break
      }
      case SVGPathData.CLOSE_PATH:
        flush(true)
        cur = [[sx, sy]]
        cx = sx; cy = sy
        break
    }
  }
  flush(false)
  return polys
}

// ── Adaptive cubic bezier subdivision ────────────────────────────────────
function sampleCubic(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
  out: [number, number][], tol: number, depth = 0,
) {
  if (depth > 12) { out.push([x3, y3]); return }
  if (ptLineDist(x1, y1, x0, y0, x3, y3) <= tol &&
      ptLineDist(x2, y2, x0, y0, x3, y3) <= tol) {
    out.push([x3, y3])
    return
  }
  const m01x=(x0+x1)/2, m01y=(y0+y1)/2
  const m12x=(x1+x2)/2, m12y=(y1+y2)/2
  const m23x=(x2+x3)/2, m23y=(y2+y3)/2
  const m012x=(m01x+m12x)/2, m012y=(m01y+m12y)/2
  const m123x=(m12x+m23x)/2, m123y=(m12y+m23y)/2
  const mx=(m012x+m123x)/2, my=(m012y+m123y)/2
  sampleCubic(x0,y0, m01x,m01y, m012x,m012y, mx,my, out, tol, depth+1)
  sampleCubic(mx,my, m123x,m123y, m23x,m23y, x3,y3, out, tol, depth+1)
}

function ptLineDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx-ax, dy = by-ay
  const len2 = dx*dx + dy*dy
  if (len2 < 1e-12) return Math.hypot(px-ax, py-ay)
  const t = ((px-ax)*dx + (py-ay)*dy) / len2
  return Math.hypot(px-ax-t*dx, py-ay-t*dy)
}

// ── Normal-vector polyline offset (works for convex/mildly concave paths) ──
export function offsetPolyline(poly: Polyline, dist: number): Polyline {
  if (Math.abs(dist) < 1e-6) return poly
  const { pts, closed } = poly
  const n = pts.length
  if (n < 2) return poly
  const out: [number, number][] = []

  for (let i = 0; i < n; i++) {
    // For open polyline endpoints, use single-edge normal
    if (!closed && (i === 0 || i === n - 1)) {
      const [ax, ay] = i === 0 ? pts[0] : pts[n-2]
      const [bx, by] = i === 0 ? pts[1] : pts[n-1]
      const len = Math.hypot(bx-ax, by-ay)
      if (len < 1e-10) { out.push(pts[i]); continue }
      const nx = -(by-ay)/len, ny = (bx-ax)/len
      out.push([pts[i][0]+nx*dist, pts[i][1]+ny*dist])
      continue
    }
    const prev = pts[(i-1+n)%n], curr = pts[i], next = pts[(i+1)%n]
    const e1x=curr[0]-prev[0], e1y=curr[1]-prev[1]
    const e2x=next[0]-curr[0], e2y=next[1]-curr[1]
    const l1=Math.hypot(e1x,e1y), l2=Math.hypot(e2x,e2y)
    if (l1<1e-10||l2<1e-10) { out.push(curr); continue }
    const n1x=-e1y/l1, n1y=e1x/l1
    const n2x=-e2y/l2, n2y=e2x/l2
    let bx=n1x+n2x, by_=n1y+n2y
    const bl=Math.hypot(bx,by_)
    if (bl<1e-10) { bx=n1x; by_=n1y }
    else { bx/=bl; by_/=bl }
    const dot=bx*n1x+by_*n1y
    const scale = Math.abs(dot)>0.1 ? dist/dot : dist
    out.push([curr[0]+bx*scale, curr[1]+by_*scale])
  }
  return { pts: out, closed }
}

// ── Scanline: sorted X intersection values at a given Y ──────────────────
export function scanlineX(polys: Polyline[], y: number): number[] {
  const xs: number[] = []
  for (const { pts, closed } of polys) {
    const n = pts.length
    const limit = closed ? n : n-1
    for (let i = 0; i < limit; i++) {
      const j = (i+1)%n
      const [x1,y1]=pts[i], [x2,y2]=pts[j]
      if ((y1<=y && y<y2)||(y2<=y && y<y1))
        xs.push(x1+(y-y1)*(x2-x1)/(y2-y1))
    }
  }
  return xs
}
