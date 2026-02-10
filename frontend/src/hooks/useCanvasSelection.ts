import { useState, useRef } from 'react'
import Konva from 'konva'
import { CanvasItem, SelectionRect } from '../types'

interface UseCanvasSelectionParams {
  items: CanvasItem[]
  selectedIds: string[]
  stagePos: { x: number; y: number }
  stageScale: number
  stageRef: React.RefObject<Konva.Stage | null>
  onSelectItems: (ids: string[]) => void
  croppingImageId: string | null
  applyCrop: () => void
  croppingVideoId: string | null
  applyOrCancelVideoCrop: () => void
}

export interface CanvasSelection {
  selectionRect: SelectionRect | null
  isSelecting: boolean
  handleStageClick: (e: Konva.KonvaEventObject<MouseEvent>) => void
  handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void
  handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void
  handleMouseUp: () => void
  handleItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
}

export function useCanvasSelection({
  items,
  selectedIds,
  stagePos,
  stageScale,
  stageRef,
  onSelectItems,
  croppingImageId,
  applyCrop,
  croppingVideoId,
  applyOrCancelVideoCrop,
}: UseCanvasSelectionParams): CanvasSelection {
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectionStartRef = useRef({ x: 0, y: 0 })
  const marqueeModifierRef = useRef<'shift' | 'ctrl' | null>(null)
  const marqueeBaseSelectionRef = useRef<string[]>([])

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If in image crop mode and clicking on empty canvas, apply crop
    if (croppingImageId) {
      if (e.target === stageRef.current) {
        applyCrop()
      }
      return
    }
    // If in video crop mode and clicking on empty canvas, apply or cancel crop
    if (croppingVideoId) {
      if (e.target === stageRef.current) {
        applyOrCancelVideoCrop()
      }
      return
    }
    if (e.target !== stageRef.current) return
    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) return
    onSelectItems([])
  }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    if (e.target !== stageRef.current) return

    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const pos = {
      x: (pointer.x - stagePos.x) / stageScale,
      y: (pointer.y - stagePos.y) / stageScale,
    }

    selectionStartRef.current = pos
    marqueeModifierRef.current = e.evt.shiftKey ? 'shift' : (e.evt.ctrlKey || e.evt.metaKey) ? 'ctrl' : null
    marqueeBaseSelectionRef.current = [...selectedIds]
    setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 })
    setIsSelecting(true)
  }

  const handleMouseMove = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isSelecting) return

    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const pos = {
      x: (pointer.x - stagePos.x) / stageScale,
      y: (pointer.y - stagePos.y) / stageScale,
    }

    setSelectionRect({
      x: Math.min(selectionStartRef.current.x, pos.x),
      y: Math.min(selectionStartRef.current.y, pos.y),
      width: Math.abs(pos.x - selectionStartRef.current.x),
      height: Math.abs(pos.y - selectionStartRef.current.y),
    })
  }

  const handleMouseUp = () => {
    if (!isSelecting || !selectionRect) {
      setIsSelecting(false)
      setSelectionRect(null)
      return
    }

    const foundIds = items
      .filter((item) => {
        const itemRight = item.x + item.width
        const itemBottom = item.y + item.height
        return (
          item.x < selectionRect.x + selectionRect.width &&
          itemRight > selectionRect.x &&
          item.y < selectionRect.y + selectionRect.height &&
          itemBottom > selectionRect.y
        )
      })
      .map((item) => item.id)

    const base = marqueeBaseSelectionRef.current
    if (marqueeModifierRef.current === 'shift') {
      // Add marqueed items to existing selection
      onSelectItems([...new Set([...base, ...foundIds])])
    } else if (marqueeModifierRef.current === 'ctrl') {
      // Subtract marqueed items from existing selection
      const removeSet = new Set(foundIds)
      onSelectItems(base.filter((id) => !removeSet.has(id)))
    } else {
      onSelectItems(foundIds)
    }
    setIsSelecting(false)
    setSelectionRect(null)
  }

  const handleItemClick = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true
    const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey
    const isSelected = selectedIds.includes(id)

    if (metaPressed && isSelected) {
      onSelectItems(selectedIds.filter((selectedId) => selectedId !== id))
    } else if (metaPressed) {
      onSelectItems([...selectedIds, id])
    } else {
      onSelectItems([id])
    }
  }

  return {
    selectionRect,
    isSelecting,
    handleStageClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemClick,
  }
}
