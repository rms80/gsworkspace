import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, LLMModel, ImageGenModel, ImageItem, PromptItem, ImageGenPromptItem, HTMLGenPromptItem } from '../types'
import ImageCropOverlay from './ImageCropOverlay'
import { config } from '../config'
import { uploadImage } from '../api/images'
import { exportHtmlWithImages, exportMarkdownWithImages, exportHtmlZip, exportMarkdownZip } from '../utils/htmlExport'
import { useCanvasViewport } from '../hooks/useCanvasViewport'
import { useClipboard } from '../hooks/useClipboard'
import { useCanvasSelection } from '../hooks/useCanvasSelection'
import { useCropMode } from '../hooks/useCropMode'
import { usePromptEditing } from '../hooks/usePromptEditing'

interface InfiniteCanvasProps {
  items: CanvasItem[]
  selectedIds: string[]
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onSelectItems: (ids: string[]) => void
  onAddTextAt: (x: number, y: number, text: string) => void
  onAddImageAt: (x: number, y: number, src: string, width: number, height: number) => void
  onDeleteSelected: () => void
  onRunPrompt: (promptId: string) => void
  runningPromptIds: Set<string>
  onRunImageGenPrompt: (promptId: string) => void
  runningImageGenPromptIds: Set<string>
  onRunHtmlGenPrompt: (promptId: string) => void
  runningHtmlGenPromptIds: Set<string>
}

function InfiniteCanvas({ items, selectedIds, onUpdateItem, onSelectItems, onAddTextAt, onAddImageAt, onDeleteSelected, onRunPrompt, runningPromptIds, onRunImageGenPrompt, runningImageGenPromptIds, onRunHtmlGenPrompt, runningHtmlGenPromptIds }: InfiniteCanvasProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const textTransformerRef = useRef<Konva.Transformer>(null)
  const imageTransformerRef = useRef<Konva.Transformer>(null)
  const promptTransformerRef = useRef<Konva.Transformer>(null)
  const imageGenPromptTransformerRef = useRef<Konva.Transformer>(null)
  const htmlGenPromptTransformerRef = useRef<Konva.Transformer>(null)
  const htmlTransformerRef = useRef<Konva.Transformer>(null)

  // 1. Viewport hook
  const {
    stageSize,
    stagePos,
    stageScale,
    isViewportTransforming,
    isMiddleMousePanning: _isMiddleMousePanning,
    isAnyDragActive,
    setStagePos,
    setStageScale: _setStageScale,
    setIsAnyDragActive,
    setIsViewportTransforming,
    handleWheel,
    screenToCanvas,
    scaleImageToViewport,
  } = useCanvasViewport(containerRef, stageRef)

  // 2. loadedImages state
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())

  // 3. Crop mode hook
  const {
    croppingImageId,
    pendingCropRect,
    setCroppingImageId,
    setPendingCropRect,
    applyCrop,
    cancelCrop: _cancelCrop,
  } = useCropMode({ items, loadedImages, onUpdateItem })

  // 4. Prompt editing hooks (x3)
  const promptEditing = usePromptEditing({ items, onUpdateItem }, 'prompt')
  const imageGenPromptEditing = usePromptEditing({ items, onUpdateItem }, 'image-gen-prompt')
  const htmlGenPromptEditing = usePromptEditing({ items, onUpdateItem }, 'html-gen-prompt')

  // 5. Text editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 6. Derive isEditing
  const isEditing = !!(editingTextId || promptEditing.editingId || imageGenPromptEditing.editingId || htmlGenPromptEditing.editingId)

  // 7. Canvas selection hook
  const {
    selectionRect,
    isSelecting: _isSelecting,
    handleStageClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemClick,
  } = useCanvasSelection({
    items,
    selectedIds,
    stagePos,
    stageScale,
    stageRef,
    onSelectItems,
    croppingImageId,
    applyCrop,
  })

  // 8. Clipboard hook
  const clipboard = useClipboard({
    items,
    selectedIds,
    isEditing,
    croppingImageId,
    screenToCanvas,
    scaleImageToViewport,
    onAddTextAt,
    onAddImageAt,
    onUpdateItem,
    onDeleteSelected,
  })

  // 9. Remaining UI state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)
  const [modelMenuPromptId, setModelMenuPromptId] = useState<string | null>(null)
  const [modelMenuPosition, setModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [imageGenModelMenuPromptId, setImageGenModelMenuPromptId] = useState<string | null>(null)
  const [imageGenModelMenuPosition, setImageGenModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [htmlGenModelMenuPromptId, setHtmlGenModelMenuPromptId] = useState<string | null>(null)
  const [htmlGenModelMenuPosition, setHtmlGenModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{ imageId: string; x: number; y: number } | null>(null)
  const [htmlItemTransforms, setHtmlItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [exportMenuItemId, setExportMenuItemId] = useState<string | null>(null)
  const [exportMenuPosition, setExportMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editingHtmlLabelId, setEditingHtmlLabelId] = useState<string | null>(null)
  const htmlLabelInputRef = useRef<HTMLInputElement>(null)
  const [pulsePhase, setPulsePhase] = useState(0)

  // Pulse animation for running prompts
  useEffect(() => {
    if (runningPromptIds.size === 0 && runningImageGenPromptIds.size === 0 && runningHtmlGenPromptIds.size === 0) {
      setPulsePhase(0)
      return
    }

    let animationId: number
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000
      lastTime = currentTime
      setPulsePhase((prev) => (prev + delta * 3) % (Math.PI * 2)) // ~2 second full cycle
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationId)
  }, [runningPromptIds.size, runningImageGenPromptIds.size, runningHtmlGenPromptIds.size])

  // Force Konva layer redraw when pulse phase changes
  useEffect(() => {
    if (runningPromptIds.size > 0 && layerRef.current) {
      layerRef.current.batchDraw()
    }
  }, [pulsePhase, runningPromptIds.size])

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
      .filter((item) => selectedIds.includes(item.id) && item.type === 'text')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedImageNodes = items
      .filter((item) => selectedIds.includes(item.id) && item.type === 'image' && item.id !== croppingImageId)
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedPromptNodes = items
      .filter((item) => selectedIds.includes(item.id) && item.type === 'prompt')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedImageGenPromptNodes = items
      .filter((item) => selectedIds.includes(item.id) && item.type === 'image-gen-prompt')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedHtmlGenPromptNodes = items
      .filter((item) => selectedIds.includes(item.id) && item.type === 'html-gen-prompt')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    const selectedHtmlNodes = items
      .filter((item) => selectedIds.includes(item.id) && item.type === 'html')
      .map((item) => stageRef.current?.findOne(`#${item.id}`))
      .filter(Boolean) as Konva.Node[]

    textTransformerRef.current?.nodes(selectedTextNodes)
    imageTransformerRef.current?.nodes(selectedImageNodes)
    promptTransformerRef.current?.nodes(selectedPromptNodes)
    imageGenPromptTransformerRef.current?.nodes(selectedImageGenPromptNodes)
    htmlGenPromptTransformerRef.current?.nodes(selectedHtmlGenPromptNodes)
    htmlTransformerRef.current?.nodes(selectedHtmlNodes)
  }, [items, selectedIds, croppingImageId])

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
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string
        const img = new window.Image()
        img.onload = async () => {
          const scaled = scaleImageToViewport(img.width, img.height)
          try {
            // Upload to S3 immediately to avoid storing large data URLs in memory
            const s3Url = await uploadImage(dataUrl, file.name || `dropped-${Date.now()}.png`)
            // Offset multiple images so they don't stack exactly
            onAddImageAt(canvasPos.x + index * 20, canvasPos.y + index * 20, s3Url, scaled.width, scaled.height)
          } catch (err) {
            console.error('Failed to upload image, using data URL:', err)
            // Fallback to data URL if upload fails
            onAddImageAt(canvasPos.x + index * 20, canvasPos.y + index * 20, dataUrl, scaled.width, scaled.height)
          }
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
    await clipboard.handleContextMenuPaste(contextMenu.canvasX, contextMenu.canvasY)
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

  // Close model menu on click elsewhere
  useEffect(() => {
    if (!modelMenuPromptId) return

    const handleClick = () => {
      setModelMenuPromptId(null)
      setModelMenuPosition(null)
    }

    // Delay adding listener to avoid catching the click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [modelMenuPromptId])

  // Close image gen model menu on click elsewhere
  useEffect(() => {
    if (!imageGenModelMenuPromptId) return

    const handleClick = () => {
      setImageGenModelMenuPromptId(null)
      setImageGenModelMenuPosition(null)
    }

    // Delay adding listener to avoid catching the click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [imageGenModelMenuPromptId])

  // Close HTML gen model menu on click elsewhere
  useEffect(() => {
    if (!htmlGenModelMenuPromptId) return

    const handleClick = () => {
      setHtmlGenModelMenuPromptId(null)
      setHtmlGenModelMenuPosition(null)
    }

    // Delay adding listener to avoid catching the click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [htmlGenModelMenuPromptId])

  // Close image context menu on click elsewhere
  useEffect(() => {
    if (!imageContextMenu) return

    const handleClick = () => {
      setImageContextMenu(null)
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [imageContextMenu])

  // Close export menu on click elsewhere
  useEffect(() => {
    if (!exportMenuItemId) return

    const handleClick = () => {
      setExportMenuItemId(null)
      setExportMenuPosition(null)
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClick)
    }
  }, [exportMenuItemId])

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

  // HTML item label editing handlers
  const handleHtmlLabelDblClick = (id: string) => {
    setEditingHtmlLabelId(id)
    setTimeout(() => {
      htmlLabelInputRef.current?.focus()
      htmlLabelInputRef.current?.select()
    }, 0)
  }

  const handleHtmlLabelBlur = () => {
    if (editingHtmlLabelId && htmlLabelInputRef.current) {
      onUpdateItem(editingHtmlLabelId, { label: htmlLabelInputRef.current.value })
    }
    setEditingHtmlLabelId(null)
  }

  const handleHtmlLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingHtmlLabelId(null)
    } else if (e.key === 'Enter') {
      handleHtmlLabelBlur()
    }
  }

  const getEditingHtmlItem = () => {
    if (!editingHtmlLabelId) return null
    const item = items.find((i) => i.id === editingHtmlLabelId)
    if (!item || item.type !== 'html') return null
    return item
  }
  const editingHtmlItem = getEditingHtmlItem()

  const getEditingTextItem = () => {
    if (!editingTextId) return null
    const item = items.find((i) => i.id === editingTextId)
    if (!item || item.type !== 'text') return null
    return item
  }

  const editingItem = getEditingTextItem()
  const editingPrompt = promptEditing.getEditingItem() as PromptItem | null
  const editingImageGenPrompt = imageGenPromptEditing.getEditingItem() as ImageGenPromptItem | null
  const editingHtmlGenPrompt = htmlGenPromptEditing.getEditingItem() as HTMLGenPromptItem | null

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable={!croppingImageId}
        onDragStart={(e) => {
          // Prevent dragging when Ctrl is held (for marquee selection)
          if (e.evt.ctrlKey || e.evt.metaKey) {
            e.target.stopDrag()
            return
          }
          // Disable iframe pointer events during any drag
          setIsAnyDragActive(true)
          // Hide HTML overlays while panning
          if (e.target === stageRef.current && config.features.hideHtmlDuringTransform) {
            setIsViewportTransforming(true)
          }
        }}
        onDragMove={(e) => {
          // Update stage position in real-time during panning for HTML iframe sync
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x(), y: e.target.y() })
          }
        }}
        onDragEnd={(e) => {
          // Re-enable iframe pointer events
          setIsAnyDragActive(false)
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x(), y: e.target.y() })
            if (config.features.hideHtmlDuringTransform) {
              setIsViewportTransforming(false)
            }
          }
        }}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
      <Layer ref={layerRef}>
        {/* Canvas items */}
        {items.map((item) => {
          if (item.type === 'text') {
            const padding = 8
            // Calculate text height dynamically based on content
            const measureText = () => {
              const textNode = new Konva.Text({
                text: item.text,
                fontSize: item.fontSize,
                width: item.width,
              })
              return textNode.height()
            }
            const textHeight = measureText()
            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onDblClick={() => handleTextDblClick(item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  // Reset scale and apply to width only (text reflows)
                  node.scaleX(1)
                  node.scaleY(1)
                  const newWidth = Math.max(50, item.width * scaleX)
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    width: newWidth,
                  })
                }}
                visible={editingTextId !== item.id}
              >
                <Rect
                  width={item.width + padding * 2}
                  height={textHeight + padding * 2}
                  stroke={selectedIds.includes(item.id) ? '#0066cc' : '#ccc'}
                  strokeWidth={1}
                  cornerRadius={4}
                />
                <Text
                  x={padding}
                  y={padding}
                  text={item.text}
                  fontSize={item.fontSize}
                  width={item.width}
                  fill={selectedIds.includes(item.id) ? '#0066cc' : '#000'}
                />
              </Group>
            )
          } else if (item.type === 'image') {
            const img = loadedImages.get(item.src)
            if (!img) return null
            const isCropping = croppingImageId === item.id
            if (isCropping && pendingCropRect) {
              return (
                <ImageCropOverlay
                  key={`crop-${item.id}`}
                  item={item}
                  image={img}
                  cropRect={pendingCropRect}
                  stageScale={stageScale}
                  onCropChange={setPendingCropRect}
                />
              )
            }
            return (
              <KonvaImage
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                image={img}
                width={item.width}
                height={item.height}
                crop={item.cropRect ? { x: item.cropRect.x, y: item.cropRect.y, width: item.cropRect.width, height: item.cropRect.height } : undefined}
                scaleX={item.scaleX ?? 1}
                scaleY={item.scaleY ?? 1}
                rotation={item.rotation ?? 0}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onContextMenu={(e) => {
                  e.evt.preventDefault()
                  e.cancelBubble = true
                  setImageContextMenu({
                    imageId: item.id,
                    x: e.evt.clientX,
                    y: e.evt.clientY,
                  })
                }}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                    rotation: node.rotation(),
                  })
                }}
                stroke={selectedIds.includes(item.id) ? '#0066cc' : undefined}
                strokeWidth={selectedIds.includes(item.id) ? 2 : 0}
              />
            )
          } else if (item.type === 'prompt') {
            const headerHeight = 28
            const isEditingThis = promptEditing.editingId === item.id
            const isRunning = runningPromptIds.has(item.id)
            const runButtonWidth = 40
            const modelButtonWidth = 20
            const buttonHeight = 20
            const buttonGap = 4

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark orange (210, 105, 30) and light orange (255, 200, 100)
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? `rgb(${Math.round(210 + 45 * pulseIntensity)}, ${Math.round(105 + 95 * pulseIntensity)}, ${Math.round(30 + 70 * pulseIntensity)})`
              : (isSelected ? '#0066cc' : '#c9a227')
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark orange (200, 90, 20) and light orange (255, 180, 80)
            const runButtonColor = isRunning
              ? `rgb(${Math.round(200 + 55 * pulseIntensity)}, ${Math.round(90 + 90 * pulseIntensity)}, ${Math.round(20 + 60 * pulseIntensity)})`
              : '#4a7c59'

            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                draggable={!isRunning}
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  node.scaleX(1)
                  node.scaleY(1)
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(100, item.width * scaleX),
                    height: Math.max(60, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill="#f8f4e8"
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={headerHeight}
                  fill="#e8d89c"
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - runButtonWidth - modelButtonWidth - buttonGap - 24}
                  height={headerHeight - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#5c4d1a"
                  onDblClick={() => promptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && promptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    setModelMenuPromptId(item.id)
                    setModelMenuPosition({
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  text="..."
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - runButtonWidth - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={runButtonWidth}
                    height={buttonHeight}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={runButtonWidth}
                    height={buttonHeight}
                    fontSize={12}
                    fontStyle="bold"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Content text */}
                <Text
                  text={item.text}
                  x={8}
                  y={headerHeight + 8}
                  width={item.width - 16}
                  height={item.height - headerHeight - 16}
                  fontSize={item.fontSize}
                  fill="#333"
                  onDblClick={() => promptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && promptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'image-gen-prompt') {
            const headerHeight = 28
            const isEditingThis = imageGenPromptEditing.editingId === item.id
            const isRunning = runningImageGenPromptIds.has(item.id)
            const runButtonWidth = 40
            const modelButtonWidth = 20
            const buttonHeight = 20
            const buttonGap = 4

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark purple (138, 43, 226) and light purple (200, 150, 255)
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? `rgb(${Math.round(138 + 62 * pulseIntensity)}, ${Math.round(43 + 107 * pulseIntensity)}, ${Math.round(226 + 29 * pulseIntensity)})`
              : (isSelected ? '#0066cc' : '#8b5cf6')
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark purple and light purple
            const runButtonColor = isRunning
              ? `rgb(${Math.round(138 + 62 * pulseIntensity)}, ${Math.round(43 + 107 * pulseIntensity)}, ${Math.round(200 + 55 * pulseIntensity)})`
              : '#7c3aed'

            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                draggable={!isRunning}
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  node.scaleX(1)
                  node.scaleY(1)
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(100, item.width * scaleX),
                    height: Math.max(60, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill="#f5f3ff"
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={headerHeight}
                  fill="#ddd6fe"
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - runButtonWidth - modelButtonWidth - buttonGap - 24}
                  height={headerHeight - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#5b21b6"
                  onDblClick={() => imageGenPromptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && imageGenPromptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    setImageGenModelMenuPromptId(item.id)
                    setImageGenModelMenuPosition({
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  text="..."
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - runButtonWidth - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunImageGenPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={runButtonWidth}
                    height={buttonHeight}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={runButtonWidth}
                    height={buttonHeight}
                    fontSize={12}
                    fontStyle="bold"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Content text */}
                <Text
                  text={item.text}
                  x={8}
                  y={headerHeight + 8}
                  width={item.width - 16}
                  height={item.height - headerHeight - 16}
                  fontSize={item.fontSize}
                  fill="#333"
                  onDblClick={() => imageGenPromptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && imageGenPromptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html-gen-prompt') {
            const headerHeight = 28
            const isEditingThis = htmlGenPromptEditing.editingId === item.id
            const isRunning = runningHtmlGenPromptIds.has(item.id)
            const runButtonWidth = 40
            const modelButtonWidth = 20
            const buttonHeight = 20
            const buttonGap = 4

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark teal (13, 148, 136) and light teal (94, 234, 212)
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? `rgb(${Math.round(13 + 81 * pulseIntensity)}, ${Math.round(148 + 86 * pulseIntensity)}, ${Math.round(136 + 76 * pulseIntensity)})`
              : (isSelected ? '#0066cc' : '#0d9488')
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark teal and light teal
            const runButtonColor = isRunning
              ? `rgb(${Math.round(13 + 81 * pulseIntensity)}, ${Math.round(148 + 86 * pulseIntensity)}, ${Math.round(136 + 76 * pulseIntensity)})`
              : '#0f766e'

            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                draggable={!isRunning}
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  node.scaleX(1)
                  node.scaleY(1)
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(100, item.width * scaleX),
                    height: Math.max(60, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill="#ccfbf1"
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={headerHeight}
                  fill="#99f6e4"
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - runButtonWidth - modelButtonWidth - buttonGap - 24}
                  height={headerHeight - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#134e4a"
                  onDblClick={() => htmlGenPromptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && htmlGenPromptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    setHtmlGenModelMenuPromptId(item.id)
                    setHtmlGenModelMenuPosition({
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - runButtonWidth - modelButtonWidth - buttonGap - 8}
                  y={4}
                  text="..."
                  width={modelButtonWidth}
                  height={buttonHeight}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - runButtonWidth - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunHtmlGenPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={runButtonWidth}
                    height={buttonHeight}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={runButtonWidth}
                    height={buttonHeight}
                    fontSize={12}
                    fontStyle="bold"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Content text */}
                <Text
                  text={item.text}
                  x={8}
                  y={headerHeight + 8}
                  width={item.width - 16}
                  height={item.height - headerHeight - 16}
                  fontSize={item.fontSize}
                  fill="#333"
                  onDblClick={() => htmlGenPromptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && htmlGenPromptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html') {
            const headerHeight = 24
            const zoom = item.zoom ?? 1
            const zoomButtonWidth = 24
            const exportButtonWidth = 50
            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height + headerHeight}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onDragStart={() => {
                  if (config.features.hideHtmlDuringTransform) {
                    setIsViewportTransforming(true)
                  }
                }}
                onDragMove={(e) => {
                  // Track position in real-time for iframe sync
                  const node = e.target
                  setHtmlItemTransforms((prev) => {
                    const next = new Map(prev)
                    next.set(item.id, {
                      x: node.x(),
                      y: node.y(),
                      width: item.width,
                      height: item.height,
                    })
                    return next
                  })
                }}
                onDragEnd={(e) => {
                  onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
                  // Clear real-time transform tracking
                  setHtmlItemTransforms((prev) => {
                    const next = new Map(prev)
                    next.delete(item.id)
                    return next
                  })
                  if (config.features.hideHtmlDuringTransform) {
                    setIsViewportTransforming(false)
                  }
                }}
                onTransformStart={() => {
                  if (config.features.hideHtmlDuringTransform) {
                    setIsViewportTransforming(true)
                  }
                }}
                onTransform={(e) => {
                  // Track transform in real-time for iframe sync
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  setHtmlItemTransforms((prev) => {
                    const next = new Map(prev)
                    next.set(item.id, {
                      x: node.x(),
                      y: node.y(),
                      width: item.width * scaleX,
                      height: (item.height + headerHeight) * scaleY - headerHeight,
                    })
                    return next
                  })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  // Reset scale and apply to width/height
                  node.scaleX(1)
                  node.scaleY(1)
                  onUpdateItem(item.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(100, node.width() * scaleX),
                    height: Math.max(60, (node.height() - headerHeight) * scaleY),
                  })
                  // Clear real-time transform tracking
                  setHtmlItemTransforms((prev) => {
                    const next = new Map(prev)
                    next.delete(item.id)
                    return next
                  })
                  if (config.features.hideHtmlDuringTransform) {
                    setIsViewportTransforming(false)
                  }
                }}
              >
                {/* Header bar for dragging */}
                <Rect
                  width={item.width}
                  height={headerHeight}
                  fill="#d0d0d0"
                  stroke={selectedIds.includes(item.id) ? '#0066cc' : '#ccc'}
                  strokeWidth={selectedIds.includes(item.id) ? 2 : 1}
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Label text */}
                <Text
                  x={8}
                  y={4}
                  text={item.label || 'HTML'}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#333"
                  width={item.width - zoomButtonWidth * 3 - exportButtonWidth - 24}
                  ellipsis={true}
                  onDblClick={() => handleHtmlLabelDblClick(item.id)}
                  visible={editingHtmlLabelId !== item.id}
                />
                {/* Export button with dropdown */}
                <Group
                  x={item.width - zoomButtonWidth * 3 - exportButtonWidth - 12}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (exportMenuItemId === item.id) {
                      setExportMenuItemId(null)
                      setExportMenuPosition(null)
                    } else {
                      // Position menu below the button using click coordinates
                      setExportMenuPosition({
                        x: e.evt.clientX - 40, // Center under button
                        y: e.evt.clientY + 10, // Below the click
                      })
                      setExportMenuItemId(item.id)
                    }
                  }}
                >
                  <Rect
                    width={exportButtonWidth}
                    height={20}
                    fill={exportMenuItemId === item.id ? '#3d6640' : '#4a7c4e'}
                    cornerRadius={3}
                  />
                  <Text
                    text="Export ▾"
                    width={exportButtonWidth}
                    height={20}
                    fontSize={11}
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Zoom out button */}
                <Group
                  x={item.width - zoomButtonWidth * 3 - 8}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    const newZoom = Math.max(0.25, zoom - 0.25)
                    onUpdateItem(item.id, { zoom: newZoom })
                  }}
                >
                  <Rect
                    width={zoomButtonWidth}
                    height={20}
                    fill="#888"
                    cornerRadius={3}
                  />
                  <Text
                    text="-"
                    width={zoomButtonWidth}
                    height={20}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Zoom level display */}
                <Text
                  x={item.width - zoomButtonWidth * 2 - 6}
                  y={2}
                  text={`${Math.round(zoom * 100)}%`}
                  width={zoomButtonWidth}
                  height={20}
                  fontSize={11}
                  fill="#555"
                  align="center"
                  verticalAlign="middle"
                />
                {/* Zoom in button */}
                <Group
                  x={item.width - zoomButtonWidth - 4}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    const newZoom = Math.min(3, zoom + 0.25)
                    onUpdateItem(item.id, { zoom: newZoom })
                  }}
                >
                  <Rect
                    width={zoomButtonWidth}
                    height={20}
                    fill="#888"
                    cornerRadius={3}
                  />
                  <Text
                    text="+"
                    width={zoomButtonWidth}
                    height={20}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Content area background */}
                <Rect
                  y={headerHeight}
                  width={item.width}
                  height={item.height}
                  fill="#fff"
                  stroke={selectedIds.includes(item.id) ? '#0066cc' : '#ccc'}
                  strokeWidth={selectedIds.includes(item.id) ? 2 : 1}
                  cornerRadius={[0, 0, 4, 4]}
                />
              </Group>
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

        {/* Transformer for text - width resizing only, text reflows */}
        <Transformer
          ref={textTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            // Prevent too small width
            if (newBox.width < 50) {
              return oldBox
            }
            return newBox
          }}
        />
        {/* Transformer for images - corner handles only, no rotation */}
        <Transformer
          ref={imageTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={true}
        />
        {/* Transformer for prompts - free resize, no rotation */}
        <Transformer
          ref={promptTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 100 || newBox.height < 60) {
              return oldBox
            }
            return newBox
          }}
        />
        {/* Transformer for image gen prompts - free resize, no rotation */}
        <Transformer
          ref={imageGenPromptTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 100 || newBox.height < 60) {
              return oldBox
            }
            return newBox
          }}
        />
        {/* Transformer for HTML gen prompts - free resize, no rotation */}
        <Transformer
          ref={htmlGenPromptTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 100 || newBox.height < 60) {
              return oldBox
            }
            return newBox
          }}
        />
        {/* Transformer for HTML views - free scaling, no rotation */}
        <Transformer
          ref={htmlTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 100 || newBox.height < 60) {
              return oldBox
            }
            return newBox
          }}
        />
      </Layer>
    </Stage>

      {/* HTML iframe overlays - tracks Konva rects during drag/transform */}
      {!isViewportTransforming && items
        .filter((item) => item.type === 'html')
        .map((item) => {
          if (item.type !== 'html') return null
          const headerHeight = 24
          const zoom = item.zoom ?? 1
          // Use real-time transform state if available, otherwise use item state
          const transform = htmlItemTransforms.get(item.id)
          const x = transform?.x ?? item.x
          const y = transform?.y ?? item.y
          const width = transform?.width ?? item.width
          const height = transform?.height ?? item.height
          return (
            <div
              key={`html-${item.id}`}
              style={{
                position: 'absolute',
                top: (y + headerHeight) * stageScale + stagePos.y,
                left: x * stageScale + stagePos.x,
                width: width * stageScale,
                height: height * stageScale,
                overflow: 'hidden',
                borderRadius: '0 0 4px 4px',
                zIndex: 10,
              }}
            >
              <iframe
                srcDoc={item.html}
                sandbox="allow-same-origin allow-scripts"
                style={{
                  width: (width * stageScale) / zoom,
                  height: (height * stageScale) / zoom,
                  border: 'none',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  // Disable pointer events when selected, or when any drag is active (prevents iframe from capturing mouse)
                  pointerEvents: (selectedIds.includes(item.id) || isAnyDragActive) ? 'none' : 'auto',
                  background: '#fff',
                }}
              />
            </div>
          )
        })}

      {/* Textarea overlay for editing text */}
      {editingItem && (() => {
        const measureText = () => {
          const textNode = new Konva.Text({
            text: editingItem.text,
            fontSize: editingItem.fontSize,
            width: editingItem.width,
          })
          return textNode.height()
        }
        const textHeight = measureText()
        return (
          <textarea
            ref={textareaRef}
            defaultValue={editingItem.text}
            onBlur={handleTextareaBlur}
            onKeyDown={handleTextareaKeyDown}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = target.scrollHeight + 'px'
            }}
            style={{
              position: 'absolute',
              top: (editingItem.y + 8) * stageScale + stagePos.y,
              left: (editingItem.x + 8) * stageScale + stagePos.x,
              width: editingItem.width * stageScale,
              minHeight: textHeight * stageScale,
              fontSize: editingItem.fontSize * stageScale,
              fontFamily: 'sans-serif',
              padding: 0,
              margin: 0,
              border: '1px solid #ccc',
              borderRadius: 4,
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              background: 'white',
              transformOrigin: 'top left',
            }}
          />
        )
      })()}

      {/* Input overlay for editing prompt label */}
      {editingPrompt && promptEditing.editingField === 'label' && (
        <input
          ref={promptEditing.labelInputRef}
          type="text"
          defaultValue={editingPrompt.label}
          onBlur={promptEditing.handleLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              promptEditing.handleLabelBlur()
            }
            promptEditing.handleKeyDown(e)
          }}
          style={{
            position: 'absolute',
            top: editingPrompt.y * stageScale + stagePos.y + 4 * stageScale,
            left: editingPrompt.x * stageScale + stagePos.x + 6 * stageScale,
            width: (editingPrompt.width - 16) * stageScale,
            height: 20 * stageScale,
            fontSize: 14 * stageScale,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            padding: '0 2px',
            margin: 0,
            border: '2px solid #c9a227',
            borderRadius: 2,
            outline: 'none',
            background: '#e8d89c',
            color: '#5c4d1a',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Textarea overlay for editing prompt text */}
      {editingPrompt && promptEditing.editingField === 'text' && (
        <textarea
          ref={promptEditing.textareaRef}
          defaultValue={editingPrompt.text}
          onBlur={promptEditing.handleTextBlur}
          onKeyDown={promptEditing.handleKeyDown}
          style={{
            position: 'absolute',
            top: (editingPrompt.y + 28 + 6) * stageScale + stagePos.y,
            left: (editingPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingPrompt.width - 16) * stageScale,
            height: (editingPrompt.height - 28 - 16) * stageScale,
            fontSize: editingPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: '2px solid #c9a227',
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: '#f8f4e8',
            color: '#333',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Input overlay for editing image gen prompt label */}
      {editingImageGenPrompt && imageGenPromptEditing.editingField === 'label' && (
        <input
          ref={imageGenPromptEditing.labelInputRef}
          type="text"
          defaultValue={editingImageGenPrompt.label}
          onBlur={imageGenPromptEditing.handleLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              imageGenPromptEditing.handleLabelBlur()
            }
            imageGenPromptEditing.handleKeyDown(e)
          }}
          style={{
            position: 'absolute',
            top: editingImageGenPrompt.y * stageScale + stagePos.y + 4 * stageScale,
            left: editingImageGenPrompt.x * stageScale + stagePos.x + 6 * stageScale,
            width: (editingImageGenPrompt.width - 16) * stageScale,
            height: 20 * stageScale,
            fontSize: 14 * stageScale,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            padding: '0 2px',
            margin: 0,
            border: '2px solid #8b5cf6',
            borderRadius: 2,
            outline: 'none',
            background: '#ddd6fe',
            color: '#5b21b6',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Textarea overlay for editing image gen prompt text */}
      {editingImageGenPrompt && imageGenPromptEditing.editingField === 'text' && (
        <textarea
          ref={imageGenPromptEditing.textareaRef}
          defaultValue={editingImageGenPrompt.text}
          onBlur={imageGenPromptEditing.handleTextBlur}
          onKeyDown={imageGenPromptEditing.handleKeyDown}
          style={{
            position: 'absolute',
            top: (editingImageGenPrompt.y + 28 + 6) * stageScale + stagePos.y,
            left: (editingImageGenPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingImageGenPrompt.width - 16) * stageScale,
            height: (editingImageGenPrompt.height - 28 - 16) * stageScale,
            fontSize: editingImageGenPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: '2px solid #8b5cf6',
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: '#f5f3ff',
            color: '#333',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Input overlay for editing HTML gen prompt label */}
      {editingHtmlGenPrompt && htmlGenPromptEditing.editingField === 'label' && (
        <input
          ref={htmlGenPromptEditing.labelInputRef}
          type="text"
          defaultValue={editingHtmlGenPrompt.label}
          onBlur={htmlGenPromptEditing.handleLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              htmlGenPromptEditing.handleLabelBlur()
            }
            htmlGenPromptEditing.handleKeyDown(e)
          }}
          style={{
            position: 'absolute',
            top: editingHtmlGenPrompt.y * stageScale + stagePos.y + 4 * stageScale,
            left: editingHtmlGenPrompt.x * stageScale + stagePos.x + 6 * stageScale,
            width: (editingHtmlGenPrompt.width - 16) * stageScale,
            height: 20 * stageScale,
            fontSize: 14 * stageScale,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            padding: '0 2px',
            margin: 0,
            border: '2px solid #0d9488',
            borderRadius: 2,
            outline: 'none',
            background: '#99f6e4',
            color: '#134e4a',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Textarea overlay for editing HTML gen prompt text */}
      {editingHtmlGenPrompt && htmlGenPromptEditing.editingField === 'text' && (
        <textarea
          ref={htmlGenPromptEditing.textareaRef}
          defaultValue={editingHtmlGenPrompt.text}
          onBlur={htmlGenPromptEditing.handleTextBlur}
          onKeyDown={htmlGenPromptEditing.handleKeyDown}
          style={{
            position: 'absolute',
            top: (editingHtmlGenPrompt.y + 28 + 6) * stageScale + stagePos.y,
            left: (editingHtmlGenPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingHtmlGenPrompt.width - 16) * stageScale,
            height: (editingHtmlGenPrompt.height - 28 - 16) * stageScale,
            fontSize: editingHtmlGenPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: '2px solid #0d9488',
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: '#ccfbf1',
            color: '#333',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Input overlay for editing HTML item label */}
      {editingHtmlItem && (
        <input
          ref={htmlLabelInputRef}
          defaultValue={editingHtmlItem.label || 'HTML'}
          onBlur={handleHtmlLabelBlur}
          onKeyDown={handleHtmlLabelKeyDown}
          style={{
            position: 'absolute',
            top: editingHtmlItem.y * stageScale + stagePos.y + 4 * stageScale,
            left: editingHtmlItem.x * stageScale + stagePos.x + 8 * stageScale,
            width: (editingHtmlItem.width - 150) * stageScale,
            height: 16 * stageScale,
            fontSize: 14 * stageScale,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            padding: '0 2px',
            margin: 0,
            border: '2px solid #0066cc',
            borderRadius: 2,
            outline: 'none',
            background: '#e8f4ff',
            color: '#333',
            boxSizing: 'border-box',
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

      {/* Model selector menu */}
      {modelMenuPromptId && modelMenuPosition && (
        <div
          style={{
            position: 'fixed',
            top: modelMenuPosition.y,
            left: modelMenuPosition.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['claude-haiku', 'claude-sonnet', 'claude-opus', 'gemini-flash', 'gemini-pro'] as LLMModel[]).map((model) => {
            const promptItem = items.find((i) => i.id === modelMenuPromptId && i.type === 'prompt')
            const isSelected = promptItem?.type === 'prompt' && promptItem.model === model
            return (
              <button
                key={model}
                onClick={() => {
                  onUpdateItem(modelMenuPromptId, { model })
                  setModelMenuPromptId(null)
                  setModelMenuPosition(null)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: isSelected ? '#e8e8e8' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? '#e0e0e0' : '#f0f0f0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? '#e8e8e8' : 'none')}
              >
                {{
                  'claude-haiku': 'Claude Haiku',
                  'claude-sonnet': 'Claude Sonnet',
                  'claude-opus': 'Claude Opus',
                  'gemini-flash': 'Gemini 3 Flash',
                  'gemini-pro': 'Gemini 3 Pro',
                }[model]}
              </button>
            )
          })}
        </div>
      )}

      {/* Image gen model selector menu */}
      {imageGenModelMenuPromptId && imageGenModelMenuPosition && (
        <div
          style={{
            position: 'fixed',
            top: imageGenModelMenuPosition.y,
            left: imageGenModelMenuPosition.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['gemini-imagen', 'gemini-flash-imagen'] as ImageGenModel[]).map((model) => {
            const promptItem = items.find((i) => i.id === imageGenModelMenuPromptId && i.type === 'image-gen-prompt')
            const isSelected = promptItem?.type === 'image-gen-prompt' && promptItem.model === model
            return (
              <button
                key={model}
                onClick={() => {
                  onUpdateItem(imageGenModelMenuPromptId, { model })
                  setImageGenModelMenuPromptId(null)
                  setImageGenModelMenuPosition(null)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: isSelected ? '#e8e8e8' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? '#e0e0e0' : '#f0f0f0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? '#e8e8e8' : 'none')}
              >
                {{
                  'gemini-imagen': 'Gemini Imagen',
                  'gemini-flash-imagen': 'Gemini Flash Imagen',
                }[model]}
              </button>
            )
          })}
        </div>
      )}

      {/* HTML gen model selector menu */}
      {htmlGenModelMenuPromptId && htmlGenModelMenuPosition && (
        <div
          style={{
            position: 'fixed',
            top: htmlGenModelMenuPosition.y,
            left: htmlGenModelMenuPosition.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['claude-haiku', 'claude-sonnet', 'claude-opus', 'gemini-flash', 'gemini-pro'] as LLMModel[]).map((model) => {
            const promptItem = items.find((i) => i.id === htmlGenModelMenuPromptId && i.type === 'html-gen-prompt')
            const isSelected = promptItem?.type === 'html-gen-prompt' && promptItem.model === model
            return (
              <button
                key={model}
                onClick={() => {
                  onUpdateItem(htmlGenModelMenuPromptId, { model })
                  setHtmlGenModelMenuPromptId(null)
                  setHtmlGenModelMenuPosition(null)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: isSelected ? '#e8e8e8' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? '#e0e0e0' : '#f0f0f0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? '#e8e8e8' : 'none')}
              >
                {{
                  'claude-haiku': 'Claude Haiku',
                  'claude-sonnet': 'Claude Sonnet',
                  'claude-opus': 'Claude Opus',
                  'gemini-flash': 'Gemini 3 Flash',
                  'gemini-pro': 'Gemini 3 Pro',
                }[model]}
              </button>
            )
          })}
        </div>
      )}

      {/* Image context menu */}
      {imageContextMenu && (() => {
        const contextImageItem = items.find((i) => i.id === imageContextMenu.imageId && i.type === 'image') as ImageItem | undefined
        return (
        <div
          style={{
            position: 'fixed',
            top: imageContextMenu.y,
            left: imageContextMenu.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 150,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onUpdateItem(imageContextMenu.imageId, {
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
              })
              setImageContextMenu(null)
            }}
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
            Reset Transform
          </button>
          <button
            onClick={() => {
              const imgItem = contextImageItem
              if (!imgItem) { setImageContextMenu(null); return }
              const img = loadedImages.get(imgItem.src)
              if (!img) { setImageContextMenu(null); return }
              const natW = img.naturalWidth
              const natH = img.naturalHeight
              // Initialize pending crop rect from existing crop or full image
              const initialCrop = imgItem.cropRect
                ? { ...imgItem.cropRect }
                : { x: 0, y: 0, width: natW, height: natH }
              setCroppingImageId(imgItem.id)
              setPendingCropRect(initialCrop)
              setImageContextMenu(null)
            }}
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
            Crop
          </button>
          {contextImageItem?.cropRect && (
            <button
              onClick={() => {
                const imgItem = contextImageItem
                if (!imgItem) { setImageContextMenu(null); return }
                const img = loadedImages.get(imgItem.src)
                if (!img) { setImageContextMenu(null); return }
                const natW = img.naturalWidth
                const natH = img.naturalHeight
                // Restore full image dimensions using current display scale
                const currentSourceW = imgItem.cropRect?.width ?? natW
                const displayScale = imgItem.width / currentSourceW
                const offsetX = imgItem.x - (imgItem.cropRect?.x ?? 0) * displayScale
                const offsetY = imgItem.y - (imgItem.cropRect?.y ?? 0) * displayScale
                onUpdateItem(imgItem.id, {
                  x: offsetX,
                  y: offsetY,
                  width: natW * displayScale,
                  height: natH * displayScale,
                  cropRect: undefined,
                  cropSrc: undefined,
                })
                setImageContextMenu(null)
              }}
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
              Remove Crop
            </button>
          )}
        </div>
        )
      })()}

      {/* Export menu */}
      {exportMenuItemId && exportMenuPosition && (() => {
        const htmlItem = items.find((i) => i.id === exportMenuItemId && i.type === 'html')
        if (!htmlItem || htmlItem.type !== 'html') return null
        return (
          <div
            style={{
              position: 'fixed',
              top: exportMenuPosition.y,
              left: exportMenuPosition.x,
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={async () => {
                setExportMenuItemId(null)
                setExportMenuPosition(null)
                try {
                  await exportHtmlWithImages(htmlItem.html, htmlItem.label || 'export')
                } catch (error) {
                  if (error instanceof Error && error.name === 'AbortError') {
                    return
                  }
                  console.error('Export failed:', error)
                  alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
                }
              }}
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
              HTML
            </button>
            <button
              onClick={async () => {
                setExportMenuItemId(null)
                setExportMenuPosition(null)
                try {
                  await exportMarkdownWithImages(htmlItem.html, htmlItem.label || 'export')
                } catch (error) {
                  if (error instanceof Error && error.name === 'AbortError') {
                    return
                  }
                  console.error('Export failed:', error)
                  alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
                }
              }}
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
              Markdown
            </button>
            <hr style={{ margin: '2px 8px', border: 'none', borderTop: '1px solid #ddd' }} />
            <button
              onClick={async () => {
                setExportMenuItemId(null)
                setExportMenuPosition(null)
                try {
                  await exportHtmlZip(htmlItem.html, htmlItem.label || 'export')
                } catch (error) {
                  if (error instanceof Error && error.name === 'AbortError') {
                    return
                  }
                  console.error('Export failed:', error)
                  alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
                }
              }}
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
              HTML (Zip)
            </button>
            <button
              onClick={async () => {
                setExportMenuItemId(null)
                setExportMenuPosition(null)
                try {
                  await exportMarkdownZip(htmlItem.html, htmlItem.label || 'export')
                } catch (error) {
                  if (error instanceof Error && error.name === 'AbortError') {
                    return
                  }
                  console.error('Export failed:', error)
                  alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
                }
              }}
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
              Markdown (Zip)
            </button>
          </div>
        )
      })()}
    </div>
  )
}

export default InfiniteCanvas
