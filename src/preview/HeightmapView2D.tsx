import { useEffect, useRef } from 'react'
import type { HeightmapResult } from './heightmapSim'

interface Props {
  heightmap: HeightmapResult
  bedWidth: number
  bedHeight: number
  thickness: number
}

export default function HeightmapView2D({ heightmap, bedWidth, bedHeight, thickness }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { data, width, height } = heightmap
    const imageData = ctx.createImageData(width, height)

    for (let i = 0; i < data.length; i++) {
      const t = Math.max(0, Math.min(1, -data[i] / Math.max(thickness, 0.001)))
      // Lerp: surface #c8a060 → deep #3d1f0e
      imageData.data[i * 4 + 0] = Math.round(0xc8 + (0x3d - 0xc8) * t)
      imageData.data[i * 4 + 1] = Math.round(0xa0 + (0x1f - 0xa0) * t)
      imageData.data[i * 4 + 2] = Math.round(0x60 + (0x0e - 0x60) * t)
      imageData.data[i * 4 + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
  }, [heightmap, thickness])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-950 p-6 select-none">

      {/* Depth map image */}
      <div
        className="relative border border-gray-700"
        style={{
          maxWidth: '100%',
          maxHeight: 'calc(100% - 80px)',
          aspectRatio: `${bedWidth} / ${bedHeight}`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={heightmap.width}
          height={heightmap.height}
          className="w-full h-full block"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* Axis labels */}
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-5 text-[10px] text-gray-500">
          X — {bedWidth} mm
        </span>
        <span
          className="absolute top-1/2 left-0 -translate-x-6 text-[10px] text-gray-500"
          style={{ writingMode: 'vertical-rl', transform: 'translateX(-1.25rem) translateY(-50%) rotate(180deg)' }}
        >
          Y — {bedHeight} mm
        </span>
      </div>

      {/* Legend + notice */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <div
            className="w-20 h-2.5 rounded border border-gray-700"
            style={{ background: 'linear-gradient(to right, #c8a060, #3d1f0e)' }}
          />
          <span>0 mm → {thickness.toFixed(1)} mm depth</span>
        </div>
        <p className="text-[10px] text-gray-600">
          WebGL2 unavailable on this system — showing 2D depth map
        </p>
      </div>
    </div>
  )
}
