import { useState, useCallback, useRef, useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useDocumentStore } from '@/stores'
import type { PathShape } from '@/types'

export interface Point { x: number; y: number }

type Anchor = {
  x: number
  y: number
  handleFwd: Point | null  // forward handle in canvas space; null = corner node
}

const CLOSE_THRESHOLD = 6   // px in canvas space
const DRAG_THRESHOLD  = 4   // px before a press is considered a drag
const DEFAULT_STYLE   = { stroke: '#e2e8f0', fill: 'transparent', strokeWidth: 0.5 }

/** Euclidean distance between two points */
function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }

/**
 * Converts an array of Anchor objects into an SVG path data string.
 * Produces L (line) commands when both control points collapse to endpoints,
 * otherwise produces C (cubic bezier) commands.
 */
function buildPathData(anchors: Anchor[]): string {
  if (anchors.length === 0) return ''
  const parts: string[] = [`M${anchors[0].x},${anchors[0].y}`]
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1]
    const curr = anchors[i]
    const cp1  = prev.handleFwd ?? { x: prev.x, y: prev.y }
    // backward handle of curr = mirror of curr.handleFwd around curr
    const cp2  = curr.handleFwd
      ? { x: 2 * curr.x - curr.handleFwd.x, y: 2 * curr.y - curr.handleFwd.y }
      : { x: curr.x, y: curr.y }
    const isLine = cp1.x === prev.x && cp1.y === prev.y && cp2.x === curr.x && cp2.y === curr.y
    if (isLine) {
      parts.push(`L${curr.x},${curr.y}`)
    } else {
      parts.push(`C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${curr.x},${curr.y}`)
    }
  }
  return parts.join(' ')
}

/**
 * usePenTool — Illustrator-style pen tool hook.
 *
 * Manages anchor placement, drag-to-create bezier handles, path preview,
 * path closing (clicking near first anchor), and committing the final shape
 * to the document store on double-click or close.
 *
 * Returns event handlers to be wired up to the Konva stage and a
 * `previewShape` PathShape (or null) to be rendered as a live preview.
 */
export function usePenTool() {
  const { currentTool } = useUIStore()
  const { addShape, setSelectedId } = useDocumentStore()

  const [previewShape, setPreviewShape] = useState<PathShape | null>(null)

  /** Accumulated anchor list for the path being drawn */
  const anchors  = useRef<Anchor[]>([])
  /** True while pointer button is held down */
  const pressing = useRef(false)
  /** Canvas position where the pointer was pressed */
  const pressPt  = useRef<Point>({ x: 0, y: 0 })
  /** True once the pointer has moved past DRAG_THRESHOLD during a press */
  const dragging = useRef(false)

  /**
   * Rebuilds and sets the live preview shape from the committed anchors
   * plus one transient "cursor" segment toward `pt`.
   *
   * @param pt          Current cursor position
   * @param closePending Whether the next click would close the path
   * @param liveHandle  Active drag handle being shaped (for bezier preview)
   */
  const buildPreview = useCallback((pt: Point, closePending: boolean, liveHandle: Point | null) => {
    const all = [...anchors.current]
    if (all.length === 0) return

    // Append a transient "cursor" anchor for the preview segment
    const last = all[all.length - 1]
    const cp1  = last.handleFwd ?? { x: last.x, y: last.y }
    const isLine = cp1.x === last.x && cp1.y === last.y

    let seg: string
    if (closePending) {
      const first = all[0]
      seg = isLine ? `L${first.x},${first.y}` : `C${cp1.x},${cp1.y} ${first.x},${first.y} ${first.x},${first.y}`
    } else if (liveHandle) {
      // Show bezier being shaped during drag
      const bwd = { x: 2 * pt.x - liveHandle.x, y: 2 * pt.y - liveHandle.y }
      seg = `C${cp1.x},${cp1.y} ${bwd.x},${bwd.y} ${pt.x},${pt.y}`
    } else {
      seg = isLine ? `L${pt.x},${pt.y}` : `C${cp1.x},${cp1.y} ${pt.x},${pt.y} ${pt.x},${pt.y}`
    }

    const data = buildPathData(all) + ' ' + seg
    setPreviewShape({ id: '__preview__', type: 'path', data, style: DEFAULT_STYLE } as PathShape)
  }, [])

  /**
   * Resets all pen-tool state without committing a shape.
   * Called on cancel, tool switch, or when commit() has too few anchors.
   */
  const cancel = useCallback(() => {
    anchors.current = []
    pressing.current = false
    dragging.current = false
    setPreviewShape(null)
  }, [])

  /**
   * Finalises the current path and writes a PathShape to the document store.
   * If fewer than 2 anchors exist, cancels instead (nothing to commit).
   *
   * @param close Whether to append a Z command to close the path
   */
  const commit = useCallback((close: boolean) => {
    const all = anchors.current
    if (all.length < 2) {
      // Not enough anchors — reset without committing
      anchors.current = []
      pressing.current = false
      dragging.current = false
      setPreviewShape(null)
      return
    }
    const data = buildPathData(all) + (close ? ' Z' : '')
    const nodeTypes = all.map(a => a.handleFwd ? 'smooth' : 'corner') as ('smooth'|'corner')[]
    const shape: PathShape = {
      id: crypto.randomUUID(), type: 'path', data, nodeTypes, style: DEFAULT_STYLE,
    }
    addShape(shape)
    setSelectedId(shape.id)
    anchors.current = []
    pressing.current = false
    dragging.current = false
    setPreviewShape(null)
  }, [addShape, setSelectedId])

  /** Cancel the pen tool when switching away from it */
  useEffect(() => { if (currentTool !== 'pen') cancel() }, [currentTool, cancel])

  /**
   * Handle pointer-down: place a new anchor or close the path if near
   * the first anchor (requires >= 2 existing anchors).
   */
  const onPointerDown = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    pressing.current = true
    pressPt.current  = pt
    dragging.current = false

    if (anchors.current.length === 0) {
      anchors.current = [{ x: pt.x, y: pt.y, handleFwd: null }]
    } else {
      // Close path if near first anchor
      const first = anchors.current[0]
      if (anchors.current.length >= 2 && dist(pt, first) < CLOSE_THRESHOLD) {
        commit(true)
        return
      }
      anchors.current = [...anchors.current, { x: pt.x, y: pt.y, handleFwd: null }]
    }
  }, [currentTool, commit])

  /**
   * Handle pointer-move: update the live preview segment.
   * If the pointer is held and moved past DRAG_THRESHOLD, starts a drag
   * that shapes the forward bezier handle on the current anchor.
   */
  const onPointerMove = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    if (pressing.current && dist(pt, pressPt.current) > DRAG_THRESHOLD) {
      dragging.current = true
      // Update the last anchor's handleFwd with the dragged position
      const all = [...anchors.current]
      if (all.length > 0) {
        all[all.length - 1] = { ...all[all.length - 1], handleFwd: pt }
        anchors.current = all
        buildPreview(pt, false, pt)
        return
      }
    }
    if (anchors.current.length > 0) {
      buildPreview(pt, false, null)
    }
  }, [currentTool, buildPreview])

  /**
   * Handle pointer-up: finalise any drag and refresh the preview.
   */
  const onPointerUp = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    if (dragging.current) {
      // handleFwd was already set in onPointerMove; finalise
      dragging.current = false
    }
    pressing.current = false
    buildPreview(pt, false, null)
  }, [currentTool, buildPreview])

  /**
   * Handle double-click: commit the path as an open shape (no Z).
   */
  const onDoubleClick = useCallback(() => {
    if (currentTool !== 'pen') return
    commit(false)
  }, [currentTool, commit])

  return { previewShape, onPointerDown, onPointerMove, onPointerUp, onDoubleClick, cancel }
}
