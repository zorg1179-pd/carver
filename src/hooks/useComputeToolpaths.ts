import { useCallback } from 'react'
import { useDocumentStore, useMachineStore, useMaterialStore, useToolStore, useToolpathStore } from '@/stores'
import { computeAllToolpaths } from '@/toolpath'

export function useComputeToolpaths() {
  const { shapes }                            = useDocumentStore()
  const { safeHeight }                        = useMachineStore()
  const { stockSurfaceZ }                     = useMaterialStore()
  const { diameter, feedRate, plungeRate, maxDepthPerPass, vBitAngle } = useToolStore()
  const { toolpaths, isComputing, setToolpaths, setIsComputing } = useToolpathStore()

  const compute = useCallback(() => {
    setIsComputing(true)
    // Yield to paint before heavy math
    setTimeout(() => {
      try {
        const tps = computeAllToolpaths(
          shapes,
          { diameter, feedRate, plungeRate, maxDepthPerPass, vBitAngle },
          { safeHeight },
          { stockSurfaceZ },
        )
        setToolpaths(tps)
      } catch (err) {
        console.error('[carver] toolpath computation failed:', err)
        setToolpaths([])
      } finally {
        setIsComputing(false)
      }
    }, 0)
  }, [shapes, diameter, feedRate, plungeRate, maxDepthPerPass, vBitAngle,
      safeHeight, stockSurfaceZ, setToolpaths, setIsComputing])

  const totalMoves = toolpaths.reduce((s, tp) => s + tp.moves.length, 0)

  return { compute, toolpaths, isComputing, totalMoves }
}
