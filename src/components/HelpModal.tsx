import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Row { keys: string[]; desc: string }
interface Section { title: string; rows: Row[] }

const SECTIONS: Section[] = [
  {
    title: 'Tools',
    rows: [
      { keys: ['S'], desc: 'Select' },
      { keys: ['L'], desc: 'Line / Polyline' },
      { keys: ['P'], desc: 'Pen / Bezier' },
      { keys: ['R'], desc: 'Rectangle' },
      { keys: ['C'], desc: 'Circle / Ellipse' },
      { keys: ['T'], desc: 'Text' },
    ],
  },
  {
    title: 'Canvas',
    rows: [
      { keys: ['F'], desc: 'Fit to view' },
      { keys: ['Space'], desc: 'Pan (hold + drag)' },
      { keys: ['Scroll'], desc: 'Zoom in / out' },
      { keys: ['Esc'], desc: 'Cancel / deselect' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { keys: ['Ctrl', 'Z'], desc: 'Undo' },
      { keys: ['Ctrl', 'Y'], desc: 'Redo' },
      { keys: ['Del'], desc: 'Delete selected shape(s)' },
      { keys: ['W'], desc: 'Weld endpoints (2 paths selected)' },
    ],
  },
  {
    title: 'Node Edit  (dbl-click path)',
    rows: [
      { keys: ['Del'], desc: 'Delete node' },
      { keys: ['B'], desc: 'Break path at node' },
      { keys: ['O'], desc: 'Open / close path' },
      { keys: ['R'], desc: 'Reverse direction' },
      { keys: ['C'], desc: 'Convert segment (hover segment)' },
      { keys: ['Esc'], desc: 'Exit node editing' },
    ],
  },
]

function KeyBadge({ k }: { k: string }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-[10px] text-gray-300 font-mono leading-none">
      {k}
    </kbd>
  )
}

interface Props { onClose: () => void }

export default function HelpModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto max-h-[70vh]">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-[10px] text-gray-500 uppercase tracking-widest mb-2.5">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.rows.map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">{desc}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-gray-600 text-[9px] mx-0.5">+</span>}
                          <KeyBadge k={k} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-700 text-center text-[10px] text-gray-600">
          Press <KeyBadge k="?" /> to toggle this reference
        </div>
      </div>
    </div>
  )
}
