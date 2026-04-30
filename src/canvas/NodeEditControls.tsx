import { useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useDocumentStore } from '@/stores'
import {
  deleteNode, breakPath, openClosePath, reversePath, convertSegment,
} from '@/toolpath/pathUtils'
import type { PathShape } from '@/types'

interface Props {
  selectedNodeIdx: number | null
  hoveredSegmentIdx: number | null
  onClearSelection: () => void
}

/** Keyboard handler component for node editing operations.
 *  Listens for Delete/Backspace (delete node), B (break path), O (open/close),
 *  R (reverse), C (convert segment). Returns null — renders no DOM/canvas output.
 */
export default function NodeEditControls({ selectedNodeIdx, hoveredSegmentIdx, onClearSelection }: Props) {
  const { nodeEditShapeId } = useUIStore()
  const { shapes, updateShape, replaceShapesWithOne, addShape } = useDocumentStore()

  useEffect(() => {
    if (!nodeEditShapeId) return

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const shape = shapes.find(s => s.id === nodeEditShapeId)
      if (!shape || shape.type !== 'path') return
      const s = shape as PathShape

      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNodeIdx !== null) {
        e.stopPropagation()
        const newData = deleteNode(s.data, selectedNodeIdx)
        updateShape(s.id, { data: newData })
        onClearSelection()
        return
      }

      if (e.code === 'KeyB' && selectedNodeIdx !== null) {
        e.preventDefault()
        const [p1, p2] = breakPath(s.data, selectedNodeIdx)
        if (!p2) return
        const base = { style: s.style, layerId: s.layerId }
        replaceShapesWithOne([s.id], {
          ...base, id: crypto.randomUUID(), type: 'path', data: p1,
        } as PathShape)
        addShape({ ...base, id: crypto.randomUUID(), type: 'path', data: p2 } as PathShape)
        onClearSelection()
        return
      }

      if (e.code === 'KeyO') {
        e.preventDefault()
        updateShape(s.id, { data: openClosePath(s.data) })
        return
      }

      if (e.code === 'KeyR') {
        e.preventDefault()
        updateShape(s.id, { data: reversePath(s.data) })
        return
      }

      if (e.code === 'KeyC' && hoveredSegmentIdx !== null) {
        e.preventDefault()
        updateShape(s.id, { data: convertSegment(s.data, hoveredSegmentIdx) })
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nodeEditShapeId, shapes, selectedNodeIdx, hoveredSegmentIdx, updateShape, replaceShapesWithOne, addShape, onClearSelection])

  return null
}
