import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, SelectionRect } from '../types'

interface InfiniteCanvasProps {
  items: CanvasItem[]
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onSelectItems: (ids: string[]) => void
}

function InfiniteCanvas({ items, onUpdateItem, onSelectItems }: InfiniteCanvasProps) {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectionStartRef = useRef({ x: 0, y: 0 })
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setStageSize({ width: window.innerWidth, height: window.innerHeight - 50 })
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Load images
  useEffect(() => {
    items.forEach((item) => {
      if (item.type === 'image' && !loadedImages.has(item.src)) {
        const img = new window.Image()
        img.src = item.src
        img.onload = () => {
          setLoadedImages((prev) => new Map(prev).set(item.src, img))
        }
      }
    })
  }, [items, loadedImages])

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return
    const selectedNodes = items
      .filter((item) => item.selected)
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]
    transformerRef.current.nodes(selectedNodes)
  }, [items])

  // Wheel zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const oldScale = stageScale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    }

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1
    const clampedScale = Math.max(0.1, Math.min(5, newScale))

    setStageScale(clampedScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    })
  }

  // Selection rectangle
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
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
    setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 })
    setIsSelecting(true)
    onSelectItems([])
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
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

    // Find items within selection rectangle
    const selectedIds = items
      .filter((item) => {
        const itemRight = item.x + (item.type === 'text' ? item.width : item.width)
        const itemBottom = item.y + (item.type === 'text' ? item.fontSize * 2 : item.height)
        return (
          item.x < selectionRect.x + selectionRect.width &&
          itemRight > selectionRect.x &&
          item.y < selectionRect.y + selectionRect.height &&
          itemBottom > selectionRect.y
        )
      })
      .map((item) => item.id)

    onSelectItems(selectedIds)
    setIsSelecting(false)
    setSelectionRect(null)
  }

  const handleItemClick = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true
    const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey
    const item = items.find((i) => i.id === id)

    if (metaPressed && item?.selected) {
      onSelectItems(items.filter((i) => i.selected && i.id !== id).map((i) => i.id))
    } else if (metaPressed) {
      onSelectItems([...items.filter((i) => i.selected).map((i) => i.id), id])
    } else {
      onSelectItems([id])
    }
  }

  return (
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      x={stagePos.x}
      y={stagePos.y}
      scaleX={stageScale}
      scaleY={stageScale}
      draggable
      onDragEnd={(e) => {
        if (e.target === stageRef.current) {
          setStagePos({ x: e.target.x(), y: e.target.y() })
        }
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {/* Grid background (optional visual aid) */}
        {Array.from({ length: 50 }, (_, i) => (
          <Rect
            key={`grid-${i}`}
            x={(i % 10) * 200 - 1000}
            y={Math.floor(i / 10) * 200 - 1000}
            width={200}
            height={200}
            stroke="#eee"
            strokeWidth={1}
          />
        ))}

        {/* Canvas items */}
        {items.map((item) => {
          if (item.type === 'text') {
            return (
              <Text
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                text={item.text}
                fontSize={item.fontSize}
                width={item.width}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                fill={item.selected ? '#0066cc' : '#000'}
              />
            )
          } else if (item.type === 'image') {
            const img = loadedImages.get(item.src)
            if (!img) return null
            return (
              <KonvaImage
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                image={img}
                width={item.width}
                height={item.height}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                stroke={item.selected ? '#0066cc' : undefined}
                strokeWidth={item.selected ? 2 : 0}
              />
            )
          }
          return null
        })}

        {/* Selection rectangle */}
        {selectionRect && (
          <Rect
            x={selectionRect.x}
            y={selectionRect.y}
            width={selectionRect.width}
            height={selectionRect.height}
            fill="rgba(0, 102, 204, 0.1)"
            stroke="#0066cc"
            strokeWidth={1}
          />
        )}

        {/* Transformer for resizing */}
        <Transformer ref={transformerRef} />
      </Layer>
    </Stage>
  )
}

export default InfiniteCanvas
