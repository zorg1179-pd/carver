import { useMemo } from 'react'
import { useDocumentStore, useMachineStore, useMaterialStore, useToolStore } from '@/stores'
import type { CutConfig, ContourSide, OperationType, Shape } from '@/types'
import { pathBBox } from '@/svg/parseSvg'
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

// ── CutConfig editor (shared between single and multi-select) ─────────────
interface CfgEditorProps {
  cfg: CutConfig
  units: string
  onChange: (patch: Partial<CutConfig>) => void
}

function CutConfigEditor({ cfg, units, onChange }: CfgEditorProps) {
  const passCount = Math.max(1, Math.ceil(cfg.totalDepth / cfg.maxDepthPerPass))
  return (
    <>
      <SelectField
        label="Operation"
        value={cfg.operation}
        onChange={v => onChange({ operation: v as OperationType })}
        options={OP_OPTIONS}
      />
      {cfg.operation === 'contour' && (
        <SelectField
          label="Contour side"
          value={cfg.contourSide ?? 'on-line'}
          onChange={v => onChange({ contourSide: v as ContourSide })}
          options={SIDE_OPTIONS}
        />
      )}
      {cfg.operation === 'pocket' && (
        <NumberField
          label="Stepover"
          value={Math.round((cfg.pocketStepover ?? 0.4) * 100)}
          onChange={v => onChange({ pocketStepover: v / 100 })}
          min={1} max={100} step={5} unit="%"
        />
      )}
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
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────
export default function ShapePanel() {
  const { shapes, selectedIds, updateShape } = useDocumentStore()
  const { units }           = useMachineStore()
  const { thickness }       = useMaterialStore()
  const { maxDepthPerPass } = useToolStore()

  const selected = useMemo(
    () => shapes.filter(s => selectedIds.includes(s.id)),
    [shapes, selectedIds],
  )

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
        <CutConfigEditor cfg={cfg} units={units} onChange={patch} />
        {holes.length > 0 && (
          <button
            onClick={() => patch({ holeShapeIds: undefined })}
            className="text-[10px] text-red-400 hover:text-red-300 text-left"
          >
            Remove holes
          </button>
        )}
      </PanelSection>
    )
  }

  // ── Multi-selection ───────────────────────────────────────────────────────
  // Use the first selected shape's config as the template for all edits
  const primary = selected[0]
  const cfg = primary.cutConfig ?? defaultCfg

  function patchAll(updates: Partial<CutConfig>) {
    selected.forEach(s => {
      updateShape(s.id, { cutConfig: { ...(s.cutConfig ?? defaultCfg), ...updates } })
    })
  }

  // "Set as Nested Pocket": first selected = outer, rest = holes
  function setNestedPocket() {
    // Determine outer shape (largest bounding box area among selected)
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

  return (
    <PanelSection title="Shape">
      <div className="text-[10px] text-gray-400 space-y-0.5">
        <div className="text-white font-medium">{selected.length} shapes selected</div>
        <div className="text-gray-500">Editing applies to all selected</div>
      </div>

      <button
        onClick={setNestedPocket}
        className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded border border-blue-600 text-blue-400 hover:bg-blue-900/40 text-xs transition-colors"
      >
        Set as Nested Pocket
      </button>

      <div className="w-full h-px bg-gray-700" />
      <CutConfigEditor cfg={cfg} units={units} onChange={patchAll} />
    </PanelSection>
  )
}
