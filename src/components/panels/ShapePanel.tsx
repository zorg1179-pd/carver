import { useCallback, useEffect, useMemo } from 'react'
import { XCircle, FlipHorizontal, FlipVertical } from 'lucide-react'
import { useDocumentStore, useMachineStore, useMaterialStore, useToolStore } from '@/stores'
import type { CutConfig, ContourSide, OperationType, PathShape, Shape, ShapeUpdate } from '@/types'
import { pathBBox } from '@/svg/parseSvg'
import { shapeToPathData, openClosePath, reversePath, joinPaths, weldNearestEndpoints } from '@/toolpath/pathUtils'
import { subtractPaths, unitePaths, intersectPaths } from '@/toolpath/booleanOps'
import NumberField from '@/components/ui/NumberField'
import SelectField from '@/components/ui/SelectField'
import PanelSection from '@/components/ui/PanelSection'

// ── Bounding box area for outer/inner determination ───────────────────────
function shapeArea(shape: Shape): number {
  switch (shape.type) {
    case 'rect':    return shape.width * shape.height
    case 'circle':  return Math.PI * shape.radius ** 2
    case 'ellipse': return Math.PI * shape.radiusX * shape.radiusY
    case 'path': {
      const bb = pathBBox(shape.data)
      return bb ? (bb.maxX - bb.minX) * (bb.maxY - bb.minY) : 0
    }
    default: return 0
  }
}

function shapeBounds(shape: Shape): { w: number; h: number } | null {
  switch (shape.type) {
    case 'line': {
      const p = shape.points
      let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity
      for (let i = 0; i < p.length; i += 2) {
        x0=Math.min(x0,p[i]); x1=Math.max(x1,p[i])
        y0=Math.min(y0,p[i+1]); y1=Math.max(y1,p[i+1])
      }
      return isFinite(x0) ? { w: x1-x0, h: y1-y0 } : null
    }
    case 'rect':    return { w: shape.width, h: shape.height }
    case 'circle':  return { w: shape.radius*2, h: shape.radius*2 }
    case 'ellipse': return { w: shape.radiusX*2, h: shape.radiusY*2 }
    case 'path': {
      const bb = pathBBox(shape.data)
      return bb ? { w: bb.maxX-bb.minX, h: bb.maxY-bb.minY } : null
    }
    default: return null
  }
}

// ── Full bounding box (includes position) for alignment math ─────────────────
function getShapeBBox(shape: Shape): { x: number; y: number; w: number; h: number } | null {
  switch (shape.type) {
    case 'rect':
      return { x: shape.x, y: shape.y, w: shape.width, h: shape.height }
    case 'circle':
      return { x: shape.x - shape.radius, y: shape.y - shape.radius, w: shape.radius * 2, h: shape.radius * 2 }
    case 'ellipse':
      return { x: shape.x - shape.radiusX, y: shape.y - shape.radiusY, w: shape.radiusX * 2, h: shape.radiusY * 2 }
    case 'text':
      // Text has no measurable width without DOM; treat as a zero-size anchor at (x, y)
      return { x: shape.x, y: shape.y, w: 0, h: 0 }
    case 'path': {
      const bb = pathBBox(shape.data)
      if (!bb) return null
      const ox = shape.x ?? 0, oy = shape.y ?? 0
      const sx = shape.scaleX ?? 1, sy = shape.scaleY ?? 1
      // Path data is scaled and offset by the shape's transform
      const x0 = bb.minX * sx, x1 = bb.maxX * sx
      const y0 = bb.minY * sy, y1 = bb.maxY * sy
      return { x: ox + Math.min(x0, x1), y: oy + Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
    }
    case 'line': {
      const p = shape.points
      if (p.length < 4) return null
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i])
        minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1])
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
  }
}

/**
 * Returns the ShapeUpdate required to translate a shape by (dx, dy).
 * Lines store their geometry as a flat points array; all other types use x/y fields.
 */
function moveShapeUpdate(shape: Shape, dx: number, dy: number): ShapeUpdate {
  if (dx === 0 && dy === 0) return {}
  switch (shape.type) {
    case 'line':    return { points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
    case 'rect':    return { x: shape.x + dx,        y: shape.y + dy }
    case 'circle':  return { x: shape.x + dx,        y: shape.y + dy }
    case 'ellipse': return { x: shape.x + dx,        y: shape.y + dy }
    case 'text':    return { x: shape.x + dx,        y: shape.y + dy }
    case 'path':    return { x: (shape.x ?? 0) + dx, y: (shape.y ?? 0) + dy }
  }
}

type AlignType = 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV'

/**
 * Compute the per-shape ShapeUpdates needed to align the given shapes.
 * All shapes align to the outermost edge of the entire selection.
 */
function computeAlignUpdates(
  shapes: Shape[],
  type: AlignType,
): { id: string; update: ShapeUpdate }[] {
  const bboxes = shapes.map((s) => ({ shape: s, bbox: getShapeBBox(s) })).filter((x) => x.bbox !== null)
  if (bboxes.length < 2) return []

  const minX    = Math.min(...bboxes.map((b) => b.bbox!.x))
  const maxX    = Math.max(...bboxes.map((b) => b.bbox!.x + b.bbox!.w))
  const minY    = Math.min(...bboxes.map((b) => b.bbox!.y))
  const maxY    = Math.max(...bboxes.map((b) => b.bbox!.y + b.bbox!.h))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return bboxes.map(({ shape, bbox: b }) => {
    let dx = 0, dy = 0
    switch (type) {
      case 'left':    dx = minX    - b!.x; break
      case 'right':   dx = maxX    - (b!.x + b!.w); break
      case 'top':     dy = minY    - b!.y; break
      case 'bottom':  dy = maxY    - (b!.y + b!.h); break
      case 'centerH': dx = centerX - (b!.x + b!.w / 2); break
      case 'centerV': dy = centerY - (b!.y + b!.h / 2); break
    }
    return { id: shape.id, update: moveShapeUpdate(shape, dx, dy) }
  })
}

/**
 * Compute per-shape updates to evenly distribute shapes along one axis.
 * Requires at least 3 shapes (first and last stay anchored).
 */
function computeDistributeUpdates(
  shapes: Shape[],
  axis: 'h' | 'v',
): { id: string; update: ShapeUpdate }[] {
  const bboxes = shapes.map((s) => ({ shape: s, bbox: getShapeBBox(s) })).filter((x) => x.bbox !== null)
  if (bboxes.length < 3) return []

  const pos = axis === 'h' ? 'x' : 'y'
  const dim = axis === 'h' ? 'w' : 'h'

  // Sort by center position along the distribution axis
  const sorted = [...bboxes].sort((a, b) => {
    const ca = a.bbox![pos] + a.bbox![dim] / 2
    const cb = b.bbox![pos] + b.bbox![dim] / 2
    return ca - cb
  })

  const first  = sorted[0].bbox!
  const last   = sorted[sorted.length - 1].bbox!
  const span   = (last[pos] + last[dim] / 2) - (first[pos] + first[dim] / 2)
  const step   = span / (sorted.length - 1)

  return sorted.map(({ shape, bbox: b }, i) => {
    const targetCenter = (first[pos] + first[dim] / 2) + i * step
    const delta = targetCenter - (b![pos] + b![dim] / 2)
    const dx = axis === 'h' ? delta : 0
    const dy = axis === 'v' ? delta : 0
    return { id: shape.id, update: moveShapeUpdate(shape, dx, dy) }
  })
}

const OP_OPTIONS: { value: OperationType; label: string }[] = [
  { value: 'contour', label: 'Contour' },
  { value: 'pocket',  label: 'Pocket'  },
  { value: 'v-carve', label: 'V-carve' },
  { value: 'engrave', label: 'Engrave' },
]

const SIDE_OPTIONS: { value: ContourSide; label: string }[] = [
  { value: 'outside', label: 'Outside' },
  { value: 'inside',  label: 'Inside'  },
  { value: 'on-line', label: 'On line' },
]

// ── Transform editor (single-select only) ─────────────────────────────────
interface TransformProps { shape: Shape; units: string; onChange: (u: ShapeUpdate) => void }

function TransformEditor({ shape, units: u, onChange }: TransformProps) {
  const btnCls = 'flex-1 flex items-center justify-center gap-1 py-1 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 text-[10px] transition-colors'

  if (shape.type === 'rect') return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="X" value={shape.x} onChange={x => onChange({ x })} step={0.5} unit={u} />
        <NumberField label="Y" value={shape.y} onChange={y => onChange({ y })} step={0.5} unit={u} />
        <NumberField label="W" value={shape.width}  onChange={width  => onChange({ width  })} min={0.01} step={0.5} unit={u} />
        <NumberField label="H" value={shape.height} onChange={height => onChange({ height })} min={0.01} step={0.5} unit={u} />
      </div>
      <NumberField label="Rotation" value={shape.rotation ?? 0} onChange={rotation => onChange({ rotation })} step={1} unit="°" />
      <div className="flex gap-1.5">
        <button className={btnCls} onClick={() => onChange({ x: shape.x + shape.width, width: -shape.width })}><FlipHorizontal size={10} />Flip H</button>
        <button className={btnCls} onClick={() => onChange({ y: shape.y + shape.height, height: -shape.height })}><FlipVertical size={10} />Flip V</button>
      </div>
    </>
  )

  if (shape.type === 'circle') return (
    <div className="grid grid-cols-2 gap-1.5">
      <NumberField label="X" value={shape.x} onChange={x => onChange({ x })} step={0.5} unit={u} />
      <NumberField label="Y" value={shape.y} onChange={y => onChange({ y })} step={0.5} unit={u} />
      <NumberField label="Radius" value={shape.radius} onChange={radius => onChange({ radius })} min={0.01} step={0.5} unit={u} className="col-span-2" />
    </div>
  )

  if (shape.type === 'ellipse') return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="X" value={shape.x} onChange={x => onChange({ x })} step={0.5} unit={u} />
        <NumberField label="Y" value={shape.y} onChange={y => onChange({ y })} step={0.5} unit={u} />
        <NumberField label="W" value={shape.radiusX * 2} onChange={v => onChange({ radiusX: v / 2 })} min={0.01} step={0.5} unit={u} />
        <NumberField label="H" value={shape.radiusY * 2} onChange={v => onChange({ radiusY: v / 2 })} min={0.01} step={0.5} unit={u} />
      </div>
      <NumberField label="Rotation" value={shape.rotation ?? 0} onChange={rotation => onChange({ rotation })} step={1} unit="°" />
    </>
  )

  if (shape.type === 'text') return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="X" value={shape.x} onChange={x => onChange({ x })} step={0.5} unit={u} />
        <NumberField label="Y" value={shape.y} onChange={y => onChange({ y })} step={0.5} unit={u} />
      </div>
      <NumberField label="Font size" value={shape.fontSize} onChange={fontSize => onChange({ fontSize })} min={0.5} step={0.5} unit={u} />
      <NumberField label="Rotation" value={shape.rotation ?? 0} onChange={rotation => onChange({ rotation })} step={1} unit="°" />
    </>
  )

  if (shape.type === 'path') return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="X" value={shape.x ?? 0} onChange={x => onChange({ x })} step={0.5} unit={u} />
        <NumberField label="Y" value={shape.y ?? 0} onChange={y => onChange({ y })} step={0.5} unit={u} />
        <NumberField label="Scale X" value={Math.abs(shape.scaleX ?? 1) * 100} onChange={v => onChange({ scaleX: (v / 100) * Math.sign((shape.scaleX ?? 1) || 1) })} min={1} step={5} unit="%" />
        <NumberField label="Scale Y" value={Math.abs(shape.scaleY ?? 1) * 100} onChange={v => onChange({ scaleY: (v / 100) * Math.sign((shape.scaleY ?? 1) || 1) })} min={1} step={5} unit="%" />
      </div>
      <div className="flex gap-1.5">
        <button className={btnCls} onClick={() => onChange({ scaleX: -(shape.scaleX ?? 1) })}><FlipHorizontal size={10} />Flip H</button>
        <button className={btnCls} onClick={() => onChange({ scaleY: -(shape.scaleY ?? 1) })}><FlipVertical size={10} />Flip V</button>
      </div>
    </>
  )

  return null
}

// ── CutConfig editor (shared between single and multi-select) ─────────────
interface CfgEditorProps {
  cfg: CutConfig
  units: string
  onChange: (patch: Partial<CutConfig>) => void
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <span className="text-[10px] text-gray-400">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-7 h-4 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3' : ''}`} />
      </button>
    </label>
  )
}

function CutConfigEditor({ cfg, units, onChange }: CfgEditorProps) {
  const passCount = Math.max(1, Math.ceil(cfg.totalDepth / cfg.maxDepthPerPass))
  const isContour = cfg.operation === 'contour'
  const isPocket  = cfg.operation === 'pocket'
  const isVcarve  = cfg.operation === 'v-carve'
  const hasTabs   = (cfg.tabCount ?? 0) > 0

  return (
    <>
      <SelectField
        label="Operation"
        value={cfg.operation}
        onChange={v => onChange({ operation: v as OperationType })}
        options={OP_OPTIONS}
      />
      {isContour && (
        <SelectField
          label="Contour side"
          value={cfg.contourSide ?? 'on-line'}
          onChange={v => onChange({ contourSide: v as ContourSide })}
          options={SIDE_OPTIONS}
        />
      )}
      {isPocket && (
        <NumberField
          label="Stepover"
          value={Math.round((cfg.pocketStepover ?? 0.4) * 100)}
          onChange={v => onChange({ pocketStepover: v / 100 })}
          min={1} max={100} step={5} unit="%"
        />
      )}
      {!isVcarve && (
        <>
          <NumberField
            label="Total depth"
            value={cfg.totalDepth}
            onChange={v => onChange({ totalDepth: v })}
            min={0.01} step={0.5} unit={units}
          />
          <NumberField
            label="Max depth / pass"
            value={cfg.maxDepthPerPass}
            onChange={v => onChange({ maxDepthPerPass: v })}
            min={0.01} step={0.1} unit={units}
          />
          <div className="text-[10px] text-gray-400">
            <span className="text-gray-500">Passes  </span>{passCount}
          </div>
        </>
      )}
      {isVcarve && (
        <NumberField
          label="Flat relief depth"
          value={cfg.vFlatDepth ?? 0}
          onChange={v => onChange({ vFlatDepth: v > 0 ? v : undefined })}
          min={0} step={0.1} unit={units}
        />
      )}
      {(isContour || isPocket) && (
        <Toggle
          label="Dogbone corners"
          checked={cfg.dogbone ?? false}
          onChange={v => onChange({ dogbone: v || undefined })}
        />
      )}
      {isContour && (
        <>
          <Toggle
            label="Holding tabs"
            checked={hasTabs}
            onChange={v => onChange({ tabCount: v ? (cfg.tabCount || 4) : 0 })}
          />
          {hasTabs && (
            <>
              <NumberField
                label="Tab count"
                value={cfg.tabCount ?? 4}
                onChange={v => onChange({ tabCount: Math.max(1, Math.round(v)) })}
                min={1} max={20} step={1}
              />
              <NumberField
                label="Tab width"
                value={cfg.tabWidth ?? 5}
                onChange={v => onChange({ tabWidth: v })}
                min={0.1} step={0.5} unit={units}
              />
              <NumberField
                label="Tab height"
                value={cfg.tabHeight ?? 2}
                onChange={v => onChange({ tabHeight: v })}
                min={0.1} step={0.1} unit={units}
              />
            </>
          )}
        </>
      )}
    </>
  )
}

// ── Path operations section ────────────────────────────────────────────────
interface PathOpsSectionProps {
  selectedPaths: PathShape[]
  updateShape: (id: string, update: { data: string }) => void
  replaceShapesWithOne: (ids: string[], shape: PathShape) => void
  weld: () => void
}

function PathOpsSection({ selectedPaths, updateShape, replaceShapesWithOne, weld }: PathOpsSectionProps) {
  if (selectedPaths.length === 0) return null
  return (
    <PanelSection title="Path">
      {selectedPaths.length === 1 && (
        <>
          <button
            className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors"
            onClick={() => updateShape(selectedPaths[0].id, { data: openClosePath(selectedPaths[0].data) })}
          >
            {selectedPaths[0].data.trim().match(/[Zz]$/) ? 'Open Path' : 'Close Path'}
          </button>
          <button
            className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors mt-1"
            onClick={() => updateShape(selectedPaths[0].id, { data: reversePath(selectedPaths[0].data) })}
          >
            Reverse Direction
          </button>
        </>
      )}
      {selectedPaths.length >= 2 && (
        <button
          className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors"
          onClick={() => {
            const merged = joinPaths(selectedPaths.map(s => s.data))
            replaceShapesWithOne(
              selectedPaths.map(s => s.id),
              {
                id: crypto.randomUUID(), type: 'path',
                data: merged, style: selectedPaths[0].style,
                layerId: selectedPaths[0].layerId,
              } as PathShape,
            )
          }}
        >
          Join Paths
        </button>
      )}
      {selectedPaths.length === 2 && (
        <button
          className="w-full text-xs bg-blue-700 hover:bg-blue-600 text-white rounded px-2 py-1 text-left transition-colors mt-1"
          title="Weld nearest endpoints (W)"
          onClick={weld}
        >
          Weld Endpoints  <kbd className="text-blue-300 text-[10px]">W</kbd>
        </button>
      )}
    </PanelSection>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────
export default function ShapePanel() {
  const { shapes, selectedIds, updateShape, updateShapes, replaceShapesWithOne } = useDocumentStore()
  const { units }           = useMachineStore()
  const { thickness }       = useMaterialStore()
  const { maxDepthPerPass } = useToolStore()

  const selected = useMemo(
    () => shapes.filter(s => selectedIds.includes(s.id)),
    [shapes, selectedIds],
  )

  const selectedPaths = useMemo(
    () => selected.filter(s => s.type === 'path') as PathShape[],
    [selected],
  )

  const weld = useCallback(() => {
    if (selectedPaths.length !== 2) return
    const [a, b] = selectedPaths
    const merged = weldNearestEndpoints(a.data, b.data)
    replaceShapesWithOne([a.id, b.id], {
      id: crypto.randomUUID(), type: 'path',
      data: merged, style: a.style, layerId: a.layerId,
    } as PathShape)
  }, [selectedPaths, replaceShapesWithOne])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'KeyW' && selectedPaths.length === 2) {
        e.preventDefault()
        weld()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [weld, selectedPaths])

  // ── No selection ──────────────────────────────────────────────────────────
  if (selected.length === 0) {
    return (
      <PanelSection title="Shape">
        <p className="text-[10px] text-gray-500">No shape selected</p>
      </PanelSection>
    )
  }

  const defaultCfg: CutConfig = {
    operation: 'contour', totalDepth: thickness, maxDepthPerPass,
    contourSide: 'on-line', pocketStepover: 0.4,
  }

  // ── Single selection ──────────────────────────────────────────────────────
  if (selected.length === 1) {
    const shape = selected[0]
    const bounds = shapeBounds(shape)
    const cfg = shape.cutConfig ?? defaultCfg

    const holes = cfg.holeShapeIds
      ? cfg.holeShapeIds.map(id => shapes.find(s => s.id === id)?.type ?? '?')
      : []

    function patch(updates: Partial<CutConfig>) {
      updateShape(shape.id, { cutConfig: { ...cfg, ...updates } })
    }

    return (
      <>
        <PanelSection title="Shape">
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <div><span className="text-gray-500">Type  </span>{shape.type}</div>
            {bounds && (
              <div>
                <span className="text-gray-500">Size  </span>
                {bounds.w.toFixed(2)} × {bounds.h.toFixed(2)} {units}
              </div>
            )}
            {holes.length > 0 && (
              <div className="text-blue-400">
                Nested pocket · {holes.length} hole{holes.length!==1?'s':''}
              </div>
            )}
          </div>
          <div className="w-full h-px bg-gray-700" />
          <TransformEditor shape={shape} units={units} onChange={u => updateShape(shape.id, u)} />
          <div className="w-full h-px bg-gray-700" />
          <CutConfigEditor cfg={cfg} units={units} onChange={patch} />
          {holes.length > 0 && (
            <button
              onClick={() => patch({ holeShapeIds: undefined })}
              className="text-[10px] text-red-400 hover:text-red-300 text-left"
            >
              Remove holes
            </button>
          )}
          {shape.cutConfig && (
            <button
              onClick={() => updateShape(shape.id, { cutConfig: undefined })}
              className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs text-gray-400 hover:text-red-300 hover:bg-red-900/20 border border-gray-700 hover:border-red-900 transition-colors"
            >
              <XCircle size={11} /> Clear operation
            </button>
          )}
        </PanelSection>
        <PathOpsSection selectedPaths={selectedPaths} updateShape={updateShape} replaceShapesWithOne={replaceShapesWithOne} weld={weld} />
      </>
    )
  }

  // ── Multi-selection ───────────────────────────────────────────────────────
  // Use the first selected shape's config as the template for bulk cut-config edits
  const primary = selected[0]
  const cfg = primary.cutConfig ?? defaultCfg

  function patchAll(updates: Partial<CutConfig>) {
    selected.forEach(s => {
      updateShape(s.id, { cutConfig: { ...(s.cutConfig ?? defaultCfg), ...updates } })
    })
  }

  // "Set as Nested Pocket": largest area = outer, rest = holes
  function setNestedPocket() {
    const sorted = [...selected].sort((a, b) => shapeArea(b) - shapeArea(a))
    const outer  = sorted[0]
    const holes  = sorted.slice(1)
    updateShape(outer.id, {
      cutConfig: {
        ...(outer.cutConfig ?? defaultCfg),
        operation: 'pocket',
        holeShapeIds: holes.map(h => h.id),
      },
    })
  }

  // ── Alignment helpers ────────────────────────────────────────────────────

  function align(type: AlignType) {
    const updates = computeAlignUpdates(selected, type)
    if (updates.length) updateShapes(updates)
  }

  function distribute(axis: 'h' | 'v') {
    const updates = computeDistributeUpdates(selected, axis)
    if (updates.length) updateShapes(updates)
  }

  // ── Boolean operations ───────────────────────────────────────────────────
  // Only non-text, non-line shapes can be converted to path data for booleans
  const boolCandidates = selected.filter(s => s.type !== 'text' && s.type !== 'line')
  const canBoolean = boolCandidates.length >= 2

  /** Apply a boolean op, replace the source shapes with the resulting PathShape. */
  function applyBoolean(op: 'unite' | 'subtract' | 'intersect') {
    const pathDatas = boolCandidates.map(s => shapeToPathData(s)).filter(Boolean) as string[]
    if (pathDatas.length < 2) return

    let resultData: string | null = null
    if (op === 'unite')     resultData = unitePaths(pathDatas)
    if (op === 'subtract')  resultData = subtractPaths(pathDatas[0], pathDatas.slice(1))
    if (op === 'intersect') resultData = intersectPaths(pathDatas)
    if (!resultData) return

    // Build result shape in world space (all transforms baked into path data by shapeToPathData)
    const first = boolCandidates[0]
    const result: PathShape = {
      id: crypto.randomUUID(),
      type: 'path',
      data: resultData,
      x: 0, y: 0, scaleX: 1, scaleY: 1,
      style: { ...first.style },
      layerId: first.layerId,
    }
    replaceShapesWithOne(boolCandidates.map(s => s.id), result)
  }

  const anyHasOp = selected.some(s => s.cutConfig != null)
  const btnCls = 'flex-1 py-1 text-[10px] rounded border border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors'

  return (
    <>
    <PanelSection title="Shape">
      <div className="text-[10px] text-gray-400 space-y-0.5">
        <div className="text-white font-medium">{selected.length} shapes selected</div>
      </div>

      {/* ── Alignment ──────────────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-[10px] text-gray-500">Align</p>
        <div className="grid grid-cols-3 gap-1">
          <button className={btnCls} title="Align left edges"   onClick={() => align('left')}>   ←L  </button>
          <button className={btnCls} title="Center horizontally" onClick={() => align('centerH')}> ↔CH </button>
          <button className={btnCls} title="Align right edges"  onClick={() => align('right')}>  R→  </button>
          <button className={btnCls} title="Align top edges"    onClick={() => align('top')}>    ↑T  </button>
          <button className={btnCls} title="Center vertically"  onClick={() => align('centerV')}> ↕CV </button>
          <button className={btnCls} title="Align bottom edges" onClick={() => align('bottom')}> B↓  </button>
        </div>
        {selected.length >= 3 && (
          <div className="grid grid-cols-2 gap-1">
            <button className={btnCls} title="Distribute horizontally" onClick={() => distribute('h')}>⇔ Dist H</button>
            <button className={btnCls} title="Distribute vertically"   onClick={() => distribute('v')}>⇕ Dist V</button>
          </div>
        )}
      </div>

      {/* ── Boolean operations ─────────────────────────────────────── */}
      {canBoolean && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500">Boolean</p>
          <div className="grid grid-cols-3 gap-1">
            <button className={btnCls} title="Union — merge all shapes"              onClick={() => applyBoolean('unite')}>∪ Union</button>
            <button className={btnCls} title="Subtract — remove rest from first"     onClick={() => applyBoolean('subtract')}>− Subtr</button>
            <button className={btnCls} title="Intersect — keep overlap region only"  onClick={() => applyBoolean('intersect')}>∩ Inter</button>
          </div>
        </div>
      )}

      {/* ── CAM ────────────────────────────────────────────────────── */}
      <div className="w-full h-px bg-gray-700" />
      <button
        onClick={setNestedPocket}
        className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-blue-600 text-blue-400 hover:bg-blue-900/40 text-xs transition-colors"
      >
        Set as Nested Pocket
      </button>

      {anyHasOp && (
        <button
          onClick={() => selected.forEach(s => updateShape(s.id, { cutConfig: undefined }))}
          className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-gray-700 hover:border-red-900 text-gray-400 hover:text-red-300 hover:bg-red-900/20 text-xs transition-colors"
        >
          <XCircle size={11} /> Clear operation ({selected.filter(s => s.cutConfig).length})
        </button>
      )}

      <div className="w-full h-px bg-gray-700" />
      <CutConfigEditor cfg={cfg} units={units} onChange={patchAll} />
    </PanelSection>
    <PathOpsSection selectedPaths={selectedPaths} updateShape={updateShape} replaceShapesWithOne={replaceShapesWithOne} weld={weld} />
    </>
  )
}
