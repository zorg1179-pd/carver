import type { Toolpath, Move } from '@/types'
import { getPostProcessor } from './postProcessors'

export interface GcodeOptions {
  postProcessorId:   string
  units:             'mm' | 'in'
  bedWidth:          number
  bedHeight:         number
  originPosition:    'front-left' | 'center'
  spindleRpm:        number
  safeHeight:        number
  stockSurfaceZ:     number
  toolDiameter:      number
  bitType:           string
  materialThickness: number
  precision:         number
  lineNumbers:       boolean
}

export interface GcodeResult {
  gcode:     string
  lineCount: number
  byteSize:  number
}

export function serializeGcode(toolpaths: Toolpath[], opts: GcodeOptions): GcodeResult {
  const pp  = getPostProcessor(opts.postProcessorId)
  const p   = Math.max(1, Math.min(6, opts.precision))
  const fmt = (n: number) => n.toFixed(p)

  const lines: string[] = []
  let lineNum = 10

  const isComment = (s: string) => s === '' || s.startsWith(pp.commentChar)

  const emit = (s: string) => {
    if (isComment(s)) {
      lines.push(s)
    } else if (opts.lineNumbers) {
      lines.push(`N${lineNum} ${s}`)
      lineNum += 10
    } else {
      lines.push(s)
    }
  }

  // ── Coordinate transforms ─────────────────────────────────────────────────
  // Canvas: X right, Y down.  G-code: X right, Y up.
  const tx = (x: number) =>
    opts.originPosition === 'center' ? x - opts.bedWidth / 2 : x

  const ty = (y: number) => {
    const flipped = opts.bedHeight - y
    return opts.originPosition === 'center' ? flipped - opts.bedHeight / 2 : flipped
  }

  // ── Modal state ───────────────────────────────────────────────────────────
  let cx: string | null = null
  let cy: string | null = null
  let cz: string | null = null
  let cf: string | null = null

  const emitMove = (m: Move) => {
    const fmx = fmt(tx(m.x))
    const fmy = fmt(ty(m.y))
    const fmz = fmt(m.z)
    const cmd = m.rapid ? 'G0' : 'G1'
    const parts: string[] = [cmd]

    if (fmx !== cx) { parts.push(`X${fmx}`); cx = fmx }
    if (fmy !== cy) { parts.push(`Y${fmy}`); cy = fmy }
    if (fmz !== cz) { parts.push(`Z${fmz}`); cz = fmz }

    if (!m.rapid && m.feed != null) {
      const ff = String(Math.round(m.feed))
      if (ff !== cf) { parts.push(`F${ff}`); cf = ff }
    }

    if (parts.length > 1) emit(parts.join(' '))
  }

  // ── Program start delimiter (e.g. Mach3 %) ───────────────────────────────
  if (pp.programStart) lines.push(pp.programStart)

  // ── Preamble ──────────────────────────────────────────────────────────────
  const ctx = {
    date:              new Date().toISOString().slice(0, 10),
    units:             opts.units,
    unitCmd:           (opts.units === 'mm' ? 'G21' : 'G20') as 'G21' | 'G20',
    bitType:           opts.bitType,
    diameter:          opts.toolDiameter,
    spindleRpm:        opts.spindleRpm,
    safeHeight:        opts.safeHeight,
    materialThickness: opts.materialThickness,
    fmt,
  }
  pp.preamble(ctx).forEach(line => emit(line))
  cz = fmt(opts.safeHeight)   // prime modal Z — preamble ends with G0 Z safe

  // ── Toolpaths ─────────────────────────────────────────────────────────────
  toolpaths.forEach((tp, i) => {
    emit('')
    emit(pp.comment(`--- ${i + 1}/${toolpaths.length}: ${tp.operation} (${tp.moves.length} moves) ---`))
    for (const m of tp.moves) emitMove(m)
  })

  // ── Return to safe height ─────────────────────────────────────────────────
  emit('')
  if (cz !== fmt(opts.safeHeight)) emit(`G0 Z${fmt(opts.safeHeight)}`)

  // ── Postamble ─────────────────────────────────────────────────────────────
  pp.postamble.forEach(line => emit(line))

  // ── Program end delimiter ─────────────────────────────────────────────────
  if (pp.programEnd) lines.push(pp.programEnd)

  const gcode = lines.join('\n')
  return {
    gcode,
    lineCount: lines.length,
    byteSize:  new TextEncoder().encode(gcode).length,
  }
}
