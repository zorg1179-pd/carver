import { useMaterialStore, useMachineStore } from '@/stores'
import NumberField from '@/components/ui/NumberField'
import PanelSection from '@/components/ui/PanelSection'

export default function MaterialPanel() {
  const { thickness, stockSurfaceZ, setThickness, setStockSurfaceZ } = useMaterialStore()
  const { units } = useMachineStore()

  return (
    <PanelSection title="Material">
      <NumberField label="Thickness"      value={thickness}     onChange={setThickness}     min={0.1} step={0.5} unit={units} />
      <NumberField label="Stock surface Z" value={stockSurfaceZ} onChange={setStockSurfaceZ}           step={0.1} unit={units} />
    </PanelSection>
  )
}
