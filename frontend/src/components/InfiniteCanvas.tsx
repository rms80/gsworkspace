import { useState, useRef, useEffect, useCallback } from 'react'
import { Stage, Layer, Rect, Transformer } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, ImageItem, VideoItem, PromptItem, ImageGenPromptItem, HTMLGenPromptItem } from '../types'
import { config } from '../config'
import { uploadImage } from '../api/images'
import { uploadVideo, getVideoDimensionsSafe, getVideoDimensionsFromUrl, isVideoFile } from '../api/videos'
import { duplicateImage, duplicateVideo } from '../utils/sceneOperations'
import CanvasContextMenu from './canvas/menus/CanvasContextMenu'
import ModelSelectorMenu from './canvas/menus/ModelSelectorMenu'
import ImageContextMenu from './canvas/menus/ImageContextMenu'
import VideoContextMenu from './canvas/menus/VideoContextMenu'
import HtmlExportMenu from './canvas/menus/HtmlExportMenu'
import TextItemRenderer from './canvas/items/TextItemRenderer'
import ImageItemRenderer from './canvas/items/ImageItemRenderer'
import VideoItemRenderer from './canvas/items/VideoItemRenderer'
import PromptItemRenderer from './canvas/items/PromptItemRenderer'
import HtmlItemRenderer from './canvas/items/HtmlItemRenderer'
import TextEditingOverlay from './canvas/overlays/TextEditingOverlay'
import PromptEditingOverlay from './canvas/overlays/PromptEditingOverlay'
import HtmlLabelEditingOverlay from './canvas/overlays/HtmlLabelEditingOverlay'
import VideoLabelEditingOverlay from './canvas/overlays/VideoLabelEditingOverlay'
import ImageLabelEditingOverlay from './canvas/overlays/ImageLabelEditingOverlay'
import VideoOverlay from './canvas/overlays/VideoOverlay'
import VideoCropOverlay from './canvas/overlays/VideoCropOverlay'
import ImageCropOverlay from './canvas/overlays/ImageCropOverlay'
import ProcessingOverlay from './canvas/overlays/ProcessingOverlay'
import { useCanvasViewport } from '../hooks/useCanvasViewport'
import { useClipboard } from '../hooks/useClipboard'
import { useCanvasSelection } from '../hooks/useCanvasSelection'
import { useCropMode } from '../hooks/useCropMode'
import { useVideoCropMode } from '../hooks/useVideoCropMode'
import { usePromptEditing } from '../hooks/usePromptEditing'
import { usePulseAnimation } from '../hooks/usePulseAnimation'
import { useMenuState } from '../hooks/useMenuState'
import { useImageLoader } from '../hooks/useImageLoader'
import { useTransformerSync } from '../hooks/useTransformerSync'
import { useBackgroundOperations } from '../contexts/BackgroundOperationsContext'
import {
  HTML_HEADER_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT, MIN_TEXT_WIDTH,
  Z_IFRAME_OVERLAY,
  COLOR_SELECTED,
  PROMPT_THEME, IMAGE_GEN_PROMPT_THEME, HTML_GEN_PROMPT_THEME,
  LLM_MODELS, IMAGE_GEN_MODELS, LLM_MODEL_LABELS, IMAGE_GEN_MODEL_LABELS,
} from '../constants/canvas'

interface InfiniteCanvasProps {
  items: CanvasItem[]
  selectedIds: string[]
  sceneId: string
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onSelectItems: (ids: string[]) => void
  onAddTextAt: (x: number, y: number, text: string) => string
  onAddImageAt: (x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => void
  onAddVideoAt: (x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number) => void
  onDeleteSelected: () => void
  onRunPrompt: (promptId: string) => void
  runningPromptIds: Set<string>
  onRunImageGenPrompt: (promptId: string) => void
  runningImageGenPromptIds: Set<string>
  onRunHtmlGenPrompt: (promptId: string) => void
  runningHtmlGenPromptIds: Set<string>
  isOffline: boolean
  onAddText?: () => void
  onAddPrompt?: () => void
  onAddImageGenPrompt?: () => void
  onAddHtmlGenPrompt?: () => void
}

function InfiniteCanvas({ items, selectedIds, sceneId, onUpdateItem, onSelectItems, onAddTextAt, onAddImageAt, onAddVideoAt, onDeleteSelected, onRunPrompt, runningPromptIds, onRunImageGenPrompt, runningImageGenPromptIds, onRunHtmlGenPrompt, runningHtmlGenPromptIds, isOffline, onAddText, onAddPrompt, onAddImageGenPrompt, onAddHtmlGenPrompt }: InfiniteCanvasProps) {
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
  const videoTransformerRef = useRef<Konva.Transformer>(null)

  // Background operations tracking
  const { startOperation, endOperation } = useBackgroundOperations()

  // Tooltip state for Run button
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const handleShowTooltip = useCallback((t: { text: string; x: number; y: number } | null) => {
    setTooltip(t)
  }, [])

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
    lockAspectRatio,
    setCroppingImageId,
    setPendingCropRect,
    setLockAspectRatio,
    applyCrop,
    cancelCrop: _cancelCrop,
  } = useCropMode({ items, sceneId, loadedImages, isOffline, onUpdateItem })

  // 3b. Video crop mode hook
  const {
    croppingVideoId,
    pendingCropRect: videoPendingCropRect,
    pendingSpeed: videoPendingSpeed,
    pendingRemoveAudio: videoPendingRemoveAudio,
    pendingTrim: videoPendingTrim,
    pendingTrimStart: videoPendingTrimStart,
    pendingTrimEnd: videoPendingTrimEnd,
    processingVideoId,
    startCrop: startVideoCrop,
    setPendingCropRect: setVideoPendingCropRect,
    setPendingSpeed: setVideoPendingSpeed,
    setPendingRemoveAudio: setVideoPendingRemoveAudio,
    setPendingTrim: setVideoPendingTrim,
    setPendingTrimStart: setVideoPendingTrimStart,
    setPendingTrimEnd: setVideoPendingTrimEnd,
    applyOrCancelCrop: applyOrCancelVideoCrop,
  } = useVideoCropMode({ items, sceneId, isOffline, onUpdateItem })

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
    croppingVideoId,
    applyOrCancelVideoCrop: applyOrCancelVideoCrop,
  })

  // 8. Clipboard hook
  const clipboard = useClipboard({
    items,
    selectedIds,
    sceneId,
    isEditing,
    isOffline,
    croppingImageId,
    screenToCanvas,
    scaleImageToViewport,
    onAddTextAt,
    onAddImageAt,
    onUpdateItem,
    onDeleteSelected,
  })

  // 8b. 'T' hotkey to create and edit text block at cursor, or edit selected text
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }
      // Don't trigger if already editing
      if (isEditing) {
        return
      }
      // Only trigger on 't' key without modifiers
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()

        // If a single text item is selected, edit it
        if (selectedIds.length === 1) {
          const selectedItem = items.find(item => item.id === selectedIds[0])
          if (selectedItem && selectedItem.type === 'text') {
            setEditingTextId(selectedItem.id)
            setTimeout(() => {
              textareaRef.current?.focus()
              textareaRef.current?.select()
            }, 0)
            return
          }
        }

        // If nothing selected, create new text block at cursor
        if (selectedIds.length === 0) {
          const canvasPos = screenToCanvas(clipboard.mousePos.x, clipboard.mousePos.y)
          const newId = onAddTextAt(canvasPos.x, canvasPos.y, '')
          // Select the new text block and start editing after it's rendered
          setTimeout(() => {
            onSelectItems([newId])
            setEditingTextId(newId)
            setTimeout(() => {
              textareaRef.current?.focus()
              textareaRef.current?.select()
            }, 0)
          }, 20)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, selectedIds, items, screenToCanvas, clipboard.mousePos, onAddTextAt, onSelectItems])

  // 9. Menu state hooks
  const contextMenuState = useMenuState<{ x: number; y: number; canvasX: number; canvasY: number }>()
  const modelMenu = useMenuState<string>()
  const imageGenModelMenu = useMenuState<string>()
  const htmlGenModelMenu = useMenuState<string>()
  const imageContextMenuState = useMenuState<{ imageId: string }>()
  const videoContextMenuState = useMenuState<{ videoId: string }>()
  const exportMenu = useMenuState<string>()

  // 10. Remaining UI state
  const [htmlItemTransforms, setHtmlItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [videoItemTransforms, setVideoItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [editingHtmlLabelId, setEditingHtmlLabelId] = useState<string | null>(null)
  const htmlLabelInputRef = useRef<HTMLInputElement>(null)
  const [editingVideoLabelId, setEditingVideoLabelId] = useState<string | null>(null)
  const videoLabelInputRef = useRef<HTMLInputElement>(null)
  const [editingImageLabelId, setEditingImageLabelId] = useState<string | null>(null)
  const imageLabelInputRef = useRef<HTMLInputElement>(null)

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
      { type: 'video', ref: videoTransformerRef },
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

  // Handle image duplication
  const handleDuplicateImage = useCallback(async (imageItem: ImageItem) => {
    try {
      startOperation()
      const result = await duplicateImage(sceneId, imageItem)
      onAddImageAt(
        result.positionX,
        result.positionY,
        result.url,
        result.visualWidth,
        result.visualHeight,
        result.name,
        result.pixelWidth,
        result.pixelHeight,
        undefined
      )
      endOperation()
    } catch (error) {
      console.error('Failed to duplicate image:', error)
      endOperation()
    }
  }, [sceneId, onAddImageAt, startOperation, endOperation])

  // Handle video duplication
  const handleDuplicateVideo = useCallback(async (videoItem: VideoItem) => {
    try {
      startOperation()
      const result = await duplicateVideo(sceneId, videoItem, isOffline)
      onAddVideoAt(
        result.positionX,
        result.positionY,
        result.url,
        result.pixelWidth,
        result.pixelHeight,
        result.name,
        undefined
      )
      endOperation()
    } catch (error) {
      console.error('Failed to duplicate video:', error)
      endOperation()
    }
  }, [sceneId, onAddVideoAt, isOffline, startOperation, endOperation])

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()

    const files = e.dataTransfer.files
    if (!files.length) return

    // Get drop position in canvas coordinates
    const rect = e.currentTarget.getBoundingClientRect()
    const dropX = e.clientX - rect.left
    const dropY = e.clientY - rect.top
    const canvasPos = screenToCanvas(dropX, dropY)

    // Process each dropped file
    let offsetIndex = 0
    for (const file of Array.from(files)) {
      // Handle image files
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        // Capture file info before async operations
        const fileName = file.name
        const fileSize = file.size
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string
          const img = new window.Image()
          img.onload = async () => {
            const scaled = scaleImageToViewport(img.width, img.height)
            // Extract filename without extension for the label
            const name = fileName.replace(/\.[^/.]+$/, '')
            const originalWidth = img.naturalWidth
            const originalHeight = img.naturalHeight
            try {
              // Upload to S3 immediately to avoid storing large data URLs in memory
              startOperation()
              const s3Url = await uploadImage(dataUrl, fileName || `dropped-${Date.now()}.png`)
              endOperation()
              // Offset multiple files so they don't stack exactly
              onAddImageAt(canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, s3Url, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
            } catch (err) {
              endOperation()
              console.error('Failed to upload image, using data URL:', err)
              // Fallback to data URL if upload fails
              onAddImageAt(canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
            }
          }
          img.src = dataUrl
        }
        reader.readAsDataURL(file)
        offsetIndex++
      }
      // Handle video files (if video support is enabled)
      else if (isVideoFile(file) && config.features.videoSupport) {
        try {
          let dimensions = await getVideoDimensionsSafe(file)

          if (!dimensions && isOffline) {
            console.warn('Skipping unsupported video format in offline mode:', file.name)
            continue
          }

          startOperation()
          console.log('Video upload started:', file.name, 'size:', (file.size / 1024 / 1024).toFixed(1) + 'MB')
          const result = await uploadVideo(file, isOffline)
          console.log('Video upload completed:', file.name, result.transcoded ? '(transcoded)' : '')
          endOperation()

          if (!dimensions) {
            const urlDims = await getVideoDimensionsFromUrl(result.url)
            dimensions = { ...urlDims, fileSize: file.size }
          }

          const name = file.name.replace(/\.[^/.]+$/, '')
          onAddVideoAt(canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, result.url, dimensions.width, dimensions.height, name, dimensions.fileSize)
          offsetIndex++
        } catch (err) {
          console.error('Video upload failed:', file.name, err)
          endOperation()
        }
      }
    }
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
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      // Enter commits text
      e.preventDefault()
      if (editingTextId && textareaRef.current) {
        onUpdateItem(editingTextId, { text: textareaRef.current.value })
      }
      setEditingTextId(null)
    } else if (e.key === 'Escape') {
      // Escape also commits text
      if (editingTextId && textareaRef.current) {
        onUpdateItem(editingTextId, { text: textareaRef.current.value })
      }
      setEditingTextId(null)
    }
    // Shift+Enter and Ctrl+Enter allow default behavior (newline)
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

  // Video item label editing handlers
  const handleVideoLabelDblClick = (id: string) => {
    setEditingVideoLabelId(id)
    setTimeout(() => {
      videoLabelInputRef.current?.focus()
      videoLabelInputRef.current?.select()
    }, 0)
  }

  const handleVideoLabelBlur = () => {
    if (editingVideoLabelId && videoLabelInputRef.current) {
      onUpdateItem(editingVideoLabelId, { name: videoLabelInputRef.current.value })
    }
    setEditingVideoLabelId(null)
  }

  const handleVideoLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingVideoLabelId(null)
    } else if (e.key === 'Enter') {
      handleVideoLabelBlur()
    }
  }

  const getEditingVideoItem = (): VideoItem | null => {
    if (!editingVideoLabelId) return null
    const item = items.find((i) => i.id === editingVideoLabelId)
    if (!item || item.type !== 'video') return null
    return item
  }
  const editingVideoItem = getEditingVideoItem()

  // Image item label editing handlers
  const handleImageLabelDblClick = (id: string) => {
    setEditingImageLabelId(id)
    setTimeout(() => {
      imageLabelInputRef.current?.focus()
      imageLabelInputRef.current?.select()
    }, 0)
  }

  const handleImageLabelBlur = () => {
    if (editingImageLabelId && imageLabelInputRef.current) {
      onUpdateItem(editingImageLabelId, { name: imageLabelInputRef.current.value })
    }
    setEditingImageLabelId(null)
  }

  const handleImageLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingImageLabelId(null)
    } else if (e.key === 'Enter') {
      handleImageLabelBlur()
    }
  }

  const getEditingImageItem = (): ImageItem | null => {
    if (!editingImageLabelId) return null
    const item = items.find((i) => i.id === editingImageLabelId)
    if (!item || item.type !== 'image') return null
    return item
  }
  const editingImageItem = getEditingImageItem()

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
            return (
              <TextItemRenderer
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                isEditing={editingTextId === item.id}
                onItemClick={handleItemClick}
                onDblClick={handleTextDblClick}
                onUpdateItem={onUpdateItem}
              />
            )
          } else if (item.type === 'image') {
            // Hide the image item when it's being cropped
            if (croppingImageId === item.id) return null
            const img = loadedImages.get(item.src)
            if (!img) return null
            return (
              <ImageItemRenderer
                key={item.id}
                item={item}
                image={img}
                isSelected={selectedIds.includes(item.id)}
                editingImageLabelId={editingImageLabelId}
                onItemClick={handleItemClick}
                onContextMenu={(e, id) => {
                  imageContextMenuState.openMenu(
                    { imageId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={onUpdateItem}
                onLabelDblClick={handleImageLabelDblClick}
              />
            )
          } else if (item.type === 'video') {
            // Hide the video item when it's being cropped/edited
            if (croppingVideoId === item.id) return null
            return (
              <VideoItemRenderer
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                editingVideoLabelId={editingVideoLabelId}
                onItemClick={handleItemClick}
                onContextMenu={(e, id) => {
                  videoContextMenuState.openMenu(
                    { videoId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={onUpdateItem}
                onLabelDblClick={handleVideoLabelDblClick}
                setVideoItemTransforms={setVideoItemTransforms}
              />
            )
          } else if (item.type === 'prompt') {
            return (
              <PromptItemRenderer
                key={item.id}
                item={item}
                theme={PROMPT_THEME}
                isSelected={selectedIds.includes(item.id)}
                isRunning={runningPromptIds.has(item.id)}
                isOffline={isOffline}
                pulsePhase={pulsePhase}
                editing={promptEditing}
                onItemClick={handleItemClick}
                onUpdateItem={onUpdateItem}
                onOpenModelMenu={(id, pos) => modelMenu.openMenu(id, pos)}
                onRun={onRunPrompt}
                onShowTooltip={handleShowTooltip}
              />
            )
          } else if (item.type === 'image-gen-prompt') {
            return (
              <PromptItemRenderer
                key={item.id}
                item={item}
                theme={IMAGE_GEN_PROMPT_THEME}
                isSelected={selectedIds.includes(item.id)}
                isRunning={runningImageGenPromptIds.has(item.id)}
                isOffline={isOffline}
                pulsePhase={pulsePhase}
                editing={imageGenPromptEditing}
                onItemClick={handleItemClick}
                onUpdateItem={onUpdateItem}
                onOpenModelMenu={(id, pos) => imageGenModelMenu.openMenu(id, pos)}
                onRun={onRunImageGenPrompt}
                onShowTooltip={handleShowTooltip}
              />
            )
          } else if (item.type === 'html-gen-prompt') {
            return (
              <PromptItemRenderer
                key={item.id}
                item={item}
                theme={HTML_GEN_PROMPT_THEME}
                isSelected={selectedIds.includes(item.id)}
                isRunning={runningHtmlGenPromptIds.has(item.id)}
                isOffline={isOffline}
                pulsePhase={pulsePhase}
                editing={htmlGenPromptEditing}
                onItemClick={handleItemClick}
                onUpdateItem={onUpdateItem}
                onOpenModelMenu={(id, pos) => htmlGenModelMenu.openMenu(id, pos)}
                onRun={onRunHtmlGenPrompt}
                onShowTooltip={handleShowTooltip}
              />
            )
          } else if (item.type === 'html') {
            return (
              <HtmlItemRenderer
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                editingHtmlLabelId={editingHtmlLabelId}
                exportMenu={exportMenu}
                onItemClick={handleItemClick}
                onUpdateItem={onUpdateItem}
                onLabelDblClick={handleHtmlLabelDblClick}
                setHtmlItemTransforms={setHtmlItemTransforms}
                setIsViewportTransforming={setIsViewportTransforming}
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
        {/* Transformer for videos - corner handles only, keep aspect ratio */}
        <Transformer
          ref={videoTransformerRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          keepRatio={true}
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

      {/* Video overlays */}
      {items
        .filter((item) => item.type === 'video')
        .map((item) => {
          if (item.type !== 'video') return null
          // Don't render normal overlay when cropping this video
          if (croppingVideoId === item.id) return null
          const transform = videoItemTransforms.get(item.id)
          return (
            <VideoOverlay
              key={`video-${item.id}`}
              item={item}
              stageScale={stageScale}
              stagePos={stagePos}
              isSelected={selectedIds.includes(item.id)}
              isAnyDragActive={isAnyDragActive}
              onUpdateItem={onUpdateItem}
              transform={transform}
            />
          )
        })}

      {/* Image crop overlay */}
      {croppingImageId && pendingCropRect && (() => {
        const imageItem = items.find((i) => i.id === croppingImageId && i.type === 'image') as ImageItem | undefined
        if (!imageItem) return null
        const img = loadedImages.get(imageItem.src)
        if (!img) return null
        return (
          <ImageCropOverlay
            item={imageItem}
            image={img}
            cropRect={pendingCropRect}
            stageScale={stageScale}
            stagePos={stagePos}
            lockAspectRatio={lockAspectRatio}
            onCropChange={setPendingCropRect}
            onLockAspectRatioChange={setLockAspectRatio}
          />
        )
      })()}

      {/* Video crop overlay */}
      {croppingVideoId && videoPendingCropRect && (() => {
        const videoItem = items.find((i) => i.id === croppingVideoId && i.type === 'video') as VideoItem | undefined
        if (!videoItem) return null
        return (
          <VideoCropOverlay
            item={videoItem}
            cropRect={videoPendingCropRect}
            speed={videoPendingSpeed}
            removeAudio={videoPendingRemoveAudio}
            trim={videoPendingTrim}
            trimStart={videoPendingTrimStart}
            trimEnd={videoPendingTrimEnd}
            stageScale={stageScale}
            stagePos={stagePos}
            onCropChange={setVideoPendingCropRect}
            onSpeedChange={setVideoPendingSpeed}
            onRemoveAudioChange={setVideoPendingRemoveAudio}
            onTrimChange={setVideoPendingTrim}
            onTrimStartChange={setVideoPendingTrimStart}
            onTrimEndChange={setVideoPendingTrimEnd}
          />
        )
      })()}

      {/* Processing overlay for video crop */}
      {processingVideoId && (() => {
        const videoItem = items.find((i) => i.id === processingVideoId && i.type === 'video') as VideoItem | undefined
        if (!videoItem) return null
        const scaleX = videoItem.scaleX ?? 1
        const scaleY = videoItem.scaleY ?? 1
        return (
          <ProcessingOverlay
            x={videoItem.x}
            y={videoItem.y}
            width={videoItem.width * scaleX}
            height={videoItem.height * scaleY}
            stageScale={stageScale}
            stagePos={stagePos}
            message="Processing video..."
          />
        )
      })()}

      {/* Text editing overlay */}
      {editingItem && (
        <TextEditingOverlay
          item={editingItem}
          textareaRef={textareaRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handleTextareaBlur}
          onKeyDown={handleTextareaKeyDown}
        />
      )}

      {/* Prompt editing overlays */}
      {editingPrompt && (
        <PromptEditingOverlay
          item={editingPrompt}
          theme={PROMPT_THEME}
          editing={promptEditing}
          stageScale={stageScale}
          stagePos={stagePos}
        />
      )}

      {editingImageGenPrompt && (
        <PromptEditingOverlay
          item={editingImageGenPrompt}
          theme={IMAGE_GEN_PROMPT_THEME}
          editing={imageGenPromptEditing}
          stageScale={stageScale}
          stagePos={stagePos}
        />
      )}

      {editingHtmlGenPrompt && (
        <PromptEditingOverlay
          item={editingHtmlGenPrompt}
          theme={HTML_GEN_PROMPT_THEME}
          editing={htmlGenPromptEditing}
          stageScale={stageScale}
          stagePos={stagePos}
        />
      )}

      {/* HTML label editing overlay */}
      {editingHtmlItem && (
        <HtmlLabelEditingOverlay
          item={editingHtmlItem}
          inputRef={htmlLabelInputRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handleHtmlLabelBlur}
          onKeyDown={handleHtmlLabelKeyDown}
        />
      )}

      {/* Video label editing overlay */}
      {editingVideoItem && (
        <VideoLabelEditingOverlay
          item={editingVideoItem}
          inputRef={videoLabelInputRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handleVideoLabelBlur}
          onKeyDown={handleVideoLabelKeyDown}
        />
      )}

      {/* Image label editing overlay */}
      {editingImageItem && (
        <ImageLabelEditingOverlay
          item={editingImageItem}
          inputRef={imageLabelInputRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handleImageLabelBlur}
          onKeyDown={handleImageLabelKeyDown}
        />
      )}

      {/* Context menu */}
      {contextMenuState.menuPosition && (
        <CanvasContextMenu
          position={contextMenuState.menuPosition}
          onPaste={handleContextMenuPaste}
          onAddText={onAddText}
          onAddPrompt={onAddPrompt}
          onAddImageGenPrompt={onAddImageGenPrompt}
          onAddHtmlGenPrompt={onAddHtmlGenPrompt}
          onClose={contextMenuState.closeMenu}
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
          sceneId={sceneId}
          loadedImages={loadedImages}
          isOffline={isOffline}
          onUpdateItem={onUpdateItem}
          onStartCrop={(id, initialCrop) => {
            setCroppingImageId(id)
            setPendingCropRect(initialCrop)
          }}
          onDuplicate={handleDuplicateImage}
          onClose={imageContextMenuState.closeMenu}
        />
      )}

      {/* Video context menu */}
      {videoContextMenuState.menuData && videoContextMenuState.menuPosition && (
        <VideoContextMenu
          position={videoContextMenuState.menuPosition}
          videoItem={items.find((i) => i.id === videoContextMenuState.menuData!.videoId && i.type === 'video') as import('../types').VideoItem | undefined}
          sceneId={sceneId}
          isOffline={isOffline}
          onUpdateItem={onUpdateItem}
          onCrop={(videoId) => {
            const videoItem = items.find((i) => i.id === videoId && i.type === 'video') as VideoItem | undefined
            if (videoItem) {
              const origW = videoItem.originalWidth ?? videoItem.width
              const origH = videoItem.originalHeight ?? videoItem.height
              // Start with full frame or existing crop
              const initialCrop = videoItem.cropRect ?? { x: 0, y: 0, width: origW, height: origH }
              const initialSpeed = videoItem.speedFactor ?? 1
              const initialRemoveAudio = videoItem.removeAudio ?? false
              const initialTrim = videoItem.trim ?? false
              const initialTrimStart = videoItem.trimStart ?? 0
              const initialTrimEnd = videoItem.trimEnd ?? 0
              startVideoCrop(videoId, initialCrop, initialSpeed, initialRemoveAudio, initialTrim, initialTrimStart, initialTrimEnd)
            }
          }}
          onDuplicate={handleDuplicateVideo}
          onClose={videoContextMenuState.closeMenu}
        />
      )}

      {/* Export menu */}
      {exportMenu.menuData && exportMenu.menuPosition && (() => {
        const htmlItem = items.find((i) => i.id === exportMenu.menuData && i.type === 'html')
        if (!htmlItem || htmlItem.type !== 'html') return null
        // Build image name map and image id map from canvas items for export
        const imageNameMap = new Map<string, string>()
        const imageIdMap = new Map<string, string>()
        items.forEach((item) => {
          if (item.type === 'image') {
            if (item.name) {
              imageNameMap.set(item.src, item.name)
            }
            imageIdMap.set(item.src, item.id)
          }
        })
        return (
          <HtmlExportMenu
            position={exportMenu.menuPosition}
            html={htmlItem.html}
            label={htmlItem.label || 'export'}
            imageNameMap={imageNameMap}
            sceneId={sceneId}
            imageIdMap={imageIdMap}
            onClose={exportMenu.closeMenu}
          />
        )
      })()}

      {/* Tooltip for disabled Run button */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            backgroundColor: '#333',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

export default InfiniteCanvas
