import { useState } from 'react'
import { useMachineStore, useMachineProfileStore } from '@/stores'
import NumberField from '@/components/ui/NumberField'
import SelectField from '@/components/ui/SelectField'
import PanelSection from '@/components/ui/PanelSection'
import type { MachineProfile } from '@/types'

function profileMatchesCurrent(p: MachineProfile, machine: ReturnType<typeof useMachineStore.getState>) {
  return (
    p.bedWidth        === machine.bedWidth &&
    p.bedHeight       === machine.bedHeight &&
    p.units           === machine.units &&
    p.safeHeight      === machine.safeHeight &&
    p.originPosition  === machine.originPosition
  )
}

export default function MachinePanel() {
  const machine = useMachineStore()
  const lib     = useMachineProfileStore()
  const all     = lib.allProfiles()

  const [saveMode,  setSaveMode]  = useState(false)
  const [saveName,  setSaveName]  = useState('')

  const activeProfile = lib.activeId ? all.find(p => p.id === lib.activeId) ?? null : null
  const isDirty = activeProfile ? !profileMatchesCurrent(activeProfile, machine) : false

  function loadProfile(id: string) {
    const p = all.find(q => q.id === id)
    if (!p) return
    machine.setBedWidth(p.bedWidth)
    machine.setBedHeight(p.bedHeight)
    machine.setUnits(p.units)
    machine.setSafeHeight(p.safeHeight)
    machine.setOriginPosition(p.originPosition)
    lib.setActiveId(p.id)
  }

  function handleSave() {
    const name = saveName.trim()
    if (!name) return
    lib.saveProfile(name, {
      bedWidth:       machine.bedWidth,
      bedHeight:      machine.bedHeight,
      units:          machine.units,
      safeHeight:     machine.safeHeight,
      originPosition: machine.originPosition,
    })
    setSaveMode(false)
    setSaveName('')
  }

  function handleUpdate() {
    if (!lib.activeId || !activeProfile || activeProfile.isBuiltIn) return
    lib.updateProfile(lib.activeId, {
      bedWidth:       machine.bedWidth,
      bedHeight:      machine.bedHeight,
      units:          machine.units,
      safeHeight:     machine.safeHeight,
      originPosition: machine.originPosition,
    })
  }

  function handleDelete() {
    if (!lib.activeId || !activeProfile || activeProfile.isBuiltIn) return
    if (!window.confirm(`Delete "${activeProfile.name}"?`)) return
    lib.deleteProfile(lib.activeId)
  }

  const builtIns = all.filter(p => p.isBuiltIn)
  const customs  = all.filter(p => !p.isBuiltIn)

  return (
    <PanelSection title="Machine">

      {/* ── Profile library bar ───────────────────────────────────────── */}
      <div>
        <label className="text-[10px] text-gray-400 block mb-0.5">Profile</label>
        <select
          value={lib.activeId ?? ''}
          onChange={e => {
            if (e.target.value) loadProfile(e.target.value)
            else lib.setActiveId(null)
          }}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1
                     text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">— custom —</option>
          <optgroup label="Built-in">
            {builtIns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
          {customs.length > 0 && (
            <optgroup label="Saved">
              {customs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {/* ── Save-as inline input ──────────────────────────────────────── */}
      {saveMode ? (
        <div className="flex gap-1">
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') { setSaveMode(false); setSaveName('') }
            }}
            placeholder="Profile name…"
            className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1
                       text-xs text-white focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500
                       disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
          >Save</button>
          <button
            onClick={() => { setSaveMode(false); setSaveName('') }}
            className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >✕</button>
        </div>
      ) : (
        <div className="flex gap-1">
          <button
            onClick={() => { setSaveMode(true); setSaveName(activeProfile?.name ?? '') }}
            className="flex-1 px-2 py-1 text-xs rounded border border-gray-600
                       bg-gray-900 hover:bg-gray-800 text-gray-300 transition-colors"
          >Save as…</button>
          {isDirty && activeProfile && !activeProfile.isBuiltIn && (
            <button
              onClick={handleUpdate}
              className="flex-1 px-2 py-1 text-xs rounded border border-yellow-600
                         bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-300 transition-colors"
            >Update</button>
          )}
          {activeProfile && !activeProfile.isBuiltIn && (
            <button
              onClick={handleDelete}
              className="px-2 py-1 text-xs rounded border border-gray-600
                         bg-gray-900 hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
            >Delete</button>
          )}
        </div>
      )}

      {/* ── Fields ───────────────────────────────────────────────────── */}
      <div className="flex gap-1.5">
        <NumberField
          label="Bed W" value={machine.bedWidth}
          onChange={v => { machine.setBedWidth(v); lib.setActiveId(null) }}
          min={1} step={1} unit={machine.units} className="flex-1"
        />
        <NumberField
          label="Bed H" value={machine.bedHeight}
          onChange={v => { machine.setBedHeight(v); lib.setActiveId(null) }}
          min={1} step={1} unit={machine.units} className="flex-1"
        />
      </div>

      <div>
        <span className="text-[10px] text-gray-400 block mb-0.5">Units</span>
        <div className="flex rounded overflow-hidden border border-gray-600">
          {(['mm', 'in'] as const).map(u => (
            <button
              key={u}
              onClick={() => { machine.setUnits(u); lib.setActiveId(null) }}
              className={`flex-1 py-1 text-xs transition-colors ${
                machine.units === u
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-white'
              }`}
            >{u}</button>
          ))}
        </div>
      </div>

      <NumberField
        label="Safe height" value={machine.safeHeight}
        onChange={v => { machine.setSafeHeight(v); lib.setActiveId(null) }}
        min={0} step={0.5} unit={machine.units}
      />

      <SelectField
        label="Origin"
        value={machine.originPosition}
        onChange={v => { machine.setOriginPosition(v as 'front-left' | 'center'); lib.setActiveId(null) }}
        options={[
          { value: 'front-left', label: 'Front-left' },
          { value: 'center',     label: 'Center' },
        ]}
      />
    </PanelSection>
  )
}
