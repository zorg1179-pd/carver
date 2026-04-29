import { useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useDocumentStore } from '@/stores'
import PanelSection from '@/components/ui/PanelSection'

/** Preset layer display colours; null means "use shape's own colour". */
const LAYER_COLORS: (string | null)[] = [
  null, '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899',
]

export default function LayersPanel() {
  const {
    layers, activeLayerId, shapes, selectedIds,
    addLayer, updateLayer, deleteLayer,
    moveLayerUp, moveLayerDown, setActiveLayerId,
    moveShapesToLayer,
  } = useDocumentStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Display in reverse order so the topmost layer appears at the top of the list
  const displayLayers = [...layers].reverse()

  const hasSelection = selectedIds.length > 0

  /** Count how many shapes live on a given layer. */
  function shapeCount(layerId: string) {
    return shapes.filter((s) => (s.layerId ?? 'default') === layerId).length
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id)
    setEditName(currentName)
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      updateLayer(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  /** Cycle to the next preset colour for a layer. */
  function cycleColor(id: string, currentColor: string | null) {
    const idx = LAYER_COLORS.indexOf(currentColor)
    const next = LAYER_COLORS[(idx + 1) % LAYER_COLORS.length]
    updateLayer(id, { color: next })
  }

  function handleDelete(id: string, name: string) {
    const count = shapeCount(id)
    const msg = count > 0
      ? `Delete layer "${name}"? Its ${count} shape${count > 1 ? 's' : ''} will move to Default.`
      : `Delete layer "${name}"?`
    if (window.confirm(msg)) deleteLayer(id)
  }

  return (
    <PanelSection title="Layers">
      {/* ── Layer list ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        {displayLayers.map((layer) => {
          const isActive = layer.id === activeLayerId
          const count    = shapeCount(layer.id)
          const isFirst  = layers[layers.length - 1]?.id === layer.id  // topmost
          const isLast   = layers[0]?.id === layer.id                  // bottommost

          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayerId(layer.id)}
              className={`group flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors select-none
                ${isActive
                  ? 'bg-blue-900/40 border border-blue-700'
                  : 'border border-transparent hover:bg-gray-700/60'}`}
            >
              {/* ── Colour dot (click to cycle) ────────────────────── */}
              <button
                onClick={(e) => { e.stopPropagation(); cycleColor(layer.id, layer.color) }}
                title="Cycle display colour"
                className="w-3 h-3 rounded-full shrink-0 border border-gray-500 hover:scale-125 transition-transform"
                style={{ background: layer.color ?? '#6b7280' }}
              />

              {/* ── Layer name (double-click to rename) ───────────── */}
              {editingId === layer.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-gray-900 border border-blue-500 rounded px-1 text-[10px] text-white focus:outline-none"
                />
              ) : (
                <span
                  className="flex-1 text-[10px] truncate"
                  style={{ color: layer.color ?? (isActive ? '#e2e8f0' : '#9ca3af') }}
                  onDoubleClick={(e) => { e.stopPropagation(); startRename(layer.id, layer.name) }}
                  title={`${count} shape${count !== 1 ? 's' : ''} — double-click to rename`}
                >
                  {layer.name}
                  {count > 0 && <span className="text-gray-600 ml-1">({count})</span>}
                </span>
              )}

              {/* ── Reorder arrows ────────────────────────────────── */}
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id) }}
                disabled={isFirst}
                title="Move layer up"
                className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
              >
                <ChevronUp size={9} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id) }}
                disabled={isLast}
                title="Move layer down"
                className="p-0.5 rounded text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"
              >
                <ChevronDown size={9} />
              </button>

              {/* ── Visibility toggle ─────────────────────────────── */}
              <button
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }) }}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                className={`p-0.5 rounded transition-colors hover:bg-gray-600 ${
                  layer.visible ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {layer.visible ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>

              {/* ── Lock toggle ───────────────────────────────────── */}
              <button
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                className={`p-0.5 rounded transition-colors hover:bg-gray-600 ${
                  layer.locked ? 'text-amber-400' : 'text-gray-600'
                }`}
              >
                {layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
              </button>

              {/* ── Delete (hidden for 'default') ─────────────────── */}
              {layer.id !== 'default' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(layer.id, layer.name) }}
                  title="Delete layer"
                  className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex gap-1">
        <button
          onClick={() => addLayer(`Layer ${layers.length + 1}`)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border border-gray-600
                     text-gray-400 hover:text-white hover:bg-gray-700 text-[10px] transition-colors"
        >
          <Plus size={10} /> Add layer
        </button>

        {hasSelection && (
          <button
            onClick={() => moveShapesToLayer(selectedIds, activeLayerId)}
            title="Move selected shapes to the active layer"
            className="flex-1 px-2 py-1 rounded border border-gray-600
                       text-gray-400 hover:text-white hover:bg-gray-700 text-[10px] transition-colors"
          >
            Move here
          </button>
        )}
      </div>
    </PanelSection>
  )
}
