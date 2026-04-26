import { useEffect, useRef, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import MachineBed from './MachineBed'
import DrawingLayer from './DrawingLayer'
import ToolpathLayer from './ToolpathLayer'
import { useDrawingTool } from './useDrawingTool'
import { useMachineStore, useDocumentStore, useToolpathStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import { useCanvasTransform } from '@/hooks/useCanvasTransform'

export default function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const isPanning = useRef(false)
  const lastPtr = useRef({ x: 0, y: 0 })
  const isSpaceDown = useRef(false)

  const [cursor, setCursor] = useState('crosshair')
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 })
  const textInputRef = useRef<HTMLInputElement>(null)

  const { bedWidth, bedHeight, units } = useMachineStore()
  const { selectedIds, setSelectedId, clearSelection, removeSelectedShapes } = useDocumentStore()
  const { toolpaths } = useToolpathStore()
  const {
    currentTool, setCurrentTool,
    showToolpaths, toolpathPlaying, toolpathSpeed,
    setToolpathPlaying, setToolpathSpeed, resetToolpathAnimation,
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
      if (e.code === 'Escape') {
        drawing.cancel()
        clearSelection()
        setCurrentTool('select')
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedIds.length > 0) {
        removeSelectedShapes()
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
  }, [fitToView, selectedIds, drawing, setSelectedId, clearSelection, setCurrentTool, removeSelectedShapes])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getCanvasPt = () => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const pos = stage.getPointerPosition()
    if (!pos) return { x: 0, y: 0 }
    const t = transformRef.current
    return { x: (pos.x - t.x) / t.scale, y: (pos.y - t.y) / t.scale }
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
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) {
      const dx = e.evt.clientX - lastPtr.current.x
      const dy = e.evt.clientY - lastPtr.current.y
      lastPtr.current = { x: e.evt.clientX, y: e.evt.clientY }
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
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
    if (e.evt.button === 0 && currentTool !== 'select') {
      drawing.onPointerUp(getCanvasPt())
    }
  }

  const stopPan = () => {
    if (isPanning.current) {
      isPanning.current = false
      setCursor(isSpaceDown.current ? 'grab' : 'crosshair')
    }
  }

  // Deselect when clicking empty stage in select mode
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentTool === 'select' && e.target === stageRef.current) {
      clearSelection()
    }
  }

  const handleDblClick = () => {
    if (currentTool === 'line') drawing.onDoubleClick()
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
        </Stage>

      </div>

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
            fontSize: Math.max(11, 10 * transform.scale),
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
        <span className="ml-auto text-gray-700 hidden lg:block">
          Space+drag · middle-click to pan · scroll to zoom · Del to delete
        </span>
      </div>
    </div>
  )
}
