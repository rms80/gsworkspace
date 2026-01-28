import { useEffect, RefObject } from 'react'
import Konva from 'konva'
import { CanvasItem } from '../types'

interface TransformerConfig {
  type: CanvasItem['type']
  ref: RefObject<Konva.Transformer | null>
  excludeId?: string | null
}

interface UseTransformerSyncParams {
  items: CanvasItem[]
  selectedIds: string[]
  stageRef: RefObject<Konva.Stage | null>
  transformers: TransformerConfig[]
}

export function useTransformerSync({
  items,
  selectedIds,
  stageRef,
  transformers,
}: UseTransformerSyncParams): void {
  useEffect(() => {
    if (!stageRef.current) return

    for (const { type, ref, excludeId } of transformers) {
      const nodes = items
        .filter((item) =>
          selectedIds.includes(item.id) &&
          item.type === type &&
          (excludeId == null || item.id !== excludeId)
        )
        .map((item) => stageRef.current?.findOne(`#${item.id}`))
        .filter(Boolean) as Konva.Node[]

      ref.current?.nodes(nodes)
    }
  }, [items, selectedIds, ...transformers.map((t) => t.excludeId)])
}
