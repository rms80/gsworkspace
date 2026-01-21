import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, SelectionRect } from '../types'

interface InfiniteCanvasProps {
  items: CanvasItem[]
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onSelectItems: (ids: string[]) => void
  onAddTextAt: (x: number, y: number, text: string) => void
  onAddImageAt: (x: number, y: number, src: string, width: number, height: number) => void
  onDeleteSelected: () => void
}

function InfiniteCanvas({ items, onUpdateItem, onSelectItems, onAddTextAt, onAddImageAt, onDeleteSelected }: InfiniteCanvasProps) {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectionStartRef = useRef({ x: 0, y: 0 })
  const stageRef = useRef<Konva.Stage>(null)
  const textTransformerRef = useRef<Konva.Transformer>(null)
  const imageTransformerRef = useRef<Konva.Transformer>(null)
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)

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

  // Update transformers when selection changes
  useEffect(() => {
    if (!stageRef.current) return

    const selectedTextNodes = items
      .filter((item) => item.selected && item.type === 'text')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedImageNodes = items
      .filter((item) => item.selected && item.type === 'image')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    textTransformerRef.current?.nodes(selectedTextNodes)
    imageTransformerRef.current?.nodes(selectedImageNodes)
  }, [items])

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - stagePos.x) / stageScale,
      y: (screenY - stagePos.y) / stageScale,
    }
  }

  // Scale image dimensions to fit within 20% of viewport
  const scaleImageToViewport = (imgWidth: number, imgHeight: number) => {
    const maxWidth = stageSize.width * 0.2
    const maxHeight = stageSize.height * 0.2

    const widthRatio = maxWidth / imgWidth
    const heightRatio = maxHeight / imgHeight
    const scale = Math.min(widthRatio, heightRatio, 1) // Don't scale up, only down

    return {
      width: Math.round(imgWidth * scale),
      height: Math.round(imgHeight * scale),
    }
  }

  // Handle paste from clipboard
  const handlePaste = async (e: ClipboardEvent, pasteX?: number, pasteY?: number) => {
    // Don't paste if we're editing text
    if (editingTextId) return

    const clipboardItems = e.clipboardData?.items
    if (!clipboardItems) return

    // Determine paste position
    const x = pasteX ?? mousePos.x
    const y = pasteY ?? mousePos.y
    const canvasPos = screenToCanvas(x, y)

    // Check for images first
    for (const item of clipboardItems) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue

        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          const img = new window.Image()
          img.onload = () => {
            const scaled = scaleImageToViewport(img.width, img.height)
            onAddImageAt(canvasPos.x, canvasPos.y, dataUrl, scaled.width, scaled.height)
          }
          img.src = dataUrl
        }
        reader.readAsDataURL(blob)
        return
      }
    }

    // Check for text
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      onAddTextAt(canvasPos.x, canvasPos.y, text)
    }
  }

  // Global paste event listener
  useEffect(() => {
    const listener = (e: ClipboardEvent) => handlePaste(e)
    document.addEventListener('paste', listener)
    return () => document.removeEventListener('paste', listener)
  }, [editingTextId, mousePos, stagePos, stageScale, onAddTextAt, onAddImageAt])

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Handle Delete/Backspace keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete if editing text
      if (editingTextId) return
      // Don't delete if focus is in an input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDeleteSelected()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editingTextId, onDeleteSelected])

  // Handle drag and drop from file system
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    const files = e.dataTransfer.files
    if (!files.length) return

    // Get drop position in canvas coordinates
    const rect = e.currentTarget.getBoundingClientRect()
    const dropX = e.clientX - rect.left
    const dropY = e.clientY - rect.top
    const canvasPos = screenToCanvas(dropX, dropY)

    // Process each dropped file
    Array.from(files).forEach((file, index) => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        const img = new window.Image()
        img.onload = () => {
          const scaled = scaleImageToViewport(img.width, img.height)
          // Offset multiple images so they don't stack exactly
          onAddImageAt(canvasPos.x + index * 20, canvasPos.y + index * 20, dataUrl, scaled.width, scaled.height)
        }
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    })
  }

  // Handle right-click context menu
  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const canvasPos = screenToCanvas(pointer.x, pointer.y)
    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      canvasX: canvasPos.x,
      canvasY: canvasPos.y,
    })
  }

  // Handle paste from context menu
  const handleContextMenuPaste = async () => {
    if (!contextMenu) return

    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        // Check for images
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const reader = new FileReader()
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            const img = new window.Image()
            img.onload = () => {
              const scaled = scaleImageToViewport(img.width, img.height)
              onAddImageAt(contextMenu.canvasX, contextMenu.canvasY, dataUrl, scaled.width, scaled.height)
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(blob)
          setContextMenu(null)
          return
        }

        // Check for text
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const text = await blob.text()
          onAddTextAt(contextMenu.canvasX, contextMenu.canvasY, text)
          setContextMenu(null)
          return
        }
      }
    } catch {
      // Fallback for browsers that don't support clipboard.read()
      const text = await navigator.clipboard.readText()
      if (text) {
        onAddTextAt(contextMenu.canvasX, contextMenu.canvasY, text)
      }
    }
    setContextMenu(null)
  }

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

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

  // Selection rectangle (Ctrl + drag)
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return

    // Only start marquee selection if Ctrl is held
    if (!e.evt.ctrlKey && !e.evt.metaKey) {
      // Clicking on empty canvas without Ctrl clears selection
      onSelectItems([])
      return
    }

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

    // Find items within selection rectangle
    const selectedIds = items
      .filter((item) => {
        const itemRight = item.x + item.width
        const itemBottom = item.y + (item.type === 'text' ? item.height : item.height)
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

  const handleTextDblClick = (id: string) => {
    setEditingTextId(id)
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }, 0)
  }

  const handleTextareaBlur = () => {
    if (editingTextId && textareaRef.current) {
      onUpdateItem(editingTextId, { text: textareaRef.current.value })
    }
    setEditingTextId(null)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingTextId(null)
    }
  }

  const getEditingTextItem = () => {
    if (!editingTextId) return null
    const item = items.find((i) => i.id === editingTextId)
    if (!item || item.type !== 'text') return null
    return item
  }

  const editingItem = getEditingTextItem()

  return (
    <div style={{ position: 'relative' }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable
        onDragStart={(e) => {
          // Prevent dragging when Ctrl is held (for marquee selection)
          if (e.evt.ctrlKey || e.evt.metaKey) {
            e.target.stopDrag()
          }
        }}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x(), y: e.target.y() })
          }
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
      <Layer>
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
                onDblClick={() => handleTextDblClick(item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                fill={item.selected ? '#0066cc' : '#000'}
                visible={editingTextId !== item.id}
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

        {/* Transformer for text - uniform scaling only, no rotation */}
        <Transformer
          ref={textTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            // Prevent negative or too small dimensions
            if (newBox.width < 20 || newBox.height < 20) {
              return oldBox
            }
            return newBox
          }}
        />
        {/* Transformer for images - full controls */}
        <Transformer ref={imageTransformerRef} />
      </Layer>
    </Stage>

      {/* Textarea overlay for editing text */}
      {editingItem && (
        <textarea
          ref={textareaRef}
          defaultValue={editingItem.text}
          onBlur={handleTextareaBlur}
          onKeyDown={handleTextareaKeyDown}
          style={{
            position: 'absolute',
            top: editingItem.y * stageScale + stagePos.y,
            left: editingItem.x * stageScale + stagePos.x,
            width: editingItem.width * stageScale,
            height: editingItem.height * stageScale,
            fontSize: editingItem.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: 0,
            margin: 0,
            border: '2px solid #0066cc',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: 'white',
            transformOrigin: 'top left',
          }}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 120,
          }}
        >
          <button
            onClick={handleContextMenuPaste}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Paste
          </button>
        </div>
      )}
    </div>
  )
}

export default InfiniteCanvas
