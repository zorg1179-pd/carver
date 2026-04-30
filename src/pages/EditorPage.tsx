import { useRef, useState, useEffect, lazy, Suspense } from 'react'
import { Upload, AlertTriangle, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import CanvasStage from '@/canvas/CanvasStage'
import Toolbar from '@/components/Toolbar'
import HeaderBar from '@/components/HeaderBar'
import LayersPanel     from '@/components/panels/LayersPanel'
import MachinePanel    from '@/components/panels/MachinePanel'
import MaterialPanel   from '@/components/panels/MaterialPanel'
import ToolPanel       from '@/components/panels/ToolPanel'
import ShapePanel      from '@/components/panels/ShapePanel'
import ToolpathsPanel  from '@/components/panels/ToolpathsPanel'
import GcodePanel      from '@/components/panels/GcodePanel'
import { useSvgImport } from '@/hooks/useSvgImport'
import { useProjectFile } from '@/hooks/useProjectFile'
import SerialStatusBar from '@/components/SerialStatusBar'

const PreviewPane = lazy(() => import('@/preview/PreviewPane'))

type ActiveView = 'canvas' | 'preview'

export default function EditorPage() {
  const { importFile, status, clearStatus } = useSvgImport()
  const { isDirty, lastSavedAt, loadError, newProject, saveToFile, loadFromFile } = useProjectFile()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>('canvas')

  // Auto-dismiss import status after 6 s
  useEffect(() => {
    if (status.state === 'done' || status.state === 'error') {
      const t = setTimeout(clearStatus, 6000)
      return () => clearTimeout(t)
    }
  }, [status.state, clearStatus])

  // ── Drag & drop on the canvas area ─────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if ([...e.dataTransfer.types].includes('Files')) setIsDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the main area entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) importFile(file)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white select-none overflow-hidden">
      <HeaderBar
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        loadError={loadError}
        onNew={newProject}
        onSaveToFile={saveToFile}
        onLoadFromFile={loadFromFile}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importFile(f)
          e.target.value = ''
        }}
      />

      {/* Left toolbar */}
      <aside className="w-14 bg-gray-800 border-r border-gray-700 shrink-0 flex flex-col">
        <Toolbar />

        {/* Import button at bottom of toolbar */}
        <div className="mt-auto pb-3 flex flex-col items-center">
          <div className="w-10 h-px bg-gray-700 mb-3" />
          <button
            title="Import SVG  (drag & drop also works)"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <Upload size={16} />
          </button>
        </div>
      </aside>

      {/* Canvas / Preview area */}
      <main className="flex-1 min-w-0 flex flex-col">

        {/* Tab bar */}
        <div className="h-8 bg-gray-850 border-b border-gray-700 flex items-end px-3 gap-0.5 shrink-0 bg-gray-900">
          {(['canvas', 'preview'] as ActiveView[]).map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={clsx(
                'px-4 py-1 text-xs rounded-t transition-colors capitalize',
                activeView === view
                  ? 'bg-gray-950 text-white border border-b-0 border-gray-700'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {view === 'preview' ? '3D Preview' : 'Canvas'}
            </button>
          ))}
        </div>

        {/* Canvas pane — stays mounted so pan/zoom state is preserved */}
        <div
          className={clsx('relative flex-1 min-h-0 flex flex-col', activeView !== 'canvas' && 'hidden')}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex-1 min-h-0 relative">
            <CanvasStage />

            {isDragOver && (
              <div className="absolute inset-0 bg-blue-900/60 border-2 border-dashed border-blue-400 flex items-center justify-center pointer-events-none z-20">
                <div className="bg-gray-900/90 rounded-xl px-8 py-6 flex flex-col items-center gap-3">
                  <Upload size={32} className="text-blue-400" />
                  <p className="text-white font-medium">Drop SVG to import</p>
                </div>
              </div>
            )}

            {status.state !== 'idle' && status.state !== 'loading' && (
              <div className={clsx(
                'absolute bottom-12 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full mx-4',
                'rounded-lg shadow-xl px-4 py-3 text-sm flex flex-col gap-1',
                status.state === 'done'  ? 'bg-green-900 border border-green-600 text-green-100' : '',
                status.state === 'error' ? 'bg-red-900   border border-red-600   text-red-100'   : '',
              )}>
                <div className="flex items-center gap-2">
                  {status.state === 'done'
                    ? <CheckCircle  size={15} className="text-green-400 shrink-0" />
                    : <AlertTriangle size={15} className="text-red-400 shrink-0" />}
                  <span>{status.message}</span>
                </div>
                {status.warnings.length > 0 && (
                  <ul className="text-xs text-yellow-300 space-y-0.5 pl-5 list-disc">
                    {status.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
          <SerialStatusBar />
        </div>

        {/* 3D preview pane — lazy-loaded, remounts on each visit */}
        {activeView === 'preview' && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                Loading 3D engine…
              </div>
            }>
              <PreviewPane />
            </Suspense>
          </div>
        )}

      </main>

      {/* Right properties panel */}
      <aside className="w-64 bg-gray-800 border-l border-gray-700 p-3 shrink-0 overflow-y-auto flex flex-col gap-4">
        <LayersPanel />
        <div className="w-full h-px bg-gray-700" />
        <ShapePanel />
        <div className="w-full h-px bg-gray-700" />
        <ToolpathsPanel />
        <div className="w-full h-px bg-gray-700" />
        <GcodePanel />
        <div className="w-full h-px bg-gray-700" />
        <MachinePanel />
        <div className="w-full h-px bg-gray-700" />
        <MaterialPanel />
        <div className="w-full h-px bg-gray-700" />
        <ToolPanel />

        <div className="mt-auto pt-2 border-t border-gray-700">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs transition-colors"
          >
            <Upload size={13} />
            Import SVG…
          </button>
          <p className="text-[10px] text-gray-600 mt-1">or drag &amp; drop onto the canvas</p>
        </div>
      </aside>
      </div>
    </div>
  )
}
