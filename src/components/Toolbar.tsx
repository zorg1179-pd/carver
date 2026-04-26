import { useEffect } from 'react'
import { MousePointer, Minus, Square, Circle, Type, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { useUIStore, type ToolType } from '@/stores/useUIStore'

const TOOLS: { tool: ToolType; Icon: LucideIcon; label: string; key: string }[] = [
  { tool: 'select', Icon: MousePointer, label: 'Select',           key: 'S' },
  { tool: 'line',   Icon: Minus,        label: 'Line / Polyline',  key: 'L' },
  { tool: 'rect',   Icon: Square,       label: 'Rectangle',        key: 'R' },
  { tool: 'circle', Icon: Circle,       label: 'Circle / Ellipse', key: 'C' },
  { tool: 'text',   Icon: Type,         label: 'Text',             key: 'T' },
]

export default function Toolbar() {
  const { currentTool, setCurrentTool } = useUIStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key.toLowerCase()) {
        case 's': setCurrentTool('select'); break
        case 'l': setCurrentTool('line');   break
        case 'r': setCurrentTool('rect');   break
        case 'c': setCurrentTool('circle'); break
        case 't': setCurrentTool('text');   break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCurrentTool])

  return (
    <div className="flex flex-col items-center gap-1 pt-2">
      {TOOLS.map(({ tool, Icon, label, key }) => (
        <button
          key={tool}
          title={`${label}  (${key})`}
          onClick={() => setCurrentTool(tool)}
          className={clsx(
            'w-10 h-10 rounded flex items-center justify-center transition-colors',
            currentTool === tool
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white',
          )}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
