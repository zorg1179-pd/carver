import { useState, useCallback, useMemo } from 'react'
import { useToolpathStore } from '@/stores/useToolpathStore'
import { useToolStore } from '@/stores/useToolStore'
import { useMaterialStore } from '@/stores/useMaterialStore'
import { useMachineStore } from '@/stores/useMachineStore'
import { simulateHeightmap } from './heightmapSim'
import type { HeightmapResult } from './heightmapSim'
import PreviewScene from './PreviewScene'
import type { ViewMode } from './PreviewScene'
import HeightmapView2D from './HeightmapView2D'

const QUALITY_OPTIONS = [
  { label: 'Low',    res: 128 },
  { label: 'Medium', res: 256 },
  { label: 'High',   res: 512 },
] as const

type Quality = typeof QUALITY_OPTIONS[number]['label']

function checkWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

export default function PreviewPane() {
  const { toolpaths } = useToolpathStore()
  const { bitType, diameter, vBitAngle } = useToolStore()
  const { thickness } = useMaterialStore()
  const { bedWidth, bedHeight } = useMachineStore()

  const webgl2 = useMemo(checkWebGL2, [])

  const [heightmap,  setHeightmap]  = useState<HeightmapResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [viewMode,   setViewMode]   = useState<ViewMode>('shaded')
  const [quality,    setQuality]    = useState<Quality>('Medium')

  const simulate = useCallback(() => {
    if (!toolpaths.length) return
    setSimulating(true)

    // Yield to the UI so the "Simulating…" label renders before the heavy work
    setTimeout(() => {
      const res = QUALITY_OPTIONS.find(o => o.label === quality)!.res
      const result = simulateHeightmap(toolpaths, {
        bedWidth, bedHeight, thickness,
        bitType, diameter, vBitAngle,
        resolution: res,
      })
      setHeightmap(result)
      setSimulating(false)
    }, 16)
  }, [toolpaths, bedWidth, bedHeight, thickness, bitType, diameter, vBitAngle, quality])

  const noToolpaths = toolpaths.length === 0

  return (
    <div className="w-full h-full flex flex-col bg-gray-950">

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="h-8 bg-gray-900 border-b border-gray-700 flex items-center gap-2 px-3 shrink-0 select-none">

        {/* Quality selector */}
        <select
          value={quality}
          onChange={e => setQuality(e.target.value as Quality)}
          className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white text-xs
                     focus:outline-none focus:border-blue-500"
        >
          {QUALITY_OPTIONS.map(o => (
            <option key={o.label} value={o.label}>{o.label} ({o.res}²)</option>
          ))}
        </select>

        {/* Simulate button */}
        <button
          onClick={simulate}
          disabled={noToolpaths || simulating}
          className="px-3 py-0.5 rounded text-xs font-medium transition-colors
                     bg-blue-700 hover:bg-blue-600 text-white
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {simulating ? 'Simulating…' : 'Simulate'}
        </button>

        {noToolpaths && (
          <span className="text-gray-500 text-xs">Generate toolpaths first</span>
        )}

        {/* View mode toggles — 3D only */}
        {heightmap && webgl2 && (
          <>
            <div className="w-px h-4 bg-gray-700 mx-1" />
            {(['shaded', 'wireframe', 'xray'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-0.5 rounded text-xs capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-200'
                }`}
              >
                {mode === 'xray' ? 'X-Ray' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-gray-600 text-[10px] hidden lg:block">
              Orbit: left-drag &nbsp;·&nbsp; Pan: right-drag &nbsp;·&nbsp; Zoom: scroll
            </span>
          </>
        )}
      </div>

      {/* ── Viewport ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {heightmap ? (
          webgl2 ? (
            <PreviewScene
              heightmap={heightmap}
              bedWidth={bedWidth}
              bedHeight={bedHeight}
              thickness={thickness}
              viewMode={viewMode}
            />
          ) : (
            <HeightmapView2D
              heightmap={heightmap}
              bedWidth={bedWidth}
              bedHeight={bedHeight}
              thickness={thickness}
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-600 text-sm select-none">
            <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25" />
            </svg>
            <p>
              {noToolpaths
                ? 'No toolpaths — draw shapes and compute toolpaths first.'
                : 'Click Simulate to render the 3D cut preview.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
