import { useRef, useEffect, useMemo } from 'react'
import { Layer, Transformer } from 'react-konva'
import Konva from 'konva'
import ShapeNode from './ShapeNode'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'
import type { Shape } from '@/types'

interface Props {
  previewShape: Shape | null
}

export default function DrawingLayer({ previewShape }: Props) {
  const layerRef = useRef<Konva.Layer>(null)
  const trRef    = useRef<Konva.Transformer>(null)
  const { shapes, selectedIds, setSelectedId, addToSelection, layers } = useDocumentStore()
  const { nodeEditShapeId } = useUIStore()

  // Build O(1) lookup sets for hidden and locked layer IDs
  const hiddenIds = useMemo(
    () => new Set(layers.filter((l) => !l.visible).map((l) => l.id)),
    [layers],
  )
  const lockedIds = useMemo(
    () => new Set(layers.filter((l) => l.locked).map((l) => l.id)),
    [layers],
  )

  /** Shapes on hidden layers are not rendered at all. */
  const visibleShapes = useMemo(
    () => shapes.filter((s) => !hiddenIds.has(s.layerId ?? 'default')),
    [shapes, hiddenIds],
  )

  // Attach transformer to selected non-line nodes; hide it while node-editing
  useEffect(() => {
    if (!trRef.current || !layerRef.current) return
    const nodes = nodeEditShapeId
      ? []
      : selectedIds
          .filter((id) => {
            const shape = shapes.find((s) => s.id === id)
            // Exclude lines (no transformer handles) and shapes on locked layers
            return shape?.type !== 'line' && !lockedIds.has(shape?.layerId ?? 'default')
          })
          .map((id) => layerRef.current!.findOne<Konva.Node>('#' + id))
          .filter((n): n is Konva.Node => n != null)
    trRef.current.nodes(nodes)
  }, [selectedIds, shapes, nodeEditShapeId, lockedIds])

  return (
    <Layer ref={layerRef}>
      {visibleShapes.map((shape) => (
        <ShapeNode
          key={shape.id}
          shape={shape}
          isSelected={selectedIds.includes(shape.id)}
          isLocked={lockedIds.has(shape.layerId ?? 'default')}
          onSelect={(addMode) =>
            addMode ? addToSelection(shape.id) : setSelectedId(shape.id)
          }
        />
      ))}

      {previewShape && (
        <ShapeNode
          key="__preview__"
          shape={previewShape}
          isSelected={false}
          isLocked={false}
          onSelect={() => {}}
          isPreview
        />
      )}

      <Transformer
        ref={trRef}
        keepRatio={false}
        rotateEnabled
        anchorSize={7}
        borderStroke="#60a5fa"
        anchorStroke="#60a5fa"
        anchorFill="#1e3a5f"
        boundBoxFunc={(oldBox, newBox) =>
          newBox.width < 2 || newBox.height < 2 ? oldBox : newBox
        }
      />
    </Layer>
  )
}
