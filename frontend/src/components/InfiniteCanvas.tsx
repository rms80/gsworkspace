import { useState, useRef } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, ImageItem, PromptItem, ImageGenPromptItem, HTMLGenPromptItem } from '../types'
import ImageCropOverlay from './ImageCropOverlay'
import { config } from '../config'
import { uploadImage } from '../api/images'
import CanvasContextMenu from './canvas/menus/CanvasContextMenu'
import ModelSelectorMenu from './canvas/menus/ModelSelectorMenu'
import ImageContextMenu from './canvas/menus/ImageContextMenu'
import HtmlExportMenu from './canvas/menus/HtmlExportMenu'
import { useCanvasViewport } from '../hooks/useCanvasViewport'
import { useClipboard } from '../hooks/useClipboard'
import { useCanvasSelection } from '../hooks/useCanvasSelection'
import { useCropMode } from '../hooks/useCropMode'
import { usePromptEditing } from '../hooks/usePromptEditing'
import { usePulseAnimation } from '../hooks/usePulseAnimation'
import { useMenuState } from '../hooks/useMenuState'
import { useImageLoader } from '../hooks/useImageLoader'
import { useTransformerSync } from '../hooks/useTransformerSync'
import {
  PROMPT_HEADER_HEIGHT, RUN_BUTTON_WIDTH, MODEL_BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_GAP,
  HTML_HEADER_HEIGHT, EXPORT_BUTTON_WIDTH, ZOOM_BUTTON_WIDTH,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT, MIN_TEXT_WIDTH,
  ZOOM_STEP, ZOOM_MIN, ZOOM_MAX,
  Z_IFRAME_OVERLAY,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
  PROMPT_THEME, IMAGE_GEN_PROMPT_THEME, HTML_GEN_PROMPT_THEME,
  getPulseColor,
  LLM_MODELS, IMAGE_GEN_MODELS, LLM_MODEL_LABELS, IMAGE_GEN_MODEL_LABELS,
} from '../constants/canvas'

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

  // 2. Image loader hook
  const { loadedImages } = useImageLoader(items)

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

  // 9. Menu state hooks
  const contextMenuState = useMenuState<{ x: number; y: number; canvasX: number; canvasY: number }>()
  const modelMenu = useMenuState<string>()
  const imageGenModelMenu = useMenuState<string>()
  const htmlGenModelMenu = useMenuState<string>()
  const imageContextMenuState = useMenuState<{ imageId: string }>()
  const exportMenu = useMenuState<string>()

  // 10. Remaining UI state
  const [htmlItemTransforms, setHtmlItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [editingHtmlLabelId, setEditingHtmlLabelId] = useState<string | null>(null)
  const htmlLabelInputRef = useRef<HTMLInputElement>(null)

  // 11. Pulse animation hook
  const { pulsePhase } = usePulseAnimation({
    runningPromptIds,
    runningImageGenPromptIds,
    runningHtmlGenPromptIds,
    layerRef,
  })

  // 12. Transformer sync hook
  useTransformerSync({
    items,
    selectedIds,
    stageRef,
    transformers: [
      { type: 'text', ref: textTransformerRef },
      { type: 'image', ref: imageTransformerRef, excludeId: croppingImageId },
      { type: 'prompt', ref: promptTransformerRef },
      { type: 'image-gen-prompt', ref: imageGenPromptTransformerRef },
      { type: 'html-gen-prompt', ref: htmlGenPromptTransformerRef },
      { type: 'html', ref: htmlTransformerRef },
    ],
  })

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
    contextMenuState.openMenu(
      { x: e.evt.clientX, y: e.evt.clientY, canvasX: canvasPos.x, canvasY: canvasPos.y },
      { x: e.evt.clientX, y: e.evt.clientY },
    )
  }

  // Handle paste from context menu
  const handleContextMenuPaste = async () => {
    if (!contextMenuState.menuData) return
    await clipboard.handleContextMenuPaste(contextMenuState.menuData.canvasX, contextMenuState.menuData.canvasY)
    contextMenuState.closeMenu()
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
                  const newWidth = Math.max(MIN_TEXT_WIDTH, item.width * scaleX)
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
                  stroke={selectedIds.includes(item.id) ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
                  strokeWidth={1}
                  cornerRadius={4}
                />
                <Text
                  x={padding}
                  y={padding}
                  text={item.text}
                  fontSize={item.fontSize}
                  width={item.width}
                  fill={selectedIds.includes(item.id) ? COLOR_SELECTED : '#000'}
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
                  imageContextMenuState.openMenu(
                    { imageId: item.id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
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
                stroke={selectedIds.includes(item.id) ? COLOR_SELECTED : undefined}
                strokeWidth={selectedIds.includes(item.id) ? 2 : 0}
              />
            )
          } else if (item.type === 'prompt') {
            const isEditingThis = promptEditing.editingId === item.id
            const isRunning = runningPromptIds.has(item.id)

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark orange and light orange
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? getPulseColor(pulseIntensity, PROMPT_THEME.pulseBorder)
              : (isSelected ? COLOR_SELECTED : PROMPT_THEME.border)
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark orange and light orange
            const runButtonColor = isRunning
              ? getPulseColor(pulseIntensity, PROMPT_THEME.pulseRunButton)
              : PROMPT_THEME.runButton

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
                    width: Math.max(MIN_PROMPT_WIDTH, item.width * scaleX),
                    height: Math.max(MIN_PROMPT_HEIGHT, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill={PROMPT_THEME.itemBg}
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={PROMPT_HEADER_HEIGHT}
                  fill={PROMPT_THEME.headerBg}
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 24}
                  height={PROMPT_HEADER_HEIGHT - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill={PROMPT_THEME.headerText}
                  onDblClick={() => promptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && promptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    modelMenu.openMenu(item.id, {
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  text="..."
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - RUN_BUTTON_WIDTH - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
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
                  y={PROMPT_HEADER_HEIGHT + 8}
                  width={item.width - 16}
                  height={item.height - PROMPT_HEADER_HEIGHT - 16}
                  fontSize={item.fontSize}
                  fill={PROMPT_THEME.contentText}
                  onDblClick={() => promptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && promptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'image-gen-prompt') {
            const isEditingThis = imageGenPromptEditing.editingId === item.id
            const isRunning = runningImageGenPromptIds.has(item.id)

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark purple and light purple
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? getPulseColor(pulseIntensity, IMAGE_GEN_PROMPT_THEME.pulseBorder)
              : (isSelected ? COLOR_SELECTED : IMAGE_GEN_PROMPT_THEME.border)
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark purple and light purple
            const runButtonColor = isRunning
              ? getPulseColor(pulseIntensity, IMAGE_GEN_PROMPT_THEME.pulseRunButton)
              : IMAGE_GEN_PROMPT_THEME.runButton

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
                    width: Math.max(MIN_PROMPT_WIDTH, item.width * scaleX),
                    height: Math.max(MIN_PROMPT_HEIGHT, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill={IMAGE_GEN_PROMPT_THEME.itemBg}
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={PROMPT_HEADER_HEIGHT}
                  fill={IMAGE_GEN_PROMPT_THEME.headerBg}
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 24}
                  height={PROMPT_HEADER_HEIGHT - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill={IMAGE_GEN_PROMPT_THEME.headerText}
                  onDblClick={() => imageGenPromptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && imageGenPromptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    imageGenModelMenu.openMenu(item.id, {
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  text="..."
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - RUN_BUTTON_WIDTH - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunImageGenPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
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
                  y={PROMPT_HEADER_HEIGHT + 8}
                  width={item.width - 16}
                  height={item.height - PROMPT_HEADER_HEIGHT - 16}
                  fontSize={item.fontSize}
                  fill={IMAGE_GEN_PROMPT_THEME.contentText}
                  onDblClick={() => imageGenPromptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && imageGenPromptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html-gen-prompt') {
            const isEditingThis = htmlGenPromptEditing.editingId === item.id
            const isRunning = runningHtmlGenPromptIds.has(item.id)

            // Calculate pulse intensity (0 to 1) for running prompts
            const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

            // Border color: pulse between dark teal and light teal
            const isSelected = selectedIds.includes(item.id)
            const borderColor = isRunning
              ? getPulseColor(pulseIntensity, HTML_GEN_PROMPT_THEME.pulseBorder)
              : (isSelected ? COLOR_SELECTED : HTML_GEN_PROMPT_THEME.border)
            const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

            // Run button color: pulse between dark teal and light teal
            const runButtonColor = isRunning
              ? getPulseColor(pulseIntensity, HTML_GEN_PROMPT_THEME.pulseRunButton)
              : HTML_GEN_PROMPT_THEME.runButton

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
                    width: Math.max(MIN_PROMPT_WIDTH, item.width * scaleX),
                    height: Math.max(MIN_PROMPT_HEIGHT, item.height * scaleY),
                  })
                }}
              >
                {/* Background */}
                <Rect
                  width={item.width}
                  height={item.height}
                  fill={HTML_GEN_PROMPT_THEME.itemBg}
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  cornerRadius={4}
                />
                {/* Header background */}
                <Rect
                  width={item.width}
                  height={PROMPT_HEADER_HEIGHT}
                  fill={HTML_GEN_PROMPT_THEME.headerBg}
                  cornerRadius={[4, 4, 0, 0]}
                />
                {/* Header label */}
                <Text
                  text={item.label}
                  x={8}
                  y={6}
                  width={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 24}
                  height={PROMPT_HEADER_HEIGHT - 6}
                  fontSize={14}
                  fontStyle="bold"
                  fill={HTML_GEN_PROMPT_THEME.headerText}
                  onDblClick={() => htmlGenPromptEditing.handleLabelDblClick(item.id)}
                  visible={!(isEditingThis && htmlGenPromptEditing.editingField === 'label')}
                />
                {/* Model selector button */}
                <Rect
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fill="#666"
                  cornerRadius={3}
                  onClick={(e) => {
                    e.cancelBubble = true
                    htmlGenModelMenu.openMenu(item.id, {
                      x: e.evt.clientX,
                      y: e.evt.clientY,
                    })
                  }}
                />
                <Text
                  x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
                  y={4}
                  text="..."
                  width={MODEL_BUTTON_WIDTH}
                  height={BUTTON_HEIGHT}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
                {/* Run button */}
                <Group
                  x={item.width - RUN_BUTTON_WIDTH - 8}
                  y={4}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (!isRunning) {
                      onRunHtmlGenPrompt(item.id)
                    }
                  }}
                >
                  <Rect
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
                    fill={runButtonColor}
                    cornerRadius={3}
                  />
                  <Text
                    text={isRunning ? '...' : 'Run'}
                    width={RUN_BUTTON_WIDTH}
                    height={BUTTON_HEIGHT}
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
                  y={PROMPT_HEADER_HEIGHT + 8}
                  width={item.width - 16}
                  height={item.height - PROMPT_HEADER_HEIGHT - 16}
                  fontSize={item.fontSize}
                  fill={HTML_GEN_PROMPT_THEME.contentText}
                  onDblClick={() => htmlGenPromptEditing.handleTextDblClick(item.id)}
                  visible={!(isEditingThis && htmlGenPromptEditing.editingField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html') {
            const zoom = item.zoom ?? 1
            return (
              <Group
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height + HTML_HEADER_HEIGHT}
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
                      height: (item.height + HTML_HEADER_HEIGHT) * scaleY - HTML_HEADER_HEIGHT,
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
                    width: Math.max(MIN_PROMPT_WIDTH, node.width() * scaleX),
                    height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - HTML_HEADER_HEIGHT) * scaleY),
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
                  height={HTML_HEADER_HEIGHT}
                  fill="#d0d0d0"
                  stroke={selectedIds.includes(item.id) ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
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
                  width={item.width - ZOOM_BUTTON_WIDTH * 3 - EXPORT_BUTTON_WIDTH - 24}
                  ellipsis={true}
                  onDblClick={() => handleHtmlLabelDblClick(item.id)}
                  visible={editingHtmlLabelId !== item.id}
                />
                {/* Export button with dropdown */}
                <Group
                  x={item.width - ZOOM_BUTTON_WIDTH * 3 - EXPORT_BUTTON_WIDTH - 12}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    if (exportMenu.menuData === item.id) {
                      exportMenu.closeMenu()
                    } else {
                      // Position menu below the button using click coordinates
                      exportMenu.openMenu(item.id, {
                        x: e.evt.clientX - 40, // Center under button
                        y: e.evt.clientY + 10, // Below the click
                      })
                    }
                  }}
                >
                  <Rect
                    width={EXPORT_BUTTON_WIDTH}
                    height={20}
                    fill={exportMenu.menuData === item.id ? '#3d6640' : '#4a7c4e'}
                    cornerRadius={3}
                  />
                  <Text
                    text="Export ▾"
                    width={EXPORT_BUTTON_WIDTH}
                    height={20}
                    fontSize={11}
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
                {/* Zoom out button */}
                <Group
                  x={item.width - ZOOM_BUTTON_WIDTH * 3 - 8}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    const newZoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP)
                    onUpdateItem(item.id, { zoom: newZoom })
                  }}
                >
                  <Rect
                    width={ZOOM_BUTTON_WIDTH}
                    height={20}
                    fill="#888"
                    cornerRadius={3}
                  />
                  <Text
                    text="-"
                    width={ZOOM_BUTTON_WIDTH}
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
                  x={item.width - ZOOM_BUTTON_WIDTH * 2 - 6}
                  y={2}
                  text={`${Math.round(zoom * 100)}%`}
                  width={ZOOM_BUTTON_WIDTH}
                  height={20}
                  fontSize={11}
                  fill="#555"
                  align="center"
                  verticalAlign="middle"
                />
                {/* Zoom in button */}
                <Group
                  x={item.width - ZOOM_BUTTON_WIDTH - 4}
                  y={2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    const newZoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP)
                    onUpdateItem(item.id, { zoom: newZoom })
                  }}
                >
                  <Rect
                    width={ZOOM_BUTTON_WIDTH}
                    height={20}
                    fill="#888"
                    cornerRadius={3}
                  />
                  <Text
                    text="+"
                    width={ZOOM_BUTTON_WIDTH}
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
                  y={HTML_HEADER_HEIGHT}
                  width={item.width}
                  height={item.height}
                  fill="#fff"
                  stroke={selectedIds.includes(item.id) ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
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
            stroke={COLOR_SELECTED}
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
            if (newBox.width < MIN_TEXT_WIDTH) {
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
            if (newBox.width < MIN_PROMPT_WIDTH || newBox.height < MIN_PROMPT_HEIGHT) {
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
            if (newBox.width < MIN_PROMPT_WIDTH || newBox.height < MIN_PROMPT_HEIGHT) {
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
            if (newBox.width < MIN_PROMPT_WIDTH || newBox.height < MIN_PROMPT_HEIGHT) {
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
            if (newBox.width < MIN_PROMPT_WIDTH || newBox.height < MIN_PROMPT_HEIGHT) {
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
                top: (y + HTML_HEADER_HEIGHT) * stageScale + stagePos.y,
                left: x * stageScale + stagePos.x,
                width: width * stageScale,
                height: height * stageScale,
                overflow: 'hidden',
                borderRadius: '0 0 4px 4px',
                zIndex: Z_IFRAME_OVERLAY,
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
            border: `2px solid ${PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            background: PROMPT_THEME.inputBg,
            color: PROMPT_THEME.inputText,
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
            top: (editingPrompt.y + PROMPT_HEADER_HEIGHT + 6) * stageScale + stagePos.y,
            left: (editingPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingPrompt.width - 16) * stageScale,
            height: (editingPrompt.height - PROMPT_HEADER_HEIGHT - 16) * stageScale,
            fontSize: editingPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: `2px solid ${PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: PROMPT_THEME.textareaBg,
            color: PROMPT_THEME.contentText,
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
            border: `2px solid ${IMAGE_GEN_PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            background: IMAGE_GEN_PROMPT_THEME.inputBg,
            color: IMAGE_GEN_PROMPT_THEME.inputText,
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
            top: (editingImageGenPrompt.y + PROMPT_HEADER_HEIGHT + 6) * stageScale + stagePos.y,
            left: (editingImageGenPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingImageGenPrompt.width - 16) * stageScale,
            height: (editingImageGenPrompt.height - PROMPT_HEADER_HEIGHT - 16) * stageScale,
            fontSize: editingImageGenPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: `2px solid ${IMAGE_GEN_PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: IMAGE_GEN_PROMPT_THEME.textareaBg,
            color: IMAGE_GEN_PROMPT_THEME.contentText,
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
            border: `2px solid ${HTML_GEN_PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            background: HTML_GEN_PROMPT_THEME.inputBg,
            color: HTML_GEN_PROMPT_THEME.inputText,
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
            top: (editingHtmlGenPrompt.y + PROMPT_HEADER_HEIGHT + 6) * stageScale + stagePos.y,
            left: (editingHtmlGenPrompt.x + 6) * stageScale + stagePos.x,
            width: (editingHtmlGenPrompt.width - 16) * stageScale,
            height: (editingHtmlGenPrompt.height - PROMPT_HEADER_HEIGHT - 16) * stageScale,
            fontSize: editingHtmlGenPrompt.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: `2px solid ${HTML_GEN_PROMPT_THEME.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: HTML_GEN_PROMPT_THEME.textareaBg,
            color: HTML_GEN_PROMPT_THEME.contentText,
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
            border: `2px solid ${COLOR_SELECTED}`,
            borderRadius: 2,
            outline: 'none',
            background: '#e8f4ff',
            color: '#333',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Context menu */}
      {contextMenuState.menuPosition && (
        <CanvasContextMenu
          position={contextMenuState.menuPosition}
          onPaste={handleContextMenuPaste}
        />
      )}

      {/* Model selector menu */}
      {modelMenu.menuData && modelMenu.menuPosition && (() => {
        const promptItem = items.find((i) => i.id === modelMenu.menuData && i.type === 'prompt') as PromptItem | undefined
        return (
          <ModelSelectorMenu
            position={modelMenu.menuPosition}
            models={LLM_MODELS}
            labels={LLM_MODEL_LABELS}
            selectedModel={promptItem?.model}
            onSelect={(model) => {
              onUpdateItem(modelMenu.menuData!, { model })
              modelMenu.closeMenu()
            }}
          />
        )
      })()}

      {/* Image gen model selector menu */}
      {imageGenModelMenu.menuData && imageGenModelMenu.menuPosition && (() => {
        const promptItem = items.find((i) => i.id === imageGenModelMenu.menuData && i.type === 'image-gen-prompt') as ImageGenPromptItem | undefined
        return (
          <ModelSelectorMenu
            position={imageGenModelMenu.menuPosition}
            models={IMAGE_GEN_MODELS}
            labels={IMAGE_GEN_MODEL_LABELS}
            selectedModel={promptItem?.model}
            onSelect={(model) => {
              onUpdateItem(imageGenModelMenu.menuData!, { model })
              imageGenModelMenu.closeMenu()
            }}
          />
        )
      })()}

      {/* HTML gen model selector menu */}
      {htmlGenModelMenu.menuData && htmlGenModelMenu.menuPosition && (() => {
        const promptItem = items.find((i) => i.id === htmlGenModelMenu.menuData && i.type === 'html-gen-prompt') as HTMLGenPromptItem | undefined
        return (
          <ModelSelectorMenu
            position={htmlGenModelMenu.menuPosition}
            models={LLM_MODELS}
            labels={LLM_MODEL_LABELS}
            selectedModel={promptItem?.model}
            onSelect={(model) => {
              onUpdateItem(htmlGenModelMenu.menuData!, { model })
              htmlGenModelMenu.closeMenu()
            }}
          />
        )
      })()}

      {/* Image context menu */}
      {imageContextMenuState.menuData && imageContextMenuState.menuPosition && (
        <ImageContextMenu
          position={imageContextMenuState.menuPosition}
          imageItem={items.find((i) => i.id === imageContextMenuState.menuData!.imageId && i.type === 'image') as ImageItem | undefined}
          loadedImages={loadedImages}
          onUpdateItem={onUpdateItem}
          onStartCrop={(id, initialCrop) => {
            setCroppingImageId(id)
            setPendingCropRect(initialCrop)
          }}
          onClose={imageContextMenuState.closeMenu}
        />
      )}

      {/* Export menu */}
      {exportMenu.menuData && exportMenu.menuPosition && (() => {
        const htmlItem = items.find((i) => i.id === exportMenu.menuData && i.type === 'html')
        if (!htmlItem || htmlItem.type !== 'html') return null
        return (
          <HtmlExportMenu
            position={exportMenu.menuPosition}
            html={htmlItem.html}
            label={htmlItem.label || 'export'}
            onClose={exportMenu.closeMenu}
          />
        )
      })()}
    </div>
  )
}

export default InfiniteCanvas
