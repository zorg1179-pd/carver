import { useEffect, useRef, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import MachineBed from './MachineBed'
import DrawingLayer from './DrawingLayer'
import ToolpathLayer from './ToolpathLayer'
import NodeEditLayer from './NodeEditLayer'
import MachinePositionLayer from './MachinePositionLayer'
import { useDrawingTool } from './useDrawingTool'
import { useMachineStore, useDocumentStore, useToolpathStore } from '@/stores'
import { useUIStore, TEXT_FONTS } from '@/stores/useUIStore'
import { useCanvasTransform } from '@/hooks/useCanvasTransform'
import type {
  Shape, LineShape, RectShape, CircleShape, EllipseShape, TextShape, PathShape,
} from '@/types'

type BBox = { x1: number; y1: number; x2: number; y2: number }

function getShapeBBox(shape: Shape): BBox | null {
  if (shape.type === 'line') {
    const s = shape as LineShape
    const xs = s.points.filter((_, i) => i % 2 === 0)
    const ys = s.points.filter((_, i) => i % 2 !== 0)
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
  }
  if (shape.type === 'rect') {
    const s = shape as RectShape
    return { x1: s.x, y1: s.y, x2: s.x + s.width, y2: s.y + s.height }
  }
  if (shape.type === 'circle') {
    const s = shape as CircleShape
    return { x1: s.x - s.radius, y1: s.y - s.radius, x2: s.x + s.radius, y2: s.y + s.radius }
  }
  if (shape.type === 'ellipse') {
    const s = shape as EllipseShape
    return { x1: s.x - s.radiusX, y1: s.y - s.radiusY, x2: s.x + s.radiusX, y2: s.y + s.radiusY }
  }
  if (shape.type === 'text') {
    const s = shape as TextShape
    return { x1: s.x, y1: s.y - s.fontSize, x2: s.x + s.text.length * s.fontSize * 0.6, y2: s.y }
  }
  if (shape.type === 'path') {
    const s = shape as PathShape
    const nums = s.data.match(/-?[\d.]+/g)?.map(Number)
    if (!nums || nums.length < 2) return null
    const ox = s.x ?? 0, oy = s.y ?? 0, sx = s.scaleX ?? 1, sy = s.scaleY ?? 1
    const xs = nums.filter((_, i) => i % 2 === 0).map((v) => ox + v * sx)
    const ys = nums.filter((_, i) => i % 2 !== 0).map((v) => oy + v * sy)
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
  }
  return null
}

function bboxIntersects(sel: BBox, bbox: BBox): boolean {
  return sel.x1 < bbox.x2 && sel.x2 > bbox.x1 && sel.y1 < bbox.y2 && sel.y2 > bbox.y1
}

export default function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const isPanning = useRef(false)
  const lastPtr = useRef({ x: 0, y: 0 })
  const isSpaceDown = useRef(false)

  const isDragSelecting = useRef(false)
  const dragSelectOrigin = useRef({ x: 0, y: 0 })
  const [dragRect, setDragRect] = useState<BBox | null>(null)

  const [cursor, setCursor] = useState('crosshair')
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 })
  const textInputRef = useRef<HTMLInputElement>(null)

  const { bedWidth, bedHeight, units } = useMachineStore()
  const { shapes, selectedIds, setSelectedId, setSelectedIds, clearSelection, removeSelectedShapes, undo, redo } = useDocumentStore()
  const { toolpaths } = useToolpathStore()
  const {
    currentTool, setCurrentTool,
    showToolpaths, toolpathPlaying, toolpathSpeed,
    setToolpathPlaying, setToolpathSpeed, resetToolpathAnimation,
    textFont, setTextFont, textFontSize, setTextFontSize,
    snapEnabled, setSnapEnabled, snapGridSize, setSnapGridSize,
    nodeEditShapeId, setNodeEditShapeId,
  } = useUIStore()
  const { transform, setTransform, fitToView } = useCanvasTransform(bedWidth, bedHeight)
  const drawing = useDrawingTool()

  const transformRef = useRef(transform)
  transformRef.current = transform

  // ── Prevent Konva's container.focus() from stealing the text input's focus ───
  // Konva calls container.focus() on mouseup — a separate browser task from
  // mousedown. Attaching the listener on mount (not conditionally) ensures it's
  // already present when the very first click opens the text input.
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const reclaim = () => textInputRef.current?.focus()
    container.addEventListener('focus', reclaim)
    return () => container.removeEventListener('focus', reclaim)
  }, [])

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return   // hidden tab — skip
      setSize({ width, height })
      fitToView(width, height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitToView])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement
      if (inInput) return
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        isSpaceDown.current = true
        setCursor('grab')
      }
      if (e.code === 'KeyF') {
        const el = containerRef.current
        if (el) fitToView(el.clientWidth, el.clientHeight - 28)
      }
      if (e.code === 'KeyS') {
        setSnapEnabled(!snapEnabledRef.current)
      }
      if (e.code === 'Escape') {
        if (nodeEditShapeIdRef.current) {
          setNodeEditShapeId(null)
          return
        }
        drawing.cancel()
        clearSelection()
        setCurrentTool('select')
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedIds.length > 0) {
        removeSelectedShapes()
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDown.current = false
        if (!isPanning.current) setCursor('crosshair')
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [fitToView, selectedIds, drawing, setSelectedId, clearSelection, setCurrentTool, removeSelectedShapes, undo, redo, setSnapEnabled, setNodeEditShapeId])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const snapEnabledRef = useRef(snapEnabled)
  snapEnabledRef.current = snapEnabled
  const snapGridSizeRef = useRef(snapGridSize)
  snapGridSizeRef.current = snapGridSize
  const nodeEditShapeIdRef = useRef(nodeEditShapeId)
  nodeEditShapeIdRef.current = nodeEditShapeId

  const getCanvasPt = () => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const pos = stage.getPointerPosition()
    if (!pos) return { x: 0, y: 0 }
    const t = transformRef.current
    const raw = { x: (pos.x - t.x) / t.scale, y: (pos.y - t.y) / t.scale }
    if (snapEnabledRef.current) {
      const g = snapGridSizeRef.current
      return { x: Math.round(raw.x / g) * g, y: Math.round(raw.y / g) * g }
    }
    return raw
  }

  // ── Stage events ─────────────────────────────────────────────────────────────
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const t = transformRef.current
    const anchor = { x: (pointer.x - t.x) / t.scale, y: (pointer.y - t.y) / t.scale }
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.5, Math.min(50, t.scale * factor))
    setTransform({ scale: newScale, x: pointer.x - anchor.x * newScale, y: pointer.y - anchor.y * newScale })
  }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Middle mouse or space = pan
    if (e.evt.button === 1 || isSpaceDown.current) {
      e.evt.preventDefault()
      isPanning.current = true
      lastPtr.current = { x: e.evt.clientX, y: e.evt.clientY }
      setCursor('grabbing')
      return
    }
    // Left click in draw mode
    if (e.evt.button === 0 && currentTool !== 'select') {
      drawing.onPointerDown(getCanvasPt())
      return
    }
    // Left click on empty canvas in select mode → start drag select
    if (e.evt.button === 0 && currentTool === 'select' && e.target === stageRef.current) {
      const pt = getCanvasPt()
      isDragSelecting.current = true
      dragSelectOrigin.current = pt
      setDragRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y })
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) {
      const dx = e.evt.clientX - lastPtr.current.x
      const dy = e.evt.clientY - lastPtr.current.y
      lastPtr.current = { x: e.evt.clientX, y: e.evt.clientY }
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
    }
    if (isDragSelecting.current) {
      const pt = getCanvasPt()
      const o = dragSelectOrigin.current
      setDragRect({ x1: o.x, y1: o.y, x2: pt.x, y2: pt.y })
    }
    if (currentTool !== 'select') {
      drawing.onPointerMove(getCanvasPt())
    }
    // Update status bar (Y flipped to match CNC convention)
    const stage = stageRef.current
    if (stage) {
      const pos = stage.getPointerPosition()
      if (pos) {
        const t = transformRef.current
        setPointerPos({
          x: (pos.x - t.x) / t.scale,
          y: bedHeight - (pos.y - t.y) / t.scale,
        })
      }
    }
  }

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) {
      isPanning.current = false
      setCursor(isSpaceDown.current ? 'grab' : 'crosshair')
    }
    if (isDragSelecting.current) {
      isDragSelecting.current = false
      if (dragRect) {
        const sel: BBox = {
          x1: Math.min(dragRect.x1, dragRect.x2),
          y1: Math.min(dragRect.y1, dragRect.y2),
          x2: Math.max(dragRect.x1, dragRect.x2),
          y2: Math.max(dragRect.y1, dragRect.y2),
        }
        // Only apply if the user dragged a meaningful distance (not just a click)
        if (sel.x2 - sel.x1 > 1 || sel.y2 - sel.y1 > 1) {
          const hitIds = shapes
            .filter((s) => { const bb = getShapeBBox(s); return bb && bboxIntersects(sel, bb) })
            .map((s) => s.id)
          if (hitIds.length > 0) setSelectedIds(hitIds)
          else clearSelection()
        }
      }
      setDragRect(null)
    }
    if (e.evt.button === 0 && currentTool !== 'select') {
      drawing.onPointerUp(getCanvasPt())
    }
  }

  const stopPan = () => {
    if (isPanning.current) {
      isPanning.current = false
      setCursor(isSpaceDown.current ? 'grab' : 'crosshair')
    }
    if (isDragSelecting.current) {
      isDragSelecting.current = false
      setDragRect(null)
    }
  }

  // Deselect / exit node-edit when clicking empty stage in select mode
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentTool === 'select' && e.target === stageRef.current) {
      if (nodeEditShapeId) {
        setNodeEditShapeId(null)
        return
      }
      clearSelection()
    }
  }

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentTool === 'line') {
      drawing.onDoubleClick()
      return
    }
    if (currentTool === 'select' && e.target !== stageRef.current) {
      const id = e.target.id()
      const shape = id ? shapes.find(s => s.id === id) : null
      if (shape && (shape.type === 'line' || shape.type === 'path')) {
        setSelectedId(id)
        setNodeEditShapeId(id)
      }
    }
  }

  // Text input screen position
  const textScreenPos = {
    x: transform.x + drawing.textState.canvasX * transform.scale,
    y: transform.y + drawing.textState.canvasY * transform.scale,
  }

  const dec = units === 'mm' ? 2 : 3
  const zoomPct = Math.round(transform.scale * 100)
  const canvasH = size.height - 28

  return (
    <div ref={containerRef} className="w-full h-full relative bg-gray-950 flex flex-col" style={{ cursor }}>

      {/* Text tool options bar */}
      {currentTool === 'text' && (
        <div className="absolute top-0 inset-x-0 z-10 h-8 bg-gray-900/95 border-b border-gray-700 flex items-center gap-2 px-3 pointer-events-auto select-none">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider mr-1">Font</span>
          <select
            value={textFont}
            onChange={(e) => setTextFont(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => e.stopPropagation()}
          >
            {TEXT_FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <span className="text-gray-500 text-[10px] uppercase tracking-wider ml-1">Size</span>
          <input
            type="number"
            min={1}
            max={500}
            value={textFontSize}
            onChange={(e) => setTextFontSize(Math.max(1, Number(e.target.value)))}
            className="w-16 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span className="text-gray-500 text-xs">{units}</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Stage
          ref={stageRef}
          width={size.width}
          height={canvasH}
          x={transform.x}
          y={transform.y}
          scaleX={transform.scale}
          scaleY={transform.scale}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={stopPan}
          onClick={handleStageClick}
          onDblClick={handleDblClick}
        >
          <Layer>
            <MachineBed width={bedWidth} height={bedHeight} scale={transform.scale} />
          </Layer>
          <DrawingLayer previewShape={drawing.previewShape} />
          <ToolpathLayer />
          <NodeEditLayer scale={transform.scale} />
          <MachinePositionLayer scale={transform.scale} />
        </Stage>

      </div>

      {/* Drag-select rubber-band rect */}
      {dragRect && (
        <div
          className="absolute pointer-events-none border border-blue-400 bg-blue-400/10 z-10"
          style={{
            left: Math.min(dragRect.x1, dragRect.x2) * transform.scale + transform.x,
            top:  Math.min(dragRect.y1, dragRect.y2) * transform.scale + transform.y,
            width:  Math.abs(dragRect.x2 - dragRect.x1) * transform.scale,
            height: Math.abs(dragRect.y2 - dragRect.y1) * transform.scale,
          }}
        />
      )}

      {/* Text input overlay — lives outside overflow-hidden so it's never clipped */}
      {drawing.textState.visible && (
        <input
          ref={textInputRef}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Type text…"
          className="absolute z-10 bg-gray-900/80 border border-blue-400 text-white outline-none px-1 rounded min-w-[120px]"
          style={{
            left: textScreenPos.x,
            top: textScreenPos.y,
            fontSize: Math.max(11, textFontSize * transform.scale),
            fontFamily: textFont,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = e.currentTarget.value
              drawing.commitText(val)
              if (val.trim()) setCurrentTool('select')
            }
            if (e.key === 'Escape') drawing.commitText('')
            e.stopPropagation()
          }}
          onBlur={(e) => {
            // Konva calls container.focus() on mouseup — ignore that focus steal
            if (e.relatedTarget === stageRef.current?.container()) return
            drawing.commitText(e.target.value)
          }}
        />
      )}

      {/* Toolpath animation controls */}
      {showToolpaths && toolpaths.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2
                        bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-full
                        px-3 py-1.5 text-xs pointer-events-auto select-none">
          {/* Reset */}
          <button
            onClick={resetToolpathAnimation}
            title="Reset to start"
            className="text-gray-400 hover:text-white transition-colors font-mono"
          >⏮</button>
          {/* Play / Pause */}
          <button
            onClick={() => setToolpathPlaying(!toolpathPlaying)}
            title={toolpathPlaying ? 'Pause' : 'Play'}
            className="text-gray-200 hover:text-white transition-colors font-mono w-5 text-center"
          >{toolpathPlaying ? '⏸' : '▶'}</button>
          {/* Speed */}
          <div className="flex gap-1 border-l border-gray-700 pl-2 ml-1">
            {(['slow', 'normal', 'fast'] as const).map((s, i) => (
              <button
                key={s}
                onClick={() => setToolpathSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  toolpathSpeed === s
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >{['1×', '10×', '100×'][i]}</button>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 border-l border-gray-700 pl-2 ml-1 text-[10px]">
            <span className="text-red-400">╌╌</span><span className="text-gray-500">Rapid</span>
            <span className="text-green-400">─</span><span className="text-gray-500">Plunge</span>
            <span className="text-blue-400">─</span><span className="text-gray-500">Cut</span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="h-7 bg-gray-900 border-t border-gray-700 flex items-center px-3 gap-4 text-xs font-mono text-gray-400 shrink-0">
        <span>
          X {pointerPos.x.toFixed(dec)} &nbsp; Y {pointerPos.y.toFixed(dec)}
          &nbsp;<span className="text-gray-600">{units}</span>
        </span>
        <span className="text-gray-700">|</span>
        <span>Zoom {zoomPct}%</span>
        <span className="text-gray-700">|</span>
        <button
          className="text-blue-400 hover:text-blue-300 transition-colors"
          onClick={() => fitToView(size.width, canvasH)}
        >
          Fit <kbd className="text-gray-600">F</kbd>
        </button>
        <span className="text-gray-700">|</span>
        <button
          onClick={() => setSnapEnabled(!snapEnabled)}
          className={`transition-colors ${snapEnabled ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
        >
          Snap <kbd className="text-gray-600">S</kbd>
        </button>
        {snapEnabled && (
          <input
            type="number"
            min={0.1} max={100} step={0.5}
            value={snapGridSize}
            onChange={e => setSnapGridSize(Math.max(0.1, Number(e.target.value)))}
            onKeyDown={e => e.stopPropagation()}
            className="w-12 bg-gray-800 border border-gray-600 rounded px-1 text-[10px] text-white focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            title="Snap grid size"
          />
        )}
        {nodeEditShapeId && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-amber-400">Node editing</span>
            <button
              onClick={() => setNodeEditShapeId(null)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Exit node editor (Esc)"
            >✕</button>
          </>
        )}
        <span className="ml-auto text-gray-700 hidden lg:block">
          Space+drag · middle-click to pan · scroll to zoom · Del to delete
        </span>
      </div>
    </div>
  )
}
