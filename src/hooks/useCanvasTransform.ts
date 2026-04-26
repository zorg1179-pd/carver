import { useState, useCallback } from 'react'

export interface CanvasTransform {
  x: number
  y: number
  scale: number
}

export function useCanvasTransform(bedWidth: number, bedHeight: number) {
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 })

  const fitToView = useCallback(
    (viewWidth: number, viewHeight: number) => {
      const scale = Math.min(viewWidth / bedWidth, viewHeight / bedHeight) * 0.85
      setTransform({
        scale,
        x: (viewWidth - bedWidth * scale) / 2,
        y: (viewHeight - bedHeight * scale) / 2,
      })
    },
    [bedWidth, bedHeight],
  )

  return { transform, setTransform, fitToView }
}
