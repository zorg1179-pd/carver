import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata'
import type { PathShape } from '@/types'

// ── SVG 2D matrix  (column-vector convention: x' = a·x + c·y + e) ─────────────
interface Mat { a:number; b:number; c:number; d:number; e:number; f:number }
const I: Mat = { a:1, b:0, c:0, d:1, e:0, f:0 }

function mul(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a*m2.a + m1.c*m2.b,
    b: m1.b*m2.a + m1.d*m2.b,
    c: m1.a*m2.c + m1.c*m2.d,
    d: m1.b*m2.c + m1.d*m2.d,
    e: m1.a*m2.e + m1.c*m2.f + m1.e,
    f: m1.b*m2.e + m1.d*m2.f + m1.f,
  }
}

// ── Parse SVG transform attribute  e.g. "translate(10,20) rotate(45)" ─────────
function parseTransformAttr(attr: string): Mat {
  let r = { ...I }
  const re = /(\w+)\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attr)) !== null) {
    const type = m[1]
    const a = m[2].trim().split(/[\s,]+/).map(Number)
    switch (type) {
      case 'matrix':
        r = mul(r, { a:a[0], b:a[1], c:a[2], d:a[3], e:a[4], f:a[5] }); break
      case 'translate':
        r = mul(r, { ...I, e:a[0], f:a[1]??0 }); break
      case 'scale':
        r = mul(r, { a:a[0], b:0, c:0, d:a[1]??a[0], e:0, f:0 }); break
      case 'rotate': {
        const ang = a[0] * Math.PI / 180
        const cos = Math.cos(ang), sin = Math.sin(ang)
        const R: Mat = { a:cos, b:sin, c:-sin, d:cos, e:0, f:0 }
        const [cx, cy] = [a[1]??0, a[2]??0]
        r = cx || cy
          ? mul(r, mul({ ...I, e:cx, f:cy }, mul(R, { ...I, e:-cx, f:-cy })))
          : mul(r, R)
        break
      }
      case 'skewX': r = mul(r, { a:1, b:0, c:Math.tan(a[0]*Math.PI/180), d:1, e:0, f:0 }); break
      case 'skewY': r = mul(r, { a:1, b:Math.tan(a[0]*Math.PI/180), c:0, d:1, e:0, f:0 }); break
    }
  }
  return r
}

// ── SVG dimension with optional units → mm ─────────────────────────────────────
function dimToMm(v: string | null): number | null {
  if (!v) return null
  const m = v.trim().match(/^([+-]?[\d.]+)\s*(px|mm|cm|in|pt)?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  switch (m[2]) {
    case 'mm': return n
    case 'cm': return n * 10
    case 'in': return n * 25.4
    case 'pt': return n * (25.4 / 72)
    default:   return n * (25.4 / 96)   // unitless / px → 96 dpi
  }
}

// ── Geometry helpers: shape primitives → SVG path strings ─────────────────────
const K = 0.5522847498   // 4/3·tan(π/8), bezier circle approximation

function rectToPath(x:number, y:number, w:number, h:number, rx:number, ry:number): string {
  const r = Math.min(rx, ry, w/2, h/2)
  if (r <= 0) return `M${x},${y}H${x+w}V${y+h}H${x}Z`
  return (
    `M${x+r},${y}H${x+w-r}A${r},${r} 0 0 1 ${x+w},${y+r}` +
    `V${y+h-r}A${r},${r} 0 0 1 ${x+w-r},${y+h}` +
    `H${x+r}A${r},${r} 0 0 1 ${x},${y+h-r}` +
    `V${y+r}A${r},${r} 0 0 1 ${x+r},${y}Z`
  )
}

function circleToPath(cx:number, cy:number, r:number): string {
  const k = K*r
  return (
    `M${cx+r},${cy}C${cx+r},${cy+k} ${cx+k},${cy+r} ${cx},${cy+r}` +
    `C${cx-k},${cy+r} ${cx-r},${cy+k} ${cx-r},${cy}` +
    `C${cx-r},${cy-k} ${cx-k},${cy-r} ${cx},${cy-r}` +
    `C${cx+k},${cy-r} ${cx+r},${cy-k} ${cx+r},${cy}Z`
  )
}

function ellipseToPath(cx:number, cy:number, rx:number, ry:number): string {
  const kx = K*rx, ky = K*ry
  return (
    `M${cx+rx},${cy}C${cx+rx},${cy+ky} ${cx+kx},${cy+ry} ${cx},${cy+ry}` +
    `C${cx-kx},${cy+ry} ${cx-rx},${cy+ky} ${cx-rx},${cy}` +
    `C${cx-rx},${cy-ky} ${cx-kx},${cy-ry} ${cx},${cy-ry}` +
    `C${cx+kx},${cy-ry} ${cx+rx},${cy-ky} ${cx+rx},${cy}Z`
  )
}

function pointsToPath(pts: string, close: boolean): string {
  const nums = pts.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
  if (nums.length < 4) return ''
  const parts = [`M${nums[0]},${nums[1]}`]
  for (let i = 2; i+1 < nums.length; i += 2) parts.push(`L${nums[i]},${nums[i+1]}`)
  if (close) parts.push('Z')
  return parts.join('')
}

// ── Apply matrix transform to path data string ─────────────────────────────────
function applyMatrix(d: string, m: Mat): string | null {
  try {
    return new SVGPathData(d)
      .transform(SVGPathDataTransformer.TO_ABS())
      .transform(SVGPathDataTransformer.MATRIX(m.a, m.b, m.c, m.d, m.e, m.f))
      .transform(SVGPathDataTransformer.ROUND(4))
      .encode()
  } catch { return null }
}

// ── Bounding box from path data (approximation using command endpoints) ─────────
export interface BBox { minX:number; minY:number; maxX:number; maxY:number }

export function pathBBox(d: string): BBox | null {
  try {
    const cmds = new SVGPathData(d)
      .transform(SVGPathDataTransformer.TO_ABS())
      .commands as Record<string, number>[]
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity
    for (const c of cmds) {
      for (const k of ['x','x1','x2']) {
        const v = c[k]; if (v !== undefined && isFinite(v)) { minX=Math.min(minX,v); maxX=Math.max(maxX,v) }
      }
      for (const k of ['y','y1','y2']) {
        const v = c[k]; if (v !== undefined && isFinite(v)) { minY=Math.min(minY,v); maxY=Math.max(maxY,v) }
      }
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null
  } catch { return null }
}

// ── Build a PathShape from path data + accumulated matrix ─────────────────────
function makeShape(d: string, mat: Mat): PathShape | null {
  const data = applyMatrix(d, mat)
  if (!data) return null
  return {
    id: crypto.randomUUID(),
    type: 'path',
    data,
    style: { stroke: '#e2e8f0', fill: 'transparent', strokeWidth: 0.5 },
  }
}

// ── Element tags we skip entirely ─────────────────────────────────────────────
const SKIP = new Set([
  'defs','style','title','desc','metadata','pattern','symbol',
  'filter','lineargradient','radialgradient','clippath','mask',
])

// ── Recursive DOM traversal ───────────────────────────────────────────────────
function traverse(el: Element, parentMat: Mat, shapes: PathShape[], warnings: string[]) {
  const tag = el.tagName.toLowerCase().split(':').pop()!
  if (SKIP.has(tag)) return

  const style = el.getAttribute('style') ?? ''
  if (/display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style)) return

  const ownMat = parseTransformAttr(el.getAttribute('transform') ?? '')
  const mat    = mul(parentMat, ownMat)

  switch (tag) {
    case 'svg': case 'g':
      for (const child of el.children) traverse(child, mat, shapes, warnings)
      return

    case 'path': {
      const d = el.getAttribute('d'); if (!d) return
      const s = makeShape(d, mat); if (s) shapes.push(s)
      return
    }
    case 'rect': {
      const x  = +(el.getAttribute('x')??0),  y  = +(el.getAttribute('y')??0)
      const w  = +(el.getAttribute('width')??0), h  = +(el.getAttribute('height')??0)
      const rx = +(el.getAttribute('rx')??el.getAttribute('ry')??0)
      const ry = +(el.getAttribute('ry')??el.getAttribute('rx')??0)
      if (w>0&&h>0) { const s=makeShape(rectToPath(x,y,w,h,rx,ry),mat); if(s)shapes.push(s) }
      return
    }
    case 'circle': {
      const cx=+(el.getAttribute('cx')??0), cy=+(el.getAttribute('cy')??0), r=+(el.getAttribute('r')??0)
      if (r>0) { const s=makeShape(circleToPath(cx,cy,r),mat); if(s)shapes.push(s) }
      return
    }
    case 'ellipse': {
      const cx=+(el.getAttribute('cx')??0), cy=+(el.getAttribute('cy')??0)
      const rx=+(el.getAttribute('rx')??0), ry=+(el.getAttribute('ry')??0)
      if (rx>0&&ry>0) { const s=makeShape(ellipseToPath(cx,cy,rx,ry),mat); if(s)shapes.push(s) }
      return
    }
    case 'line': {
      const x1=+(el.getAttribute('x1')??0), y1=+(el.getAttribute('y1')??0)
      const x2=+(el.getAttribute('x2')??0), y2=+(el.getAttribute('y2')??0)
      const s=makeShape(`M${x1},${y1}L${x2},${y2}`,mat); if(s)shapes.push(s)
      return
    }
    case 'polyline': {
      const d=pointsToPath(el.getAttribute('points')??'',false)
      if(d){const s=makeShape(d,mat);if(s)shapes.push(s)}
      return
    }
    case 'polygon': {
      const d=pointsToPath(el.getAttribute('points')??'',true)
      if(d){const s=makeShape(d,mat);if(s)shapes.push(s)}
      return
    }
    case 'text': case 'tspan':
      if (!warnings.some(w => w.includes('<text>')))
        warnings.push('<text> elements skipped — convert text to outlines in your SVG editor before importing')
      return
    case 'image': case 'use':
      warnings.push(`<${tag}> not supported and was skipped`)
      return
    default:
      for (const child of el.children) traverse(child, mat, shapes, warnings)
  }
}

// ── Public: parse an SVG string into shapes ───────────────────────────────────
export interface ParseResult {
  shapes:        PathShape[]
  warnings:      string[]
  originalSizeMm: { width: number; height: number } | null
}

export function parseSvg(svgString: string): ParseResult {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const err = doc.querySelector('parsererror')
  if (err) return { shapes: [], warnings: ['Invalid SVG file'], originalSizeMm: null }

  const root = doc.documentElement
  const vbAttr = root.getAttribute('viewBox')
  let vb = { minX:0, minY:0, w:0, h:0 }
  if (vbAttr) {
    const p = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (p.length === 4) vb = { minX:p[0], minY:p[1], w:p[2], h:p[3] }
  }

  const wMm = dimToMm(root.getAttribute('width'))
  const hMm = dimToMm(root.getAttribute('height'))

  let rootMat: Mat
  let originalSizeMm: ParseResult['originalSizeMm'] = null

  if (vb.w > 0 && vb.h > 0 && wMm !== null && hMm !== null) {
    // viewBox + physical size → scale from user units to mm
    const sx = wMm / vb.w, sy = hMm / vb.h
    rootMat = { a:sx, b:0, c:0, d:sy, e:-vb.minX*sx, f:-vb.minY*sy }
    originalSizeMm = { width: wMm, height: hMm }
  } else if (vb.w > 0 && vb.h > 0) {
    // viewBox only — treat user units as mm
    rootMat = { ...I, e:-vb.minX, f:-vb.minY }
    originalSizeMm = { width: vb.w, height: vb.h }
  } else if (wMm !== null && hMm !== null) {
    // No viewBox — convert px to mm (96 dpi)
    const s = 25.4 / 96
    rootMat = { a:s, b:0, c:0, d:s, e:0, f:0 }
    originalSizeMm = { width: wMm, height: hMm }
  } else {
    rootMat = { ...I }
  }

  const shapes: PathShape[] = []
  const warnings: string[] = []
  traverse(root, rootMat, shapes, warnings)
  return { shapes, warnings, originalSizeMm }
}

// ── Public: fit shapes into bed, centred, scale down only ─────────────────────
export function fitToBed(shapes: PathShape[], bedWidth: number, bedHeight: number): PathShape[] {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity
  for (const s of shapes) {
    const bb = pathBBox(s.data)
    if (bb) {
      minX=Math.min(minX,bb.minX); minY=Math.min(minY,bb.minY)
      maxX=Math.max(maxX,bb.maxX); maxY=Math.max(maxY,bb.maxY)
    }
  }
  if (!isFinite(minX)) return shapes

  const sw = maxX-minX, sh = maxY-minY
  if (sw<=0 || sh<=0) return shapes

  const rawScale = Math.min((bedWidth * 0.9) / sw, (bedHeight * 0.9) / sh)
  const scale = Math.min(rawScale, 1)    // never scale up — only scale down
  const tx = (bedWidth  - sw*scale) / 2 - minX*scale
  const ty = (bedHeight - sh*scale) / 2 - minY*scale
  const m: Mat = { a:scale, b:0, c:0, d:scale, e:tx, f:ty }

  return shapes.map(s => {
    const d = applyMatrix(s.data, m)
    return d ? { ...s, id: crypto.randomUUID(), data: d } : s
  })
}
