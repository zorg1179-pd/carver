import { useRef, useEffect } from 'react'
import { Layer, Transformer } from 'react-konva'
import Konva from 'konva'
import ShapeNode from './ShapeNode'
import { useDocumentStore } from '@/stores'
import type { Shape } from '@/types'

interface Props {
  previewShape: Shape | null
}

export default function DrawingLayer({ previewShape }: Props) {
  const layerRef = useRef<Konva.Layer>(null)
  const trRef    = useRef<Konva.Transformer>(null)
  const { shapes, selectedIds, setSelectedId, addToSelection } = useDocumentStore()

  // Attach transformer to all selected non-line nodes after each render
  useEffect(() => {
    if (!trRef.current || !layerRef.current) return
    const nodes = selectedIds
      .filter(id => shapes.find(s => s.id === id)?.type !== 'line')
      .map(id => layerRef.current!.findOne<Konva.Node>('#' + id))
      .filter((n): n is Konva.Node => n != null)
    trRef.current.nodes(nodes)
  }, [selectedIds, shapes])

  return (
    <Layer ref={layerRef}>
      {shapes.map((shape) => (
        <ShapeNode
          key={shape.id}
          shape={shape}
          isSelected={selectedIds.includes(shape.id)}
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
