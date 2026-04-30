import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata'
import type { Shape } from '@/types'

const K = 0.5522847498  // kappa for cubic bezier circle approximation

/**
 * Apply a rotation of `deg` degrees around pivot point (px, py) to a path data string.
 * Uses the SVG affine matrix for rotation-about-a-point:
 *   x' = cosθ·x − sinθ·y + px(1−cosθ) + py·sinθ
 *   y' = sinθ·x + cosθ·y + py(1−cosθ) − px·sinθ
 */
function rotatePath(data: string, deg: number, px: number, py: number): string {
  if (!deg) return data
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return new SVGPathData(data)
    .transform(SVGPathDataTransformer.TO_ABS())
    .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
    .transform(SVGPathDataTransformer.MATRIX(
      cos, sin, -sin, cos,
      px * (1 - cos) + py * sin,
      py * (1 - cos) - px * sin,
    ))
    .encode()
}

// ── Shape → SVG path data ─────────────────────────────────────────────────
export function shapeToPathData(shape: Shape): string | null {
  switch (shape.type) {
    case 'path': {
      const { data, x = 0, y = 0, scaleX = 1, scaleY = 1 } = shape
      // Apply the shape's positional transform so toolpath coords match the canvas.
      // Other shape types bake x/y into their path strings; path shapes delegate
      // rendering to Konva's element-level props, so we must do it explicitly here.
      if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1) return data
      return new SVGPathData(data)
        .transform(SVGPathDataTransformer.TO_ABS())
        .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
        .transform(SVGPathDataTransformer.MATRIX(scaleX, 0, 0, scaleY, x, y))
        .encode()
    }
    case 'line': {
      const p = shape.points
      if (p.length < 4) return null
      const parts = [`M${p[0]},${p[1]}`]
      for (let i = 2; i + 1 < p.length; i += 2) parts.push(`L${p[i]},${p[i+1]}`)
      return parts.join('')
    }
    case 'rect': {
      const { x, y, width: w, height: h, rotation } = shape
      if (w <= 0 || h <= 0) return null
      const data = `M${x},${y}H${x+w}V${y+h}H${x}Z`
      // Konva rotates a Rect around its top-left corner (x, y)
      return rotatePath(data, rotation ?? 0, x, y)
    }
    case 'circle': {
      const { x: cx, y: cy, radius: r } = shape
      if (r <= 0) return null
      const k = K * r
      // Circles are rotationally symmetric — no rotation transform needed
      return `M${cx+r},${cy}` +
        `C${cx+r},${cy+k} ${cx+k},${cy+r} ${cx},${cy+r}` +
        `C${cx-k},${cy+r} ${cx-r},${cy+k} ${cx-r},${cy}` +
        `C${cx-r},${cy-k} ${cx-k},${cy-r} ${cx},${cy-r}` +
        `C${cx+k},${cy-r} ${cx+r},${cy-k} ${cx+r},${cy}Z`
    }
    case 'ellipse': {
      const { x: cx, y: cy, radiusX: rx, radiusY: ry, rotation } = shape
      if (rx <= 0 || ry <= 0) return null
      const kx = K * rx, ky = K * ry
      // Generate axis-aligned ellipse first, then rotate around its centre
      const data = `M${cx+rx},${cy}` +
        `C${cx+rx},${cy+ky} ${cx+kx},${cy+ry} ${cx},${cy+ry}` +
        `C${cx-kx},${cy+ry} ${cx-rx},${cy+ky} ${cx-rx},${cy}` +
        `C${cx-rx},${cy-ky} ${cx-kx},${cy-ry} ${cx},${cy-ry}` +
        `C${cx+kx},${cy-ry} ${cx+rx},${cy-ky} ${cx+rx},${cy}Z`
      // Konva rotates an Ellipse around its centre (cx, cy)
      return rotatePath(data, rotation ?? 0, cx, cy)
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

// ── Internal helpers ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encodeCmds(cmds: any[]): string {
  return cmds.map(cmd => {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO:    return `M${cmd.x},${cmd.y}`
      case SVGPathData.LINE_TO:    return `L${cmd.x},${cmd.y}`
      case SVGPathData.CURVE_TO:   return `C${cmd.x1},${cmd.y1} ${cmd.x2},${cmd.y2} ${cmd.x},${cmd.y}`
      case SVGPathData.CLOSE_PATH: return 'Z'
      default: return ''
    }
  }).filter(Boolean).join(' ')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(data: string): any[] {
  return (new SVGPathData(data) as any)
    .transform(SVGPathDataTransformer.TO_ABS())
    .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
    .transform(SVGPathDataTransformer.NORMALIZE_ST())
    .commands
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anchorIndices(cmds: any[]): number[] {
  return cmds.reduce<number[]>((acc, cmd, i) => {
    if (cmd.type === SVGPathData.MOVE_TO  ||
        cmd.type === SVGPathData.LINE_TO  ||
        cmd.type === SVGPathData.CURVE_TO) acc.push(i)
    return acc
  }, [])
}

// ── reversePath ───────────────────────────────────────────────────────────────
export function reversePath(data: string): string {
  const cmds = normalise(data)
  // Detect closure from original string: NORMALIZE_HVZ expands Z → explicit L,
  // so cmds no longer ends with CLOSE_PATH after normalization.
  const closed = /[Zz]\s*$/.test(data.trim())
  // Drop the Z-expanded closing L so we don't duplicate it when reversing
  const working = closed ? cmds.slice(0, -1) : cmds
  if (working.length === 0) return data

  const last = working[working.length - 1]
  const parts: string[] = [`M${last.x},${last.y}`]

  for (let i = working.length - 1; i >= 1; i--) {
    const prev = working[i - 1]
    const curr = working[i]
    const dx = (prev as any).x
    const dy = (prev as any).y
    if (curr.type === SVGPathData.LINE_TO || curr.type === SVGPathData.MOVE_TO) {
      parts.push(`L${dx},${dy}`)
    } else if (curr.type === SVGPathData.CURVE_TO) {
      parts.push(`C${(curr as any).x2},${(curr as any).y2} ${(curr as any).x1},${(curr as any).y1} ${dx},${dy}`)
    }
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}

// ── openClosePath ─────────────────────────────────────────────────────────────
export function openClosePath(data: string): string {
  const t = data.trim()
  if (/[Zz]$/.test(t)) return t.slice(0, -1).trim()
  return t + ' Z'
}

// ── joinPaths ─────────────────────────────────────────────────────────────────
export function joinPaths(parts: string[]): string {
  return parts.join(' ')
}

// ── insertNodeAt ──────────────────────────────────────────────────────────────
export function insertNodeAt(data: string, segmentIdx: number, t: number): string {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const fromIdx = idxs[segmentIdx]
  const toIdx   = idxs[segmentIdx + 1]
  if (toIdx === undefined) return data

  const from = cmds[fromIdx]
  const to   = cmds[toIdx]
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u
  const lp   = (ax: number, ay: number, bx: number, by: number, u: number) =>
    ({ x: lerp(ax, bx, u), y: lerp(ay, by, u) })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inserted: any[]
  if (to.type === SVGPathData.LINE_TO) {
    const s = lp(from.x, from.y, to.x, to.y, t)
    inserted = [
      { type: SVGPathData.LINE_TO, x: s.x,  y: s.y,  relative: false },
      { type: SVGPathData.LINE_TO, x: to.x, y: to.y, relative: false },
    ]
  } else if (to.type === SVGPathData.CURVE_TO) {
    const p0 = { x: from.x, y: from.y }
    const p1 = { x: to.x1,  y: to.y1  }
    const p2 = { x: to.x2,  y: to.y2  }
    const p3 = { x: to.x,   y: to.y   }
    const q0 = lp(p0.x, p0.y, p1.x, p1.y, t)
    const q1 = lp(p1.x, p1.y, p2.x, p2.y, t)
    const q2 = lp(p2.x, p2.y, p3.x, p3.y, t)
    const r0 = lp(q0.x, q0.y, q1.x, q1.y, t)
    const r1 = lp(q1.x, q1.y, q2.x, q2.y, t)
    const s  = lp(r0.x, r0.y, r1.x, r1.y, t)
    inserted = [
      { type: SVGPathData.CURVE_TO, x1: q0.x, y1: q0.y, x2: r0.x, y2: r0.y, x: s.x,  y: s.y,  relative: false },
      { type: SVGPathData.CURVE_TO, x1: r1.x, y1: r1.y, x2: q2.x, y2: q2.y, x: p3.x, y: p3.y, relative: false },
    ]
  } else {
    return data
  }

  return encodeCmds([...cmds.slice(0, toIdx), ...inserted, ...cmds.slice(toIdx + 1)])
}

// ── deleteNode ────────────────────────────────────────────────────────────────
export function deleteNode(data: string, nodeIdx: number): string {
  // Detect closure before normalise() — NORMALIZE_HVZ expands Z → explicit L,
  // so CLOSE_PATH is never present in the normalised command list.
  const closed = /[Zz]\s*$/.test(data.trim())
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  if (nodeIdx <= 0 || nodeIdx >= idxs.length) return data

  const prevCmdIdx = idxs[nodeIdx - 1]
  const thisCmdIdx = idxs[nodeIdx]
  const nextCmdIdx = idxs[nodeIdx + 1]

  if (nextCmdIdx === undefined) {
    const encoded = encodeCmds(cmds.slice(0, thisCmdIdx))
    return closed ? encoded + ' Z' : encoded
  }

  const prevAnchor = cmds[prevCmdIdx]
  const thisCmd    = cmds[thisCmdIdx]
  const nextCmd    = cmds[nextCmdIdx]

  const cp1 = thisCmd.type === SVGPathData.CURVE_TO
    ? { x: thisCmd.x1, y: thisCmd.y1 }
    : { x: prevAnchor.x, y: prevAnchor.y }

  const cp2 = nextCmd.type === SVGPathData.CURVE_TO
    ? { x: nextCmd.x2, y: nextCmd.y2 }
    : { x: nextCmd.x,  y: nextCmd.y  }

  const isLine = cp1.x === prevAnchor.x && cp1.y === prevAnchor.y
              && cp2.x === nextCmd.x    && cp2.y === nextCmd.y

  const newSeg = isLine
    ? { type: SVGPathData.LINE_TO, x: nextCmd.x, y: nextCmd.y, relative: false }
    : { type: SVGPathData.CURVE_TO, x1: cp1.x, y1: cp1.y, x2: cp2.x, y2: cp2.y,
        x: nextCmd.x, y: nextCmd.y, relative: false }

  const encoded = encodeCmds([
    ...cmds.slice(0, thisCmdIdx),
    newSeg,
    ...cmds.slice(nextCmdIdx + 1),
  ])
  return closed ? encoded + ' Z' : encoded
}

// ── breakPath ─────────────────────────────────────────────────────────────────
export function breakPath(data: string, nodeIdx: number): [string, string] {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  if (nodeIdx <= 0 || nodeIdx >= idxs.length - 1) return [data, '']

  const breakIdx = idxs[nodeIdx]
  const breakCmd = cmds[breakIdx]

  // NORMALIZE_HVZ removes CLOSE_PATH tokens, so no filter needed here.
  const path1 = cmds.slice(0, breakIdx + 1)
  const path2 = [
    { type: SVGPathData.MOVE_TO, x: breakCmd.x, y: breakCmd.y, relative: false },
    ...cmds.slice(breakIdx + 1),
  ]

  return [encodeCmds(path1), encodeCmds(path2)]
}

// ── convertSegment ────────────────────────────────────────────────────────────
export function convertSegment(data: string, segmentIdx: number): string {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const fromIdx = idxs[segmentIdx]
  const toIdx   = idxs[segmentIdx + 1]
  if (toIdx === undefined) return data

  const from = cmds[fromIdx]
  const to   = cmds[toIdx]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let newCmd: any
  if (to.type === SVGPathData.LINE_TO) {
    newCmd = {
      type: SVGPathData.CURVE_TO,
      x1: from.x + (to.x - from.x) / 3,
      y1: from.y + (to.y - from.y) / 3,
      x2: from.x + 2 * (to.x - from.x) / 3,
      y2: from.y + 2 * (to.y - from.y) / 3,
      x: to.x, y: to.y, relative: false,
    }
  } else if (to.type === SVGPathData.CURVE_TO) {
    newCmd = { type: SVGPathData.LINE_TO, x: to.x, y: to.y, relative: false }
  } else {
    return data
  }

  return encodeCmds([...cmds.slice(0, toIdx), newCmd, ...cmds.slice(toIdx + 1)])
}

// ── findSegmentHit ────────────────────────────────────────────────────────────
export function findSegmentHit(
  data: string,
  px: number, py: number,
  threshold: number,
): { segmentIdx: number; t: number } | null {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const SAMPLES = 20

  for (let seg = 0; seg < idxs.length - 1; seg++) {
    const from  = cmds[idxs[seg]]
    const toCmd = cmds[idxs[seg + 1]]
    let best = Infinity, bestT = 0

    for (let k = 0; k <= SAMPLES; k++) {
      const u = k / SAMPLES
      let bx: number, by: number
      if (toCmd.type === SVGPathData.LINE_TO) {
        bx = from.x + (toCmd.x - from.x) * u
        by = from.y + (toCmd.y - from.y) * u
      } else if (toCmd.type === SVGPathData.CURVE_TO) {
        const mt = 1 - u
        bx = mt*mt*mt*from.x + 3*mt*mt*u*toCmd.x1 + 3*mt*u*u*toCmd.x2 + u*u*u*toCmd.x
        by = mt*mt*mt*from.y + 3*mt*mt*u*toCmd.y1 + 3*mt*u*u*toCmd.y2 + u*u*u*toCmd.y
      } else continue
      const d = Math.hypot(px - bx, py - by)
      if (d < best) { best = d; bestT = u }
    }
    if (best <= threshold) return { segmentIdx: seg, t: bestT }
  }
  return null
}

// ── weldNearestEndpoints ──────────────────────────────────────────────────────
function pathEndpoints(data: string): { start: { x:number;y:number }; end: { x:number;y:number } } {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const first = cmds[idxs[0]]
  const last  = cmds[idxs[idxs.length - 1]]
  return { start: { x: first.x, y: first.y }, end: { x: last.x, y: last.y } }
}

export function weldNearestEndpoints(dataA: string, dataB: string): string {
  const epA = pathEndpoints(dataA)
  const epB = pathEndpoints(dataB)
  const d   = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y)

  const opts = [
    { distAB: d(epA.end,   epB.start), aRev: false, bRev: false },
    { distAB: d(epA.end,   epB.end),   aRev: false, bRev: true  },
    { distAB: d(epA.start, epB.start), aRev: true,  bRev: false },
    { distAB: d(epA.start, epB.end),   aRev: true,  bRev: true  },
  ].sort((a, b) => a.distAB - b.distAB)[0]

  const a = opts.aRev ? reversePath(dataA) : dataA
  const b = opts.bRev ? reversePath(dataB) : dataB

  const endA   = pathEndpoints(a).end
  const startB = pathEndpoints(b).start
  const SNAP   = 0.01

  // Strip the leading M from b using a normalise/encodeCmds round-trip rather than
  // a regex, so that coordinates in scientific notation (e.g. 1e-10) are handled correctly.
  const bTail = encodeCmds(normalise(b.trim()).slice(1))

  if (Math.hypot(endA.x - startB.x, endA.y - startB.y) < SNAP) {
    return a.trim() + ' ' + bTail
  }
  return a.trim() + ` L${startB.x},${startB.y} ` + bTail
}
