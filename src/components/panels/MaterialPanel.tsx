import { useState, useRef } from 'react'
import { useMaterialStore, useMachineStore, useToolStore, useMaterialLibraryStore } from '@/stores'
import NumberField from '@/components/ui/NumberField'
import PanelSection from '@/components/ui/PanelSection'

export default function MaterialPanel() {
  const material = useMaterialStore()
  const { units } = useMachineStore()
  const tool = useToolStore()
  const lib  = useMaterialLibraryStore()

  const [showSaveInput, setShowSaveInput] = useState(false)
  const [savingName, setSavingName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const allPresets = lib.allPresets()
  const activePreset = allPresets.find(p => p.id === lib.activeId) ?? null
  const recommended  = activePreset?.feeds[tool.bitType] ?? null

  const loadPreset = (id: string) => {
    const p = allPresets.find(pr => pr.id === id)
    if (!p) return
    material.setThickness(p.defaultThickness)
    lib.setActiveId(id)
  }

  const applyFeeds = () => {
    if (!recommended) return
    tool.setFeedRate(recommended.feedRate)
    tool.setPlungeRate(recommended.plungeRate)
    tool.setMaxDepthPerPass(recommended.maxDepthPerPass)
    tool.setSpindleRpm(recommended.spindleRpm)
  }

  const commitSave = () => {
    const name = savingName.trim()
    if (!name) return
    lib.addCustomPreset(name, {
      defaultThickness: material.thickness,
      feeds: {},  // user can later edit; saving current thickness only
    })
    setSavingName('')
    setShowSaveInput(false)
  }

  const handleDeleteCustom = () => {
    if (!activePreset || activePreset.isBuiltIn) return
    if (!window.confirm(`Delete material preset "${activePreset.name}"?`)) return
    lib.deleteCustomPreset(activePreset.id)
  }

  return (
    <PanelSection title="Material">

      {/* ── Preset library bar ────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <select
            value={lib.activeId ?? ''}
            onChange={e => {
              if (e.target.value === '') lib.setActiveId(null)
              else loadPreset(e.target.value)
            }}
            className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-1.5 py-1
                       text-[11px] text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">— No preset —</option>

            {/* Built-in presets */}
            <optgroup label="Built-in">
              {allPresets.filter(p => p.isBuiltIn).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>

            {/* Custom presets (only shown when any exist) */}
            {allPresets.some(p => !p.isBuiltIn) && (
              <optgroup label="Custom">
                {allPresets.filter(p => !p.isBuiltIn).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>

          {/* Save custom preset */}
          <button
            onClick={() => { setShowSaveInput(true); setTimeout(() => nameInputRef.current?.focus(), 0) }}
            title="Save current thickness as a custom preset"
            className="px-1.5 py-1 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-white transition-colors shrink-0"
          >
            Save
          </button>

          {/* Delete (custom only) */}
          {activePreset && !activePreset.isBuiltIn && (
            <button
              onClick={handleDeleteCustom}
              title="Delete this custom preset"
              className="px-1.5 py-1 rounded text-[10px] text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Inline save name input */}
        {showSaveInput && (
          <div className="flex gap-1">
            <input
              ref={nameInputRef}
              type="text"
              placeholder="Preset name…"
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') { setShowSaveInput(false); setSavingName('') }
                e.stopPropagation()
              }}
              className="flex-1 min-w-0 bg-gray-900 border border-blue-500 rounded px-2 py-1
                         text-[11px] text-white focus:outline-none"
            />
            <button onClick={commitSave} disabled={!savingName.trim()}
              className="px-2 py-1 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40 transition-colors">
              ✓
            </button>
            <button onClick={() => { setShowSaveInput(false); setSavingName('') }}
              className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-white hover:bg-gray-700 transition-colors">
              ✕
            </button>
          </div>
        )}

        {/* Recommended feeds button */}
        {recommended && (
          <button
            onClick={applyFeeds}
            className="w-full text-left px-2 py-1 rounded text-[10px] border border-blue-800
                       bg-blue-950 text-blue-300 hover:bg-blue-900 transition-colors"
          >
            Apply recommended feeds for {activePreset!.name} →{' '}
            Feed {recommended.feedRate} · Plunge {recommended.plungeRate} · Pass {recommended.maxDepthPerPass} {units}
          </button>
        )}

        {/* Note when selected preset has no feeds for current bit type */}
        {activePreset && !recommended && (
          <p className="text-[10px] text-gray-600">
            No feed recommendations for {tool.bitType} on {activePreset.name}.
          </p>
        )}
      </div>

      {/* ── Material parameters ───────────────────────────────────────── */}
      <NumberField label="Thickness"       value={material.thickness}     onChange={material.setThickness}     min={0.1} step={0.5} unit={units} />
      <NumberField label="Stock surface Z" value={material.stockSurfaceZ} onChange={material.setStockSurfaceZ}           step={0.1} unit={units} />
    </PanelSection>
  )
}
