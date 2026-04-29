import { useRef, useState, useEffect } from 'react'
import { FilePlus, FolderOpen, Save, AlertCircle, Undo2, Redo2, Plug, PlugZap } from 'lucide-react'
import { useDocumentStore } from '@/stores'
import { useSerialStore } from '@/stores/useSerialStore'
import { connect, disconnect } from '@/serial/serialService'

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
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const popoverRef    = useRef<HTMLDivElement>(null)
  const { past, future, undo, redo } = useDocumentStore()
  const { status, baudRate, controllerName, setBaudRate } = useSerialStore()
  const [showPopover, setShowPopover] = useState(false)

  const webSerialSupported = 'serial' in navigator

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setShowPopover(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPopover])

  const statusText = isDirty
    ? 'Saving…'
    : lastSavedAt
      ? `Auto-saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : null

  const isConnected = status !== 'disconnected'

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

      <div className="w-px h-4 bg-gray-700 mx-1" />

      <button
        onClick={undo}
        disabled={past.length === 0}
        title="Undo  (Ctrl+Z)"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white hover:bg-gray-800 disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <Undo2 size={12} /> Undo
      </button>
      <button
        onClick={redo}
        disabled={future.length === 0}
        title="Redo  (Ctrl+Y)"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white hover:bg-gray-800 disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <Redo2 size={12} /> Redo
      </button>

      <div className="w-px h-4 bg-gray-700 mx-1" />

      {/* ── Serial connect button ──────────────────────────────────────────── */}
      {webSerialSupported ? (
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowPopover((v) => !v)}
            title={isConnected ? controllerName : 'Connect to machine'}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              isConnected
                ? 'text-green-400 border border-green-800 bg-green-900/20 hover:bg-green-900/40'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {isConnected ? <PlugZap size={12} /> : <Plug size={12} />}
            {isConnected ? (controllerName || '● Connected') : 'Connect'}
          </button>

          {showPopover && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-600 rounded shadow-xl p-3 w-48">
              <div className="text-[10px] text-gray-400 mb-1">Baud rate</div>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1
                           text-xs text-white mb-3 focus:outline-none focus:border-blue-500"
              >
                <option value={115200}>115200</option>
                <option value={57600}>57600</option>
                <option value={9600}>9600</option>
              </select>

              {isConnected ? (
                <button
                  onClick={() => { disconnect(); setShowPopover(false) }}
                  className="w-full px-2 py-1.5 rounded bg-red-900/40 border border-red-800
                             text-red-400 text-xs hover:bg-red-900/60 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => { connect(); setShowPopover(false) }}
                  className="w-full px-2 py-1.5 rounded bg-green-800/40 border border-green-700
                             text-green-300 text-xs hover:bg-green-800/60 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          disabled
          title="WebSerial requires Chrome or Edge"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-600 cursor-not-allowed"
        >
          <Plug size={12} /> Connect
        </button>
      )}

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
