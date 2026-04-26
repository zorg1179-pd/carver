import { useMachineStore } from '@/stores'
import NumberField from '@/components/ui/NumberField'
import SelectField from '@/components/ui/SelectField'
import PanelSection from '@/components/ui/PanelSection'

export default function MachinePanel() {
  const {
    bedWidth, bedHeight, units, safeHeight, originPosition,
    setBedWidth, setBedHeight, setUnits, setSafeHeight, setOriginPosition,
  } = useMachineStore()

  return (
    <PanelSection title="Machine">
      <div className="flex gap-1.5">
        <NumberField label="Bed W" value={bedWidth}  onChange={setBedWidth}  min={1} step={1} unit={units} className="flex-1" />
        <NumberField label="Bed H" value={bedHeight} onChange={setBedHeight} min={1} step={1} unit={units} className="flex-1" />
      </div>

      <div>
        <span className="text-[10px] text-gray-400 block mb-0.5">Units</span>
        <div className="flex rounded overflow-hidden border border-gray-600">
          {(['mm', 'in'] as const).map(u => (
            <button
              key={u}
              onClick={() => setUnits(u)}
              className={`flex-1 py-1 text-xs transition-colors ${
                units === u ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <NumberField label="Safe height" value={safeHeight} onChange={setSafeHeight} min={0} step={0.5} unit={units} />

      <SelectField
        label="Origin"
        value={originPosition}
        onChange={v => setOriginPosition(v as 'front-left' | 'center')}
        options={[
          { value: 'front-left', label: 'Front-left' },
          { value: 'center',     label: 'Center' },
        ]}
      />
    </PanelSection>
  )
}
