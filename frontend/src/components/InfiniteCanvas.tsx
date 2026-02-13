import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Stage, Layer, Rect, Group, Text, Transformer } from 'react-konva'
import Konva from 'konva'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, ImageItem, VideoItem, PromptItem, ImageGenPromptItem, HTMLGenPromptItem, PdfItem, TextFileItem } from '../types'
import { config } from '../config'
import { uploadImage } from '../api/images'
import { uploadPdf, uploadPdfThumbnail } from '../api/pdfs'
import { uploadTextFile } from '../api/textfiles'
import { ACTIVE_WORKSPACE } from '../api/workspace'
import { renderPdfPageToDataUrl } from '../utils/pdfThumbnail'
import { parseCsv } from '../utils/csvParser'
import { isVideoFile } from '../api/videos'
import { duplicateImage, duplicateVideo, convertToGif, convertToVideo } from '../utils/sceneOperations'
import CanvasContextMenu from './canvas/menus/CanvasContextMenu'
import ModelSelectorMenu from './canvas/menus/ModelSelectorMenu'
import ImageContextMenu from './canvas/menus/ImageContextMenu'
import VideoContextMenu from './canvas/menus/VideoContextMenu'
import PdfContextMenu from './canvas/menus/PdfContextMenu'
import TextFileContextMenu from './canvas/menus/TextFileContextMenu'
import HtmlExportMenu from './canvas/menus/HtmlExportMenu'
import TextItemRenderer from './canvas/items/TextItemRenderer'
import ImageItemRenderer from './canvas/items/ImageItemRenderer'
import VideoItemRenderer from './canvas/items/VideoItemRenderer'
import PromptItemRenderer from './canvas/items/PromptItemRenderer'
import HtmlItemRenderer from './canvas/items/HtmlItemRenderer'
import PdfItemRenderer from './canvas/items/PdfItemRenderer'
import TextFileItemRenderer from './canvas/items/TextFileItemRenderer'
import TextEditingOverlay from './canvas/overlays/TextEditingOverlay'
import PromptEditingOverlay from './canvas/overlays/PromptEditingOverlay'
import HtmlLabelEditingOverlay from './canvas/overlays/HtmlLabelEditingOverlay'
import VideoLabelEditingOverlay from './canvas/overlays/VideoLabelEditingOverlay'
import ImageLabelEditingOverlay from './canvas/overlays/ImageLabelEditingOverlay'
import PdfLabelEditingOverlay from './canvas/overlays/PdfLabelEditingOverlay'
import TextFileLabelEditingOverlay from './canvas/overlays/TextFileLabelEditingOverlay'
import VideoOverlay from './canvas/overlays/VideoOverlay'
import GifOverlay from './canvas/overlays/GifOverlay'
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
import { useGifAnimation } from '../hooks/useGifAnimation'
import { useMenuState } from '../hooks/useMenuState'
import { useImageLoader } from '../hooks/useImageLoader'
import { useTransformerSync } from '../hooks/useTransformerSync'
import { useBackgroundOperations } from '../contexts/BackgroundOperationsContext'
import {
  HTML_HEADER_HEIGHT, IMAGE_HEADER_HEIGHT, VIDEO_HEADER_HEIGHT, PDF_HEADER_HEIGHT, PDF_MINIMIZED_HEIGHT, TEXTFILE_HEADER_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT, MIN_TEXT_WIDTH,
  Z_IFRAME_OVERLAY,
  COLOR_SELECTED,
  PROMPT_THEME, IMAGE_GEN_PROMPT_THEME, HTML_GEN_PROMPT_THEME,
  LLM_MODELS, IMAGE_GEN_MODELS, LLM_MODEL_LABELS, IMAGE_GEN_MODEL_LABELS,
  TEXT_FILE_EXTENSION_PATTERN, getTextFileFormat,
} from '../constants/canvas'
import type { TransformEntry } from '../history'

interface InfiniteCanvasProps {
  items: CanvasItem[]
  selectedIds: string[]
  sceneId: string
  onUpdateItem: (id: string, changes: Partial<CanvasItem>, skipHistory?: boolean) => void
  onSelectItems: (ids: string[]) => void
  onAddTextAt: (x: number, y: number, text: string, optWidth?: number, topLeft?: boolean) => string
  onAddImageAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => void
  onAddVideoAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, originalWidth?: number, originalHeight?: number) => void
  onDeleteSelected: () => void
  onRunPrompt: (promptId: string) => void
  runningPromptIds: Set<string>
  onRunImageGenPrompt: (promptId: string) => void
  runningImageGenPromptIds: Set<string>
  onRunHtmlGenPrompt: (promptId: string) => void
  runningHtmlGenPromptIds: Set<string>
  isOffline: boolean
  onAddText?: (x?: number, y?: number) => void
  onAddPrompt?: (x?: number, y?: number) => void
  onAddImageGenPrompt?: (x?: number, y?: number) => void
  onAddHtmlGenPrompt?: (x?: number, y?: number) => void
  videoPlaceholders?: Array<{id: string, x: number, y: number, width: number, height: number, name: string}>
  onUploadVideoAt?: (file: File, x: number, y: number) => void
  onBatchTransform?: (entries: TransformEntry[]) => void
  onAddPdfAt?: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, thumbnailSrc?: string) => void
  onTogglePdfMinimized?: (id: string) => void
  onAddTextFileAt?: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, fileFormat?: string) => void
  onToggleTextFileMinimized?: (id: string) => void
}

export interface CanvasHandle {
  resetZoom: () => void
  fitToView: () => void
  getViewportCenter: () => { x: number; y: number }
}

const InfiniteCanvas = forwardRef<CanvasHandle, InfiniteCanvasProps>(function InfiniteCanvas({ items, selectedIds, sceneId, onUpdateItem, onSelectItems, onAddTextAt, onAddImageAt, onAddVideoAt, onDeleteSelected, onRunPrompt, runningPromptIds, onRunImageGenPrompt, runningImageGenPromptIds, onRunHtmlGenPrompt, runningHtmlGenPromptIds, isOffline, onAddText, onAddPrompt, onAddImageGenPrompt, onAddHtmlGenPrompt, videoPlaceholders, onUploadVideoAt, onBatchTransform, onAddPdfAt, onTogglePdfMinimized, onAddTextFileAt, onToggleTextFileMinimized }, ref) {
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
  const pdfTransformerRef = useRef<Konva.Transformer>(null)
  const textFileTransformerRef = useRef<Konva.Transformer>(null)
  const videoTransformerRef = useRef<Konva.Transformer>(null)

  // Multi-select drag coordination ref
  const multiDragRef = useRef<{
    dragNodeId: string
    startNodeX: number
    startNodeY: number
    otherNodes: Array<{ id: string; node: Konva.Node; startX: number; startY: number }>
    savedTransformerState: Map<Konva.Transformer, Konva.Node[]>
  } | null>(null)

  // Background operations tracking
  const { startOperation, endOperation } = useBackgroundOperations()

  // Conversion placeholders (video→GIF, GIF→video)
  const [conversionPlaceholders, setConversionPlaceholders] = useState<Array<{id: string, x: number, y: number, width: number, height: number, name: string}>>([])

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
    rightMouseDidDragRef,
    setStagePos,
    setStageScale: _setStageScale,
    setIsAnyDragActive: _setIsAnyDragActive,
    setIsViewportTransforming,
    handleWheel,
    screenToCanvas,
    scaleImageToViewport,
  } = useCanvasViewport(containerRef, stageRef)

  // Expose viewport controls to parent via ref
  useImperativeHandle(ref, () => ({
    getViewportCenter: () => ({
      x: (stageSize.width / 2 - stagePos.x) / stageScale,
      y: (stageSize.height / 2 - stagePos.y) / stageScale,
    }),
    resetZoom: () => {
      _setStageScale(1)
      setStagePos({ x: 0, y: 0 })
    },
    fitToView: () => {
      if (items.length === 0) return
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const item of items) {
        const w = item.width * ((item as ImageItem).scaleX ?? 1)
        const h = item.height * ((item as ImageItem).scaleY ?? 1)
        minX = Math.min(minX, item.x)
        minY = Math.min(minY, item.y)
        maxX = Math.max(maxX, item.x + w)
        maxY = Math.max(maxY, item.y + h)
      }
      const contentWidth = maxX - minX
      const contentHeight = maxY - minY
      const padding = 50
      const scale = Math.min(
        (stageSize.width - padding * 2) / contentWidth,
        (stageSize.height - padding * 2) / contentHeight,
        5,
      )
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      _setStageScale(scale)
      setStagePos({
        x: stageSize.width / 2 - centerX * scale,
        y: stageSize.height / 2 - centerY * scale,
      })
    },
  }), [items, stageSize, stagePos, stageScale])

  // 2. Image loader hook
  const { loadedImages } = useImageLoader(items)

  // 3. Crop mode hook
  const {
    croppingImageId,
    pendingCropRect,
    lockAspectRatio,
    processingImageId,
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
      // Shift+T: create new text block below the selected text block
      if (e.key === 'T' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selectedIds.length === 1) {
          const selectedItem = items.find(item => item.id === selectedIds[0])
          if (selectedItem && selectedItem.type === 'text') {
            e.preventDefault()
            // Compute actual visual height of text block (same as TextItemRenderer)
            const padding = 8
            const measuredText = new Konva.Text({
              text: selectedItem.text || '',
              fontSize: (selectedItem as CanvasItem & { fontSize: number }).fontSize || 14,
              width: selectedItem.width,
            })
            const visualHeight = measuredText.height() + padding * 2
            const desiredX = selectedItem.x
            const desiredY = selectedItem.y + visualHeight + 2
            const newId = onAddTextAt(desiredX, desiredY, '', selectedItem.width, true)
            onSelectItems([newId])
            setEditingTextId(newId)
            setTimeout(() => {
              textareaRef.current?.focus()
            }, 0)
            return
          }
        }
        // No single text block selected — fall through to create at cursor
      }

      // 't' or Shift+T (without single text selected): create/edit text block at cursor
      if ((e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) ||
          (e.key === 'T' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        const isShiftT = e.shiftKey
        e.preventDefault()

        // 't' with a single text item selected: edit it
        if (!isShiftT && selectedIds.length === 1) {
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

        // Create new text block at cursor (for 't' when nothing selected, or Shift+T fallthrough)
        if (isShiftT || selectedIds.length === 0) {
          const canvasPos = screenToCanvas(clipboard.mousePos.x, clipboard.mousePos.y)
          const newId = onAddTextAt(canvasPos.x, canvasPos.y, '', undefined, true)
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
  }, [isEditing, selectedIds, items, screenToCanvas, clipboard.mousePos, onAddTextAt, onSelectItems, onUpdateItem])

  // 8c. Viewport hotkeys: Shift+V = fit-to-view, C = center at cursor, Shift+C = fit-to-view at 100%
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }
      if (isEditing) return

      // Shift+V: fit to view
      if (e.key === 'V' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        if (items.length === 0) return
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const item of items) {
          const w = item.width * ((item as ImageItem).scaleX ?? 1)
          const h = item.height * ((item as ImageItem).scaleY ?? 1)
          minX = Math.min(minX, item.x)
          minY = Math.min(minY, item.y)
          maxX = Math.max(maxX, item.x + w)
          maxY = Math.max(maxY, item.y + h)
        }
        const contentWidth = maxX - minX
        const contentHeight = maxY - minY
        const padding = 50
        const scale = Math.min(
          (stageSize.width - padding * 2) / contentWidth,
          (stageSize.height - padding * 2) / contentHeight,
          5,
        )
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        _setStageScale(scale)
        setStagePos({
          x: stageSize.width / 2 - centerX * scale,
          y: stageSize.height / 2 - centerY * scale,
        })
        return
      }

      // Shift+C: center on content at 100% zoom
      if (e.key === 'C' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        if (items.length === 0) return
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const item of items) {
          const w = item.width * ((item as ImageItem).scaleX ?? 1)
          const h = item.height * ((item as ImageItem).scaleY ?? 1)
          minX = Math.min(minX, item.x)
          minY = Math.min(minY, item.y)
          maxX = Math.max(maxX, item.x + w)
          maxY = Math.max(maxY, item.y + h)
        }
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        _setStageScale(1)
        setStagePos({
          x: stageSize.width / 2 - centerX,
          y: stageSize.height / 2 - centerY,
        })
        return
      }

      // C: center viewport at cursor
      if (e.key === 'c' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const canvasPos = screenToCanvas(clipboard.mousePos.x, clipboard.mousePos.y)
        setStagePos({
          x: stageSize.width / 2 - canvasPos.x * stageScale,
          y: stageSize.height / 2 - canvasPos.y * stageScale,
        })
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, items, stageSize, stageScale, clipboard.mousePos, screenToCanvas, setStagePos, _setStageScale])

  // 9. Menu state hooks
  const contextMenuState = useMenuState<{ x: number; y: number; canvasX: number; canvasY: number }>()
  const modelMenu = useMenuState<string>()
  const imageGenModelMenu = useMenuState<string>()
  const htmlGenModelMenu = useMenuState<string>()
  const imageContextMenuState = useMenuState<{ imageId: string }>()
  const videoContextMenuState = useMenuState<{ videoId: string }>()
  const pdfContextMenuState = useMenuState<{ pdfId: string }>()
  const textFileContextMenuState = useMenuState<{ textFileId: string }>()
  const exportMenu = useMenuState<string>()

  // 10. Remaining UI state
  const [htmlItemTransforms, setHtmlItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [videoItemTransforms, setVideoItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [gifItemTransforms, setGifItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [editingHtmlLabelId, setEditingHtmlLabelId] = useState<string | null>(null)
  const htmlLabelInputRef = useRef<HTMLInputElement>(null)
  const [editingVideoLabelId, setEditingVideoLabelId] = useState<string | null>(null)
  const videoLabelInputRef = useRef<HTMLInputElement>(null)
  const [editingImageLabelId, setEditingImageLabelId] = useState<string | null>(null)
  const imageLabelInputRef = useRef<HTMLInputElement>(null)
  const [pdfItemTransforms, setPdfItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [editingPdfLabelId, setEditingPdfLabelId] = useState<string | null>(null)
  const pdfLabelInputRef = useRef<HTMLInputElement>(null)
  const [textFileItemTransforms, setTextFileItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [editingTextFileLabelId, setEditingTextFileLabelId] = useState<string | null>(null)
  const textFileLabelInputRef = useRef<HTMLInputElement>(null)
  // Cache fetched text file content (keyed by item src URL)
  const [textFileContents, setTextFileContents] = useState<Map<string, string>>(new Map())

  // Fetch text file content from React side (avoids CORS issues with srcdoc iframe)
  useEffect(() => {
    const textFileItems = items.filter((item) => item.type === 'text-file' && !(item as TextFileItem).minimized) as TextFileItem[]
    for (const item of textFileItems) {
      if (!textFileContents.has(item.id)) {
        // Mark as loading to avoid duplicate fetches
        setTextFileContents((prev) => {
          if (prev.has(item.id)) return prev
          const next = new Map(prev)
          next.set(item.id, '')
          return next
        })
        // Use content-data endpoint to proxy through backend (avoids S3 CORS)
        const fetchUrl = `/api/w/${ACTIVE_WORKSPACE}/scenes/${sceneId}/content-data?contentId=${item.id}&contentType=text-file`
        fetch(fetchUrl)
          .then((r) => r.text())
          .then((text) => {
            setTextFileContents((prev) => {
              const next = new Map(prev)
              next.set(item.id, text)
              return next
            })
          })
          .catch(() => {
            setTextFileContents((prev) => {
              const next = new Map(prev)
              next.set(item.id, 'Failed to load file.')
              return next
            })
          })
      }
    }
  }, [items, textFileContents, sceneId])

  // 11. Pulse animation hook
  const { pulsePhase } = usePulseAnimation({
    runningPromptIds,
    runningImageGenPromptIds,
    runningHtmlGenPromptIds,
    layerRef,
  })

  // 11b. GIF detection — identifies which image items are animated GIFs
  const gifIds = useGifAnimation(items)

  // 12. Transformer sync hook
  useTransformerSync({
    items,
    selectedIds,
    stageRef,
    transformers: [
      { type: 'text', ref: textTransformerRef },
      { type: 'image', ref: imageTransformerRef, excludeId: croppingImageId, childName: 'transform-target' },
      { type: 'video', ref: videoTransformerRef, childName: 'transform-target' },
      { type: 'prompt', ref: promptTransformerRef },
      { type: 'image-gen-prompt', ref: imageGenPromptTransformerRef },
      { type: 'html-gen-prompt', ref: htmlGenPromptTransformerRef },
      { type: 'html', ref: htmlTransformerRef },
      { type: 'pdf', ref: pdfTransformerRef, filterItem: (item) => item.type === 'pdf' && !item.minimized },
      { type: 'text-file', ref: textFileTransformerRef, filterItem: (item) => item.type === 'text-file' && !item.minimized },
    ],
  })

  // 13. Multi-select drag coordination (Layer-level handlers)
  const allTransformerRefs = [textTransformerRef, imageTransformerRef, videoTransformerRef, promptTransformerRef, imageGenPromptTransformerRef, htmlGenPromptTransformerRef, htmlTransformerRef, pdfTransformerRef, textFileTransformerRef]

  const handleLayerDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    // Guard: if already tracking a drag (e.g. Transformer started drag on
    // another node), ignore subsequent dragstart events
    if (multiDragRef.current) return

    const target = e.target
    const nodeId = target.id()
    if (!nodeId) return

    // Only track canvas items (not transformer anchors, etc.)
    const isCanvasItem = items.some(i => i.id === nodeId)
    if (!isCanvasItem) return

    const otherNodes: Array<{ id: string; node: Konva.Node; startX: number; startY: number }> = []
    const savedTransformerState = new Map<Konva.Transformer, Konva.Node[]>()

    // For multi-select drags, coordinate other selected items
    if (selectedIds.includes(nodeId) && selectedIds.length > 1) {
      // Temporarily detach other selected nodes from their Transformers to prevent
      // Konva's Transformer multi-drag from conflicting with our handler.
      for (const trRef of allTransformerRefs) {
        const tr = trRef.current
        if (!tr) continue
        const trNodes = tr.nodes()
        if (trNodes.length <= 1) continue
        const hasOtherSelected = trNodes.some(n => n.id() !== nodeId && selectedIds.includes(n.id()))
        if (!hasOtherSelected) continue
        savedTransformerState.set(tr, trNodes.slice())
        tr.nodes(trNodes.filter(n => n.id() === nodeId || !selectedIds.includes(n.id())))
      }

      for (const id of selectedIds) {
        if (id === nodeId) continue
        const node = stageRef.current?.findOne('#' + id) as Konva.Node | undefined
        if (node) {
          otherNodes.push({ id, node, startX: node.x(), startY: node.y() })
        }
      }
    }

    multiDragRef.current = {
      dragNodeId: nodeId,
      startNodeX: target.x(),
      startNodeY: target.y(),
      otherNodes,
      savedTransformerState,
    }
  }, [selectedIds, items])

  const handleLayerDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (!multiDragRef.current) return
    // Only process events from the original user-dragged node
    if (e.target.id() !== multiDragRef.current.dragNodeId) return
    const { startNodeX, startNodeY, otherNodes } = multiDragRef.current
    const dx = e.target.x() - startNodeX
    const dy = e.target.y() - startNodeY

    for (const { node, startX, startY } of otherNodes) {
      node.x(startX + dx)
      node.y(startY + dy)
    }

    // Update overlay transforms for videos, GIFs, and HTML items being moved
    for (const { id, node } of otherNodes) {
      const item = items.find(i => i.id === id)
      if (!item) continue

      if (item.type === 'video') {
        const scaleX = item.scaleX ?? 1
        const scaleY = item.scaleY ?? 1
        const headerHeight = selectedIds.includes(item.id) ? VIDEO_HEADER_HEIGHT / Math.max(1, stageScale) : 0
        setVideoItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(id, { x: node.x(), y: node.y() + headerHeight, width: item.width * scaleX, height: item.height * scaleY })
          return next
        })
      } else if (item.type === 'image' && gifIds.has(id)) {
        const scaleX = item.scaleX ?? 1
        const scaleY = item.scaleY ?? 1
        const headerHeight = selectedIds.includes(item.id) ? IMAGE_HEADER_HEIGHT / Math.max(1, stageScale) : 0
        setGifItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(id, { x: node.x(), y: node.y() + headerHeight, width: item.width * scaleX, height: item.height * scaleY })
          return next
        })
      } else if (item.type === 'html') {
        setHtmlItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(id, { x: node.x(), y: node.y(), width: item.width, height: item.height })
          return next
        })
      } else if (item.type === 'pdf' && !item.minimized) {
        setPdfItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(id, { x: node.x(), y: node.y(), width: item.width, height: item.height })
          return next
        })
      }
    }
  }, [items, selectedIds, stageScale, gifIds])

  const handleLayerDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (!multiDragRef.current) return
    // Only process events from the original user-dragged node
    if (e.target.id() !== multiDragRef.current.dragNodeId) return
    const { dragNodeId, startNodeX, startNodeY, otherNodes, savedTransformerState } = multiDragRef.current
    const dx = e.target.x() - startNodeX
    const dy = e.target.y() - startNodeY

    // Update other nodes' state (skipHistory — batch will handle it)
    for (const { id } of otherNodes) {
      const item = items.find(i => i.id === id)
      if (item) {
        onUpdateItem(id, { x: item.x + dx, y: item.y + dy }, true)
      }
    }

    // Build and push batch transform entry
    if (onBatchTransform && (dx !== 0 || dy !== 0)) {
      const entries: TransformEntry[] = []
      entries.push({
        objectId: dragNodeId,
        oldTransform: { x: startNodeX, y: startNodeY },
        newTransform: { x: e.target.x(), y: e.target.y() },
      })
      for (const { id, startX, startY } of otherNodes) {
        entries.push({
          objectId: id,
          oldTransform: { x: startX, y: startY },
          newTransform: { x: startX + dx, y: startY + dy },
        })
      }
      onBatchTransform(entries)
    }

    // Clean up overlay transforms
    setVideoItemTransforms((prev) => {
      const next = new Map(prev)
      for (const { id } of otherNodes) next.delete(id)
      return next
    })
    setGifItemTransforms((prev) => {
      const next = new Map(prev)
      for (const { id } of otherNodes) next.delete(id)
      return next
    })
    setHtmlItemTransforms((prev) => {
      const next = new Map(prev)
      for (const { id } of otherNodes) next.delete(id)
      return next
    })
    setPdfItemTransforms((prev) => {
      const next = new Map(prev)
      for (const { id } of otherNodes) next.delete(id)
      return next
    })

    // Restore Transformer nodes that were detached during drag
    for (const [tr, nodes] of savedTransformerState) {
      tr.nodes(nodes)
    }

    multiDragRef.current = null
  }, [items, onUpdateItem, onBatchTransform])

  // Wrapper that suppresses individual history entries during batch drags.
  // During an active drag (multiDragRef set), transform history is handled by
  // the batch in handleLayerDragEnd, so individual updates use skipHistory.
  const handleUpdateItem = useCallback((id: string, changes: Partial<CanvasItem>) => {
    if (multiDragRef.current) {
      onUpdateItem(id, changes, true)
    } else {
      onUpdateItem(id, changes)
    }
  }, [onUpdateItem])

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
        result.id,
        result.positionX,
        result.positionY,
        result.url,
        result.visualWidth,
        result.visualHeight,
        result.name,
        result.pixelWidth,
        result.pixelHeight,
        result.fileSize
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
        result.id,
        result.positionX,
        result.positionY,
        result.url,
        result.visualWidth,
        result.visualHeight,
        result.name,
        result.fileSize,
        result.pixelWidth,
        result.pixelHeight
      )
      endOperation()
    } catch (error) {
      console.error('Failed to duplicate video:', error)
      endOperation()
    }
  }, [sceneId, onAddVideoAt, isOffline, startOperation, endOperation])

  // Handle video → GIF conversion
  const handleConvertVideoToGif = useCallback(async (videoItem: VideoItem) => {
    // Compute placeholder position (same logic as convertToGif in sceneOperations)
    const scaleX = videoItem.scaleX ?? 1
    const scaleY = videoItem.scaleY ?? 1
    const visualWidth = Math.round(videoItem.width * scaleX)
    const visualHeight = Math.round(videoItem.height * scaleY)
    const gap = 20
    const placeholderId = videoItem.id + '_converting'
    const placeholder = {
      id: placeholderId,
      x: videoItem.x + visualWidth + gap,
      y: videoItem.y,
      width: visualWidth,
      height: visualHeight,
      name: (videoItem.name || 'Video') + ' → GIF',
    }
    setConversionPlaceholders(prev => [...prev, placeholder])
    try {
      startOperation()
      const result = await convertToGif(sceneId, videoItem)
      onAddImageAt(
        result.id,
        result.positionX,
        result.positionY,
        result.url,
        result.visualWidth,
        result.visualHeight,
        result.name,
        result.pixelWidth,
        result.pixelHeight,
        result.fileSize
      )
      endOperation()
    } catch (error) {
      console.error('Failed to convert video to GIF:', error)
      endOperation()
    } finally {
      setConversionPlaceholders(prev => prev.filter(p => p.id !== placeholderId))
    }
  }, [sceneId, onAddImageAt, startOperation, endOperation])

  // Handle GIF → video conversion
  const handleConvertGifToVideo = useCallback(async (imageItem: ImageItem) => {
    // Compute placeholder position (same logic as convertToVideo in sceneOperations)
    const scaleX = imageItem.scaleX ?? 1
    const scaleY = imageItem.scaleY ?? 1
    const visualWidth = Math.round(imageItem.width * scaleX)
    const visualHeight = Math.round(imageItem.height * scaleY)
    const gap = 20
    const placeholderId = imageItem.id + '_converting'
    const placeholder = {
      id: placeholderId,
      x: imageItem.x + visualWidth + gap,
      y: imageItem.y,
      width: visualWidth,
      height: visualHeight,
      name: (imageItem.name || 'Image') + ' → Video',
    }
    setConversionPlaceholders(prev => [...prev, placeholder])
    try {
      startOperation()
      const result = await convertToVideo(sceneId, imageItem)
      onAddVideoAt(
        result.id,
        result.positionX,
        result.positionY,
        result.url,
        result.visualWidth,
        result.visualHeight,
        result.name,
        result.fileSize,
        result.pixelWidth,
        result.pixelHeight
      )
      endOperation()
    } catch (error) {
      console.error('Failed to convert GIF to video:', error)
      endOperation()
    } finally {
      setConversionPlaceholders(prev => prev.filter(p => p.id !== placeholderId))
    }
  }, [sceneId, onAddVideoAt, startOperation, endOperation])

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
        // Reject images larger than 25MB to prevent memory exhaustion
        if (file.size > 25 * 1024 * 1024) {
          console.warn(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB), max 25MB`)
          continue
        }
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
            // Generate item ID upfront so it matches the uploaded file
            const itemId = uuidv4()
            try {
              // Upload to S3 immediately to avoid storing large data URLs in memory
              startOperation()
              const s3Url = await uploadImage(dataUrl, sceneId, itemId, fileName || `dropped-${Date.now()}.png`)
              endOperation()
              // Offset multiple files so they don't stack exactly
              onAddImageAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, s3Url, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
            } catch (err) {
              endOperation()
              console.error('Failed to upload image, using data URL:', err)
              // Fallback to data URL if upload fails
              onAddImageAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
            }
          }
          img.src = dataUrl
        }
        reader.readAsDataURL(file)
        offsetIndex++
      }
      // Handle video files (if video support is enabled)
      else if (isVideoFile(file) && config.features.videoSupport) {
        if (onUploadVideoAt) {
          onUploadVideoAt(file, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20)
        }
        offsetIndex++
      }
      // Handle PDF files
      else if (file.type === 'application/pdf' && onAddPdfAt) {
        const reader = new FileReader()
        const fileName = file.name
        const fileSize = file.size
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string
          const itemId = uuidv4()
          const name = fileName.replace(/\.[^/.]+$/, '')
          try {
            startOperation()
            const s3Url = await uploadPdf(dataUrl, sceneId, itemId, fileName || `document-${Date.now()}.pdf`)
            let thumbnailSrc: string | undefined
            try {
              const proxyUrl = `/api/w/${ACTIVE_WORKSPACE}/scenes/${sceneId}/content-data?contentId=${itemId}&contentType=pdf`
              const thumb = await renderPdfPageToDataUrl(proxyUrl, 1, PDF_MINIMIZED_HEIGHT * 4)
              thumbnailSrc = await uploadPdfThumbnail(thumb.dataUrl, sceneId, itemId)
            } catch (thumbErr) {
              console.error('Failed to generate/upload PDF thumbnail:', thumbErr)
            }
            endOperation()
            onAddPdfAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, s3Url, 600, 700, name, fileSize, thumbnailSrc)
          } catch (err) {
            endOperation()
            console.error('Failed to upload PDF, using data URL:', err)
            onAddPdfAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, dataUrl, 600, 700, name, fileSize)
          }
        }
        reader.readAsDataURL(file)
        offsetIndex++
      }
      // Handle text files
      else if (onAddTextFileAt && (file.type === 'text/plain' || file.type === 'text/csv' || TEXT_FILE_EXTENSION_PATTERN.test(file.name))) {
        const reader = new FileReader()
        const fileName = file.name
        const fileSize = file.size
        const fileFormat = getTextFileFormat(fileName) || 'txt'
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string
          const itemId = uuidv4()
          const name = fileName
          try {
            startOperation()
            const s3Url = await uploadTextFile(dataUrl, sceneId, itemId, fileName || `document-${Date.now()}.${fileFormat}`, fileFormat)
            endOperation()
            onAddTextFileAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, s3Url, 600, 500, name, fileSize, fileFormat)
          } catch (err) {
            endOperation()
            console.error('Failed to upload text file, using data URL:', err)
            onAddTextFileAt(itemId, canvasPos.x + offsetIndex * 20, canvasPos.y + offsetIndex * 20, dataUrl, 600, 500, name, fileSize, fileFormat)
          }
        }
        reader.readAsDataURL(file)
        offsetIndex++
      }
    }
  }

  // Handle right-click context menu (suppressed when right-drag panned)
  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault()
    if (rightMouseDidDragRef.current) return

    const stage = stageRef.current
    if (!stage) return

    const canvasPos = screenToCanvas(e.evt.clientX, e.evt.clientY)
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

  // PDF item label editing handlers
  const handlePdfLabelDblClick = (id: string) => {
    setEditingPdfLabelId(id)
    setTimeout(() => {
      pdfLabelInputRef.current?.focus()
      pdfLabelInputRef.current?.select()
    }, 0)
  }

  const handlePdfLabelBlur = () => {
    if (editingPdfLabelId && pdfLabelInputRef.current) {
      onUpdateItem(editingPdfLabelId, { name: pdfLabelInputRef.current.value })
    }
    setEditingPdfLabelId(null)
  }

  const handlePdfLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingPdfLabelId(null)
    } else if (e.key === 'Enter') {
      handlePdfLabelBlur()
    }
  }

  const getEditingPdfItem = (): PdfItem | null => {
    if (!editingPdfLabelId) return null
    const item = items.find((i) => i.id === editingPdfLabelId)
    if (!item || item.type !== 'pdf') return null
    return item
  }
  const editingPdfItem = getEditingPdfItem()

  const handleTogglePdfMinimized = useCallback((id: string) => {
    onTogglePdfMinimized?.(id)
  }, [onTogglePdfMinimized])

  // Text file item label editing handlers
  const handleTextFileLabelDblClick = (id: string) => {
    setEditingTextFileLabelId(id)
    setTimeout(() => {
      textFileLabelInputRef.current?.focus()
      textFileLabelInputRef.current?.select()
    }, 0)
  }

  const handleTextFileLabelBlur = () => {
    if (editingTextFileLabelId && textFileLabelInputRef.current) {
      onUpdateItem(editingTextFileLabelId, { name: textFileLabelInputRef.current.value })
    }
    setEditingTextFileLabelId(null)
  }

  const handleTextFileLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingTextFileLabelId(null)
    } else if (e.key === 'Enter') {
      handleTextFileLabelBlur()
    }
  }

  const getEditingTextFileItem = (): TextFileItem | null => {
    if (!editingTextFileLabelId) return null
    const item = items.find((i) => i.id === editingTextFileLabelId)
    if (!item || item.type !== 'text-file') return null
    return item
  }
  const editingTextFileItem = getEditingTextFileItem()

  const handleToggleTextFileMinimized = useCallback((id: string) => {
    onToggleTextFileMinimized?.(id)
  }, [onToggleTextFileMinimized])

  const handleToggleTextFileMono = useCallback((id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item || item.type !== 'text-file') return
    onUpdateItem(id, { fontMono: !(item.fontMono ?? false) } as Partial<CanvasItem>, true)
  }, [items, onUpdateItem])

  const handleChangeTextFileFontSize = useCallback((id: string, delta: number) => {
    const item = items.find((i) => i.id === id)
    if (!item || item.type !== 'text-file') return
    const currentSize = item.fontSize ?? 14
    const newSize = Math.max(8, Math.min(48, currentSize + delta))
    onUpdateItem(id, { fontSize: newSize } as Partial<CanvasItem>, true)
  }, [items, onUpdateItem])

  const handleToggleTextFileViewType = useCallback((id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item || item.type !== 'text-file') return
    const current = item.viewType ?? (item.fileFormat === 'csv' ? 'table' : 'raw')
    onUpdateItem(id, { viewType: current === 'table' ? 'raw' : 'table' } as Partial<CanvasItem>, true)
  }, [items, onUpdateItem])

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
    <div ref={containerRef} style={{ position: 'relative', flex: 1, backgroundColor: '#555555' }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
      <Layer ref={layerRef} onDragStart={handleLayerDragStart} onDragMove={handleLayerDragMove} onDragEnd={handleLayerDragEnd}>
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
                onUpdateItem={handleUpdateItem}
              />
            )
          } else if (item.type === 'image') {
            // Hide the image item when it's being cropped
            if (croppingImageId === item.id) return null
            const img = loadedImages.get(item.src)
            if (!img) return null
            const itemIsGif = gifIds.has(item.id)
            return (
              <ImageItemRenderer
                key={item.id}
                item={item}
                image={img}
                isSelected={selectedIds.includes(item.id)}
                isGif={itemIsGif}
                editingImageLabelId={editingImageLabelId}
                onItemClick={handleItemClick}
                onContextMenu={(e, id) => {
                  if (rightMouseDidDragRef.current) return
                  imageContextMenuState.openMenu(
                    { imageId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={handleUpdateItem}
                onLabelDblClick={handleImageLabelDblClick}
                setGifItemTransforms={itemIsGif ? setGifItemTransforms : undefined}
                stageScale={stageScale}
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
                  if (rightMouseDidDragRef.current) return
                  videoContextMenuState.openMenu(
                    { videoId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={handleUpdateItem}
                onLabelDblClick={handleVideoLabelDblClick}
                setVideoItemTransforms={setVideoItemTransforms}
                stageScale={stageScale}
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
                onUpdateItem={handleUpdateItem}
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
                onUpdateItem={handleUpdateItem}
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
                onUpdateItem={handleUpdateItem}
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
                onUpdateItem={handleUpdateItem}
                onLabelDblClick={handleHtmlLabelDblClick}
                setHtmlItemTransforms={setHtmlItemTransforms}
                setIsViewportTransforming={setIsViewportTransforming}
              />
            )
          } else if (item.type === 'pdf') {
            return (
              <PdfItemRenderer
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                editingPdfLabelId={editingPdfLabelId}
                onItemClick={handleItemClick}
                onContextMenu={(e, id) => {
                  if (rightMouseDidDragRef.current) return
                  pdfContextMenuState.openMenu(
                    { pdfId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={handleUpdateItem}
                onLabelDblClick={handlePdfLabelDblClick}
                onToggleMinimized={handleTogglePdfMinimized}
                setPdfItemTransforms={setPdfItemTransforms}
                setIsViewportTransforming={setIsViewportTransforming}
              />
            )
          } else if (item.type === 'text-file') {
            return (
              <TextFileItemRenderer
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                editingTextFileLabelId={editingTextFileLabelId}
                onItemClick={handleItemClick}
                onContextMenu={(e, id) => {
                  if (rightMouseDidDragRef.current) return
                  textFileContextMenuState.openMenu(
                    { textFileId: id },
                    { x: e.evt.clientX, y: e.evt.clientY },
                  )
                }}
                onUpdateItem={handleUpdateItem}
                onLabelDblClick={handleTextFileLabelDblClick}
                onToggleMinimized={handleToggleTextFileMinimized}
                onToggleMono={handleToggleTextFileMono}
                onChangeFontSize={handleChangeTextFileFontSize}
                onToggleViewType={handleToggleTextFileViewType}
                setTextFileItemTransforms={setTextFileItemTransforms}
                setIsViewportTransforming={setIsViewportTransforming}
              />
            )
          }
          return null
        })}

        {/* Video upload placeholders */}
        {videoPlaceholders?.map((ph) => (
          <Group key={`placeholder-${ph.id}`} x={ph.x} y={ph.y}>
            <Rect
              width={ph.width}
              height={ph.height}
              fill="#1a1a2e"
              stroke="#666"
              strokeWidth={2}
              dash={[10, 5]}
              cornerRadius={4}
            />
            <Text
              text={`Uploading ${ph.name}...`}
              width={ph.width}
              height={ph.height}
              align="center"
              verticalAlign="middle"
              fill="#888"
              fontSize={16}
            />
          </Group>
        ))}

        {/* Conversion placeholders (video→GIF, GIF→video) */}
        {conversionPlaceholders.map((ph) => (
          <Group key={`conversion-${ph.id}`} x={ph.x} y={ph.y}>
            <Rect
              width={ph.width}
              height={ph.height}
              fill="#1a1a2e"
              stroke="#666"
              strokeWidth={2}
              dash={[10, 5]}
              cornerRadius={4}
            />
            <Text
              text={`Converting ${ph.name}...`}
              width={ph.width}
              height={ph.height}
              align="center"
              verticalAlign="middle"
              fill="#888"
              fontSize={16}
            />
          </Group>
        ))}

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
        {/* Transformer for PDFs - free resize, no rotation */}
        <Transformer
          ref={pdfTransformerRef}
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
        {/* Transformer for text files - free resize, no rotation */}
        <Transformer
          ref={textFileTransformerRef}
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
          const isSelected = selectedIds.includes(item.id)
          // Allow iframe interaction when selected and not dragging
          const iframeInteractive = isSelected && !isAnyDragActive
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
                // Let clicks/wheel pass through to Konva canvas when not selected or dragging
                pointerEvents: iframeInteractive ? 'auto' : 'none',
              }}
            >
              <iframe
                srcDoc={item.html}
                sandbox="allow-same-origin"
                style={{
                  width: (width * stageScale) / zoom,
                  height: (height * stageScale) / zoom,
                  border: 'none',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  pointerEvents: iframeInteractive ? 'auto' : 'none',
                  background: '#fff',
                }}
              />
            </div>
          )
        })}

      {/* PDF iframe overlays */}
      {!isViewportTransforming && items
        .filter((item) => item.type === 'pdf' && !(item as PdfItem).minimized)
        .map((item) => {
          if (item.type !== 'pdf') return null
          const transform = pdfItemTransforms.get(item.id)
          const x = transform?.x ?? item.x
          const y = transform?.y ?? item.y
          const width = transform?.width ?? item.width
          const height = transform?.height ?? item.height
          const isSelected = selectedIds.includes(item.id)
          const isDragging = !!transform
          const iframeInteractive = isSelected && !isAnyDragActive && !isDragging
          return (
            <div
              key={`pdf-${item.id}`}
              style={{
                position: 'absolute',
                top: (y + PDF_HEADER_HEIGHT) * stageScale + stagePos.y,
                left: x * stageScale + stagePos.x,
                width: width * stageScale,
                height: height * stageScale,
                overflow: 'hidden',
                borderRadius: '0 0 4px 4px',
                zIndex: Z_IFRAME_OVERLAY,
                pointerEvents: iframeInteractive ? 'auto' : 'none',
              }}
            >
              <iframe
                src={`${item.src}#navpanes=0&toolbar=1&view=FitH`}
                style={{
                  width: width * stageScale,
                  height: height * stageScale,
                  border: 'none',
                  pointerEvents: iframeInteractive ? 'auto' : 'none',
                  background: '#fff',
                }}
              />
            </div>
          )
        })}

      {/* Text file iframe overlays */}
      {!isViewportTransforming && items
        .filter((item) => item.type === 'text-file' && !(item as TextFileItem).minimized)
        .map((item) => {
          if (item.type !== 'text-file') return null
          const transform = textFileItemTransforms.get(item.id)
          const x = transform?.x ?? item.x
          const y = transform?.y ?? item.y
          const width = transform?.width ?? item.width
          const height = transform?.height ?? item.height
          const isItemSelected = selectedIds.includes(item.id)
          const isDragging = !!transform
          const iframeInteractive = isItemSelected && !isAnyDragActive && !isDragging
          const fontMono = item.fontMono ?? false
          const fontSize = item.fontSize ?? 14
          const textContent = textFileContents.get(item.id) ?? ''
          const effectiveViewType = item.fileFormat === 'csv' && (item.viewType ?? 'table') === 'table' ? 'table' : 'raw'

          let srcdoc: string
          if (effectiveViewType === 'table' && textContent) {
            const rows = parseCsv(textContent)
            const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            const headerRow = rows[0] || []
            const bodyRows = rows.slice(1)
            const thead = `<thead><tr>${headerRow.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
            const tbody = `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
            srcdoc = `<html><head><style>body{margin:0;font-family:${fontMono ? 'monospace' : 'system-ui,sans-serif'};font-size:${fontSize}px;color:#333;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left;white-space:nowrap;}th{background:#f0f0f0;font-weight:bold;position:sticky;top:0;}tr:hover{background:#f8f8f8;}</style></head><body><table>${thead}${tbody}</table></body></html>`
          } else {
            // Raw text view
            const escapedContent = textContent
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
            srcdoc = `<html><head><style>body{margin:8px;font-family:${fontMono ? 'monospace' : 'system-ui,sans-serif'};font-size:${fontSize}px;white-space:pre-wrap;word-wrap:break-word;color:#333;}</style></head><body>${escapedContent || 'Loading...'}</body></html>`
          }
          return (
            <div
              key={`textfile-${item.id}-${fontMono}-${fontSize}-${effectiveViewType}`}
              style={{
                position: 'absolute',
                top: (y + TEXTFILE_HEADER_HEIGHT) * stageScale + stagePos.y,
                left: x * stageScale + stagePos.x,
                width: width * stageScale,
                height: height * stageScale,
                overflow: 'hidden',
                borderRadius: '0 0 4px 4px',
                zIndex: Z_IFRAME_OVERLAY,
                pointerEvents: iframeInteractive ? 'auto' : 'none',
              }}
            >
              <iframe
                srcDoc={srcdoc}
                style={{
                  width: width * stageScale,
                  height: height * stageScale,
                  border: 'none',
                  pointerEvents: iframeInteractive ? 'auto' : 'none',
                  background: '#fff',
                }}
              />
            </div>
          )
        })}

      {/* GIF image overlays */}
      {items
        .filter((item) => item.type === 'image' && gifIds.has(item.id))
        .map((item) => {
          if (item.type !== 'image') return null
          if (croppingImageId === item.id) return null
          const transform = gifItemTransforms.get(item.id)
          return (
            <GifOverlay
              key={`gif-${item.id}`}
              item={item}
              stageScale={stageScale}
              stagePos={stagePos}
              isSelected={selectedIds.includes(item.id)}
              transform={transform}
            />
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

      {/* Processing overlay for GIF crop */}
      {processingImageId && gifIds.has(processingImageId) && (() => {
        const imageItem = items.find((i) => i.id === processingImageId && i.type === 'image') as ImageItem | undefined
        if (!imageItem) return null
        const scaleX = imageItem.scaleX ?? 1
        const scaleY = imageItem.scaleY ?? 1
        return (
          <ProcessingOverlay
            x={imageItem.x}
            y={imageItem.y}
            width={imageItem.width * scaleX}
            height={imageItem.height * scaleY}
            stageScale={stageScale}
            stagePos={stagePos}
            message="Processing GIF..."
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

      {/* PDF label editing overlay */}
      {editingPdfItem && (
        <PdfLabelEditingOverlay
          item={editingPdfItem}
          inputRef={pdfLabelInputRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handlePdfLabelBlur}
          onKeyDown={handlePdfLabelKeyDown}
        />
      )}

      {/* Text file label editing overlay */}
      {editingTextFileItem && (
        <TextFileLabelEditingOverlay
          item={editingTextFileItem}
          inputRef={textFileLabelInputRef}
          stageScale={stageScale}
          stagePos={stagePos}
          onBlur={handleTextFileLabelBlur}
          onKeyDown={handleTextFileLabelKeyDown}
        />
      )}

      {/* Context menu */}
      {contextMenuState.menuPosition && (
        <CanvasContextMenu
          position={contextMenuState.menuPosition}
          canvasPosition={contextMenuState.menuData ? { x: contextMenuState.menuData.canvasX, y: contextMenuState.menuData.canvasY } : undefined}
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
          onConvertToVideo={handleConvertGifToVideo}
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
          onConvertToGif={handleConvertVideoToGif}
          onClose={videoContextMenuState.closeMenu}
        />
      )}

      {/* PDF context menu */}
      {pdfContextMenuState.menuData && pdfContextMenuState.menuPosition && (
        <PdfContextMenu
          position={pdfContextMenuState.menuPosition}
          pdfItem={items.find((i) => i.id === pdfContextMenuState.menuData!.pdfId && i.type === 'pdf') as import('../types').PdfItem | undefined}
          sceneId={sceneId}
          isOffline={isOffline}
          onClose={pdfContextMenuState.closeMenu}
        />
      )}

      {/* TextFile context menu */}
      {textFileContextMenuState.menuData && textFileContextMenuState.menuPosition && (
        <TextFileContextMenu
          position={textFileContextMenuState.menuPosition}
          textFileItem={items.find((i) => i.id === textFileContextMenuState.menuData!.textFileId && i.type === 'text-file') as import('../types').TextFileItem | undefined}
          sceneId={sceneId}
          isOffline={isOffline}
          onClose={textFileContextMenuState.closeMenu}
        />
      )}

      {/* Export menu */}
      {exportMenu.menuData && exportMenu.menuPosition && (() => {
        const htmlItem = items.find((i) => i.id === exportMenu.menuData && i.type === 'html')
        if (!htmlItem || htmlItem.type !== 'html') return null
        // Build image name map and image id map from canvas items for export
        const imageNameMap = new Map<string, string>()
        const imageIdMap = new Map<string, string>()
        const cropSrcSet = new Set<string>()
        items.forEach((item) => {
          if (item.type === 'image') {
            if (item.name) {
              imageNameMap.set(item.src, item.name)
              if (item.cropSrc) imageNameMap.set(item.cropSrc, item.name)
            }
            imageIdMap.set(item.src, item.id)
            if (item.cropSrc) {
              imageIdMap.set(item.cropSrc, item.id)
              cropSrcSet.add(item.cropSrc)
            }
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
            cropSrcSet={cropSrcSet}
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
})

export default InfiniteCanvas
