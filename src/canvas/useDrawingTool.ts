import { useState, useRef, useCallback, useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useDocumentStore } from '@/stores'
import type { Shape, LineShape, RectShape, EllipseShape, TextShape } from '@/types'

export interface Point { x: number; y: number }

const DEFAULT_STYLE = { stroke: '#e2e8f0', fill: 'transparent', strokeWidth: 0.5 }

export function useDrawingTool() {
  const { currentTool, textFont, textFontSize } = useUIStore()
  const { addShape, setSelectedId } = useDocumentStore()

  const [previewShape, setPreviewShape] = useState<Shape | null>(null)
  const [textState, setTextState] = useState({ visible: false, canvasX: 0, canvasY: 0 })

  const isDrawing = useRef(false)
  const startPt = useRef<Point>({ x: 0, y: 0 })
  const polyPts = useRef<number[]>([])

  const cancel = useCallback(() => {
    isDrawing.current = false
    polyPts.current = []
    setPreviewShape(null)
    setTextState({ visible: false, canvasX: 0, canvasY: 0 })
  }, [])

  // Cancel in-progress drawing when tool changes
  useEffect(() => { cancel() }, [currentTool, cancel])

  const onPointerDown = useCallback((pt: Point) => {
    if (currentTool === 'select') return

    if (currentTool === 'text') {
      setTextState({ visible: true, canvasX: pt.x, canvasY: pt.y })
      return
    }

    if (currentTool === 'line') {
      if (!isDrawing.current) {
        polyPts.current = [pt.x, pt.y, pt.x, pt.y]
        isDrawing.current = true
      } else {
        // Confirm current preview point, append new preview tail
        polyPts.current = [...polyPts.current.slice(0, -2), pt.x, pt.y, pt.x, pt.y]
      }
      setPreviewShape({
        id: '__preview__', type: 'line',
        points: [...polyPts.current], style: DEFAULT_STYLE,
      } as LineShape)
      return
    }

    startPt.current = pt
    isDrawing.current = true
  }, [currentTool])

  const onPointerMove = useCallback((pt: Point) => {
    if (!isDrawing.current) return

    if (currentTool === 'line') {
      polyPts.current = [...polyPts.current.slice(0, -2), pt.x, pt.y]
      setPreviewShape({
        id: '__preview__', type: 'line',
        points: [...polyPts.current], style: DEFAULT_STYLE,
      } as LineShape)
      return
    }

    const s = startPt.current
    if (currentTool === 'rect') {
      setPreviewShape({
        id: '__preview__', type: 'rect',
        x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y),
        width: Math.abs(pt.x - s.x), height: Math.abs(pt.y - s.y),
        style: DEFAULT_STYLE,
      } as RectShape)
    } else if (currentTool === 'circle') {
      setPreviewShape({
        id: '__preview__', type: 'ellipse',
        x: (s.x + pt.x) / 2, y: (s.y + pt.y) / 2,
        radiusX: Math.abs(pt.x - s.x) / 2,
        radiusY: Math.abs(pt.y - s.y) / 2,
        style: DEFAULT_STYLE,
      } as EllipseShape)
    }
  }, [currentTool])

  const onPointerUp = useCallback((_pt: Point) => {
    if (currentTool === 'line') return  // line finishes on dblclick
    if (!isDrawing.current || !previewShape) { isDrawing.current = false; return }

    if (previewShape.type === 'rect') {
      const r = previewShape as RectShape
      if (r.width < 0.5 || r.height < 0.5) { cancel(); return }
    }
    if (previewShape.type === 'ellipse') {
      const e = previewShape as EllipseShape
      if (e.radiusX < 0.5 || e.radiusY < 0.5) { cancel(); return }
    }

    const committed: Shape = { ...previewShape, id: crypto.randomUUID() }
    addShape(committed)
    setSelectedId(committed.id)
    isDrawing.current = false
    setPreviewShape(null)
  }, [currentTool, previewShape, addShape, setSelectedId, cancel])

  const onDoubleClick = useCallback(() => {
    if (currentTool !== 'line' || !isDrawing.current) return
    const pts = polyPts.current.slice(0, -2)  // drop trailing preview vertex
    if (pts.length >= 4) {
      const shape: LineShape = {
        id: crypto.randomUUID(), type: 'line', points: pts, style: DEFAULT_STYLE,
      }
      addShape(shape)
      setSelectedId(shape.id)
    }
    polyPts.current = []
    isDrawing.current = false
    setPreviewShape(null)
  }, [currentTool, addShape, setSelectedId])

  const commitText = useCallback((text: string) => {
    if (text.trim()) {
      const shape: TextShape = {
        id: crypto.randomUUID(), type: 'text',
        x: textState.canvasX, y: textState.canvasY,
        text: text.trim(),
        fontSize: textFontSize,
        fontFamily: textFont,
        style: DEFAULT_STYLE,
      }
      addShape(shape)
      setSelectedId(shape.id)
    }
    setTextState({ visible: false, canvasX: 0, canvasY: 0 })
  }, [textState, textFont, textFontSize, addShape, setSelectedId])

  return {
    previewShape,
    textState,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    commitText,
    cancel,
  }
}
