import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export default function PanelSection({ title, children, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 hover:text-gray-200 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  )
}
