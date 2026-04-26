import { useRef } from 'react'
import { FilePlus, FolderOpen, Save, AlertCircle } from 'lucide-react'

interface Props {
  isDirty: boolean
  lastSavedAt: Date | null
  loadError: string | null
  onNew: () => void
  onSaveToFile: () => void
  onLoadFromFile: (file: File) => void
}

export default function HeaderBar({
  isDirty, lastSavedAt, loadError, onNew, onSaveToFile, onLoadFromFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statusText = isDirty
    ? 'Saving…'
    : lastSavedAt
      ? `Auto-saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : null

  return (
    <header className="h-9 bg-gray-950 border-b border-gray-700 flex items-center px-3 gap-1 shrink-0 select-none z-20">
      <span className="font-bold text-sm text-white tracking-widest pr-3 border-r border-gray-700 mr-1">
        CARVER
      </span>

      <input
        ref={fileInputRef}
        type="file"
        accept=".carver,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onLoadFromFile(f)
          e.target.value = ''
        }}
      />

      <button
        onClick={onNew}
        title="New project"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <FilePlus size={12} /> New
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Open .carver project file"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <FolderOpen size={12} /> Open
      </button>
      <button
        onClick={onSaveToFile}
        title="Save project as .carver file"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <Save size={12} /> Save
      </button>

      <div className="ml-auto flex items-center gap-2 text-[10px]">
        {loadError && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle size={11} />
            {loadError}
          </span>
        )}
        {statusText && !loadError && (
          <span className={isDirty ? 'text-yellow-500' : 'text-gray-600'}>
            {statusText}
          </span>
        )}
      </div>
    </header>
  )
}
