import { useState, useEffect } from 'react'

interface Props {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
}

export default function NumberField({ label, value, onChange, min, max, step = 1, unit, className }: Props) {
  const [raw, setRaw] = useState(String(value))

  useEffect(() => { setRaw(String(value)) }, [value])

  const commit = () => {
    const n = parseFloat(raw)
    if (!isNaN(n)) {
      let clamped = n
      if (min !== undefined) clamped = Math.max(min, clamped)
      if (max !== undefined) clamped = Math.min(max, clamped)
      onChange(clamped)
      setRaw(String(clamped))
    } else {
      setRaw(String(value))
    }
  }

  return (
    <div className={className}>
      <label className="text-[10px] text-gray-400 block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit() }}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit && <span className="text-[10px] text-gray-500 shrink-0">{unit}</span>}
      </div>
    </div>
  )
}
