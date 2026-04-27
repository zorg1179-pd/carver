import { useState, useRef } from 'react'
import { useToolStore, useMachineStore, useToolLibraryStore } from '@/stores'
import type { BitType } from '@/types'
import NumberField from '@/components/ui/NumberField'
import SelectField from '@/components/ui/SelectField'
import PanelSection from '@/components/ui/PanelSection'

const BIT_OPTIONS: { value: BitType; label: string }[] = [
  { value: 'flat-end-mill', label: 'Flat end mill' },
  { value: 'ball-nose',     label: 'Ball nose'     },
  { value: 'v-bit',         label: 'V-bit'         },
  { value: 'drag-knife',    label: 'Drag knife'    },
]

function toolDataFromStore(tool: ReturnType<typeof useToolStore.getState>) {
  return {
    bitType:         tool.bitType,
    diameter:        tool.diameter,
    vBitAngle:       tool.vBitAngle,
    spindleRpm:      tool.spindleRpm,
    feedRate:        tool.feedRate,
    plungeRate:      tool.plungeRate,
    maxDepthPerPass: tool.maxDepthPerPass,
  }
}

function profileMatchesCurrent(
  profile: ReturnType<typeof useToolLibraryStore.getState>['profiles'][0],
  tool: ReturnType<typeof useToolStore.getState>,
) {
  return (
    profile.bitType         === tool.bitType         &&
    profile.diameter        === tool.diameter         &&
    profile.vBitAngle       === tool.vBitAngle        &&
    profile.spindleRpm      === tool.spindleRpm       &&
    profile.feedRate        === tool.feedRate         &&
    profile.plungeRate      === tool.plungeRate       &&
    profile.maxDepthPerPass === tool.maxDepthPerPass
  )
}

export default function ToolPanel() {
  const tool = useToolStore()
  const { units } = useMachineStore()
  const lib  = useToolLibraryStore()

  const [savingName, setSavingName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const rateUnit = `${units}/m`

  const activeProfile = lib.profiles.find(p => p.id === lib.activeId) ?? null
  const isDirty = activeProfile ? !profileMatchesCurrent(activeProfile, tool) : false

  // Load a saved profile into the tool store
  const loadProfile = (id: string) => {
    const p = lib.profiles.find(pr => pr.id === id)
    if (!p) return
    tool.setBitType(p.bitType)
    tool.setDiameter(p.diameter)
    tool.setVBitAngle(p.vBitAngle)
    tool.setSpindleRpm(p.spindleRpm)
    tool.setFeedRate(p.feedRate)
    tool.setPlungeRate(p.plungeRate)
    tool.setMaxDepthPerPass(p.maxDepthPerPass)
    lib.setActiveId(id)
  }

  const commitSave = () => {
    const name = savingName.trim()
    if (!name) return
    lib.saveProfile(name, toolDataFromStore(tool))
    setSavingName('')
    setShowSaveInput(false)
  }

  const handleUpdate = () => {
    if (!lib.activeId) return
    lib.updateProfile(lib.activeId, toolDataFromStore(tool))
  }

  const handleDelete = () => {
    if (!lib.activeId) return
    if (!window.confirm(`Delete tool profile "${activeProfile?.name}"?`)) return
    lib.deleteProfile(lib.activeId)
  }

  return (
    <PanelSection title="Tool">

      {/* ── Library bar ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          {/* Profile selector */}
          <select
            value={lib.activeId ?? ''}
            onChange={e => {
              if (e.target.value === '') {
                lib.setActiveId(null)
              } else {
                loadProfile(e.target.value)
              }
            }}
            className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-1.5 py-1
                       text-[11px] text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">— No profile —</option>
            {lib.profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Update button (only when a profile is selected and settings differ) */}
          {activeProfile && isDirty && (
            <button
              onClick={handleUpdate}
              title="Update saved profile with current settings"
              className="px-1.5 py-1 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white transition-colors shrink-0"
            >
              Update
            </button>
          )}

          {/* Save-as button */}
          <button
            onClick={() => { setShowSaveInput(true); setTimeout(() => nameInputRef.current?.focus(), 0) }}
            title="Save current settings as a new profile"
            className="px-1.5 py-1 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-white transition-colors shrink-0"
          >
            Save
          </button>

          {/* Delete button (only when a profile is selected) */}
          {activeProfile && (
            <button
              onClick={handleDelete}
              title="Delete this profile"
              className="px-1.5 py-1 rounded text-[10px] text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dirty indicator */}
        {activeProfile && isDirty && (
          <p className="text-[10px] text-amber-400">
            ● Modified — click Update to save changes
          </p>
        )}

        {/* Inline save-as name input */}
        {showSaveInput && (
          <div className="flex gap-1">
            <input
              ref={nameInputRef}
              type="text"
              placeholder="Profile name…"
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
            <button
              onClick={commitSave}
              disabled={!savingName.trim()}
              className="px-2 py-1 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white
                         disabled:opacity-40 transition-colors"
            >
              ✓
            </button>
            <button
              onClick={() => { setShowSaveInput(false); setSavingName('') }}
              className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── Tool parameters ───────────────────────────────────────────── */}
      <SelectField
        label="Bit type"
        value={tool.bitType}
        onChange={v => { tool.setBitType(v as BitType); lib.setActiveId(null) }}
        options={BIT_OPTIONS}
      />
      <NumberField label="Diameter" value={tool.diameter} onChange={v => { tool.setDiameter(v); lib.setActiveId(null) }} min={0.1} step={0.1} unit={units} />
      {tool.bitType === 'v-bit' && (
        <NumberField label="V-bit angle" value={tool.vBitAngle} onChange={v => { tool.setVBitAngle(v); lib.setActiveId(null) }} min={1} max={179} step={1} unit="°" />
      )}
      <NumberField label="Spindle RPM" value={tool.spindleRpm} onChange={v => { tool.setSpindleRpm(v); lib.setActiveId(null) }} min={1} step={100} unit="rpm" />
      <div className="flex gap-1.5">
        <NumberField label="Feed rate"   value={tool.feedRate}   onChange={v => { tool.setFeedRate(v);   lib.setActiveId(null) }} min={1} step={10} unit={rateUnit} className="flex-1" />
        <NumberField label="Plunge rate" value={tool.plungeRate} onChange={v => { tool.setPlungeRate(v); lib.setActiveId(null) }} min={1} step={10} unit={rateUnit} className="flex-1" />
      </div>
      <NumberField label="Max depth / pass" value={tool.maxDepthPerPass} onChange={v => { tool.setMaxDepthPerPass(v); lib.setActiveId(null) }} min={0.01} step={0.1} unit={units} />
    </PanelSection>
  )
}
