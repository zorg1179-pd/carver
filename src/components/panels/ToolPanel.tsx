import { useToolStore, useMachineStore } from '@/stores'
import type { BitType } from '@/types'
import NumberField from '@/components/ui/NumberField'
import SelectField from '@/components/ui/SelectField'
import PanelSection from '@/components/ui/PanelSection'

const BIT_OPTIONS: { value: BitType; label: string }[] = [
  { value: 'flat-end-mill', label: 'Flat end mill' },
  { value: 'ball-nose',     label: 'Ball nose' },
  { value: 'v-bit',         label: 'V-bit' },
  { value: 'drag-knife',    label: 'Drag knife' },
]

export default function ToolPanel() {
  const {
    bitType, diameter, vBitAngle, spindleRpm, feedRate, plungeRate, maxDepthPerPass,
    setBitType, setDiameter, setVBitAngle, setSpindleRpm, setFeedRate, setPlungeRate, setMaxDepthPerPass,
  } = useToolStore()
  const { units } = useMachineStore()
  const rateUnit = `${units}/m`

  return (
    <PanelSection title="Tool">
      <SelectField label="Bit type" value={bitType} onChange={v => setBitType(v as BitType)} options={BIT_OPTIONS} />
      <NumberField label="Diameter" value={diameter} onChange={setDiameter} min={0.1} step={0.1} unit={units} />
      {bitType === 'v-bit' && (
        <NumberField label="V-bit angle" value={vBitAngle} onChange={setVBitAngle} min={1} max={179} step={1} unit="°" />
      )}
      <NumberField label="Spindle RPM" value={spindleRpm} onChange={setSpindleRpm} min={1} step={100} unit="rpm" />
      <div className="flex gap-1.5">
        <NumberField label="Feed rate"   value={feedRate}   onChange={setFeedRate}   min={1} step={10} unit={rateUnit} className="flex-1" />
        <NumberField label="Plunge rate" value={plungeRate} onChange={setPlungeRate} min={1} step={10} unit={rateUnit} className="flex-1" />
      </div>
      <NumberField label="Max depth / pass" value={maxDepthPerPass} onChange={setMaxDepthPerPass} min={0.01} step={0.1} unit={units} />
    </PanelSection>
  )
}
