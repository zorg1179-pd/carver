import { Play, Loader, Eye, EyeOff } from 'lucide-react'
import PanelSection from '@/components/ui/PanelSection'
import { useComputeToolpaths } from '@/hooks/useComputeToolpaths'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'

export default function ToolpathsPanel() {
  const { compute, toolpaths, isComputing, totalMoves } = useComputeToolpaths()
  const { shapes } = useDocumentStore()
  const { showToolpaths, setShowToolpaths } = useUIStore()

  const configured = shapes.filter(s => s.cutConfig).length
  const unconfigured = shapes.length - configured

  return (
    <PanelSection title="Toolpaths">
      {shapes.length === 0 && (
        <p className="text-[10px] text-gray-500">No shapes on canvas</p>
      )}
      {shapes.length > 0 && (
        <div className="text-[10px] text-gray-400 space-y-0.5">
          <div><span className="text-gray-500">Shapes  </span>{shapes.length}</div>
          <div><span className="text-gray-500">Configured  </span>{configured}</div>
          {unconfigured > 0 && (
            <div className="text-yellow-500">{unconfigured} shape{unconfigured!==1?'s':''} have no cut config</div>
          )}
        </div>
      )}

      <button
        onClick={compute}
        disabled={isComputing || configured === 0}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs transition-colors"
      >
        {isComputing
          ? <><Loader size={12} className="animate-spin" /> Computing…</>
          : <><Play size={12} /> Generate Toolpaths</>}
      </button>

      {toolpaths.length > 0 && (
        <>
          <button
            onClick={() => setShowToolpaths(!showToolpaths)}
            className={`flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded border text-xs transition-colors ${
              showToolpaths
                ? 'border-blue-500 bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
                : 'border-gray-600 bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            {showToolpaths ? <><EyeOff size={12} /> Hide overlay</> : <><Eye size={12} /> Show on canvas</>}
          </button>
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <div><span className="text-gray-500">Toolpaths  </span>{toolpaths.length}</div>
            <div><span className="text-gray-500">Total moves  </span>{totalMoves}</div>
            {toolpaths.map(tp => (
              <div key={tp.shapeId} className="text-gray-500 pl-2">
                {tp.operation}: {tp.moves.length} moves
              </div>
            ))}
          </div>
        </>
      )}
    </PanelSection>
  )
}
