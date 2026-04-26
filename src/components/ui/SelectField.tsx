interface Option { value: string; label: string }

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  className?: string
}

export default function SelectField({ label, value, onChange, options, className }: Props) {
  return (
    <div className={className}>
      <label className="text-[10px] text-gray-400 block mb-0.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
