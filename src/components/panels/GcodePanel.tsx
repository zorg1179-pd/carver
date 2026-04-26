import { useState, useCallback } from 'react'
import { Code, Copy, Download, Check } from 'lucide-react'
import PanelSection from '@/components/ui/PanelSection'
import NumberField from '@/components/ui/NumberField'
import { useMachineStore, useMaterialStore, useToolStore, useToolpathStore } from '@/stores'
import { serializeGcode } from '@/gcode/serializer'

export default function GcodePanel() {
  const machine  = useMachineStore()
  const material = useMaterialStore()
  const tool     = useToolStore()
  const { toolpaths, setGcode: storeSetGcode } = useToolpathStore()

  const [gcode,       setGcode]       = useState('')
  const [lineCount,   setLineCount]   = useState(0)
  const [byteSize,    setByteSize]    = useState(0)
  const [precision,   setPrecision]   = useState(3)
  const [lineNumbers, setLineNumbers] = useState(false)
  const [copied,      setCopied]      = useState(false)

  const generate = useCallback(() => {
    const result = serializeGcode(toolpaths, {
      units:             machine.units,
      bedWidth:          machine.bedWidth,
      bedHeight:         machine.bedHeight,
      originPosition:    machine.originPosition,
      spindleRpm:        tool.spindleRpm,
      safeHeight:        machine.safeHeight,
      stockSurfaceZ:     material.stockSurfaceZ,
      toolDiameter:      tool.diameter,
      bitType:           tool.bitType,
      materialThickness: material.thickness,
      precision,
      lineNumbers,
    })
    setGcode(result.gcode)
    setLineCount(result.lineCount)
    setByteSize(result.byteSize)
    storeSetGcode(result.gcode)
  }, [toolpaths, machine, material, tool, precision, lineNumbers, storeSetGcode])

  const copy = async () => {
    await navigator.clipboard.writeText(gcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const blob = new Blob([gcode], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `carver_${new Date().toISOString().slice(0, 10)}.gcode`
    a.click()
    URL.revokeObjectURL(url)
  }

  const noToolpaths = toolpaths.length === 0

  return (
    <PanelSection title="G-code" defaultOpen={false}>
      <div className="flex gap-1.5">
        <NumberField
          label="Precision"
          value={precision}
          onChange={v => setPrecision(Math.max(1, Math.min(6, Math.round(v))))}
          min={1} max={6} step={1}
          unit="dp"
          className="flex-1"
        />
        <div className="flex-1">
          <span className="text-[10px] text-gray-400 block mb-0.5">Line Nos.</span>
          <button
            onClick={() => setLineNumbers(v => !v)}
            className={`w-full py-1 text-xs rounded border transition-colors ${
              lineNumbers
                ? 'border-blue-500 bg-blue-900/40 text-blue-300'
                : 'border-gray-600 bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            {lineNumbers ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <button
        onClick={generate}
        disabled={noToolpaths}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs transition-colors"
      >
        <Code size={12} />
        Generate G-code
      </button>

      {noToolpaths && (
        <p className="text-[10px] text-gray-500">Generate toolpaths first</p>
      )}

      {gcode && (
        <>
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <div><span className="text-gray-500">Lines   </span>{lineCount.toLocaleString()}</div>
            <div><span className="text-gray-500">Size    </span>{(byteSize / 1024).toFixed(1)} KB</div>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={copy}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs transition-colors"
            >
              {copied
                ? <><Check size={12} className="text-green-400" /> Copied</>
                : <><Copy size={12} /> Copy</>}
            </button>
            <button
              onClick={download}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs transition-colors"
            >
              <Download size={12} />
              Download
            </button>
          </div>

          <textarea
            readOnly
            value={gcode}
            className="w-full h-48 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-[10px] font-mono text-green-400 resize-none focus:outline-none"
            spellCheck={false}
          />
        </>
      )}
    </PanelSection>
  )
}
