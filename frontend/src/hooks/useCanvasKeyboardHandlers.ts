import { useEffect } from 'react'
import Konva from 'konva'
import { CanvasItem, ImageItem, VideoItem, TextFileItem, CodingRobotItem } from '../types'
import { TEXTFILE_HEADER_HEIGHT, CODING_ROBOT_HEADER_HEIGHT, CODING_ROBOT_ACTIVITY_PANEL_WIDTH, CODING_ROBOT_ACTIVITY_PANEL_GAP } from '../constants/canvas'

interface UseKeyboardHandlersProps {
  // Editing state
  isEditing: boolean
  editingTextId: string | null
  setEditingTextId: (id: string | null) => void

  // Selection
  selectedIds: string[]
  items: CanvasItem[]
  onSelectItems: (ids: string[]) => void

  // Crop mode
  croppingImageId: string | null
  croppingVideoId: string | null
  setCroppingImageId: (id: string | null) => void
  setPendingCropRect: (rect: { x: number; y: number; width: number; height: number }) => void
  applyCrop: () => void
  applyOrCancelVideoCrop: () => void
  startVideoCrop: (
    id: string,
    cropRect: { x: number; y: number; width: number; height: number },
    speedFactor: number,
    removeAudio: boolean,
    trim: boolean,
    trimStart: number,
    trimEnd: number
  ) => void

  // Images
  loadedImages: Map<string, HTMLImageElement>

  // Canvas utilities
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  mousePos: { x: number; y: number }

  // Text operations
  onAddTextAt: (x: number, y: number, text: string, optWidth?: number, topLeft?: boolean) => string
  onUpdateItem: (id: string, changes: Partial<CanvasItem>, skipHistory?: boolean) => void
  textareaRef: React.RefObject<HTMLTextAreaElement>

  // Download
  sceneId: string

  // Viewport
  stageSize: { width: number; height: number }
  stageScale: number
  setStagePos: (pos: { x: number; y: number }) => void
  _setStageScale: (scale: number) => void

  // Prompts
  onAddPrompt?: (x?: number, y?: number) => string
  onAddImageGenPrompt?: (x?: number, y?: number) => string
  promptEditing: {
    handleTextDblClick: (id: string) => void
    handleLabelDblClick: (id: string) => void
  }
  imageGenPromptEditing: {
    handleTextDblClick: (id: string) => void
    handleLabelDblClick: (id: string) => void
  }
  htmlGenPromptEditing: {
    handleTextDblClick: (id: string) => void
    handleLabelDblClick: (id: string) => void
  }

  // Label editing
  onStartLabelEdit: (id: string, type: CanvasItem['type']) => void

  // Quick prompt
  onOpenQuickPrompt: (mode: 'prompt' | 'image-gen-prompt', screenPos: { x: number; y: number }, canvasPos: { x: number; y: number }) => void
}

/**
 * Custom hook that manages all document-level keyboard event handlers for the canvas
 */
export function useCanvasKeyboardHandlers(props: UseKeyboardHandlersProps) {
  const {
    isEditing,
    setEditingTextId,
    selectedIds,
    items,
    onSelectItems,
    croppingImageId,
    croppingVideoId,
    setCroppingImageId,
    setPendingCropRect,
    applyCrop,
    applyOrCancelVideoCrop,
    startVideoCrop,
    loadedImages,
    screenToCanvas,
    mousePos,
    onAddTextAt,
    onUpdateItem,
    textareaRef,
    sceneId,
    stageSize,
    stageScale,
    setStagePos,
    _setStageScale,
    onAddPrompt,
    onAddImageGenPrompt,
    promptEditing,
    imageGenPromptEditing,
    htmlGenPromptEditing,
    onStartLabelEdit,
    onOpenQuickPrompt,
  } = props

  // 'T' hotkey to create and edit text block at cursor, or edit selected text
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
          const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
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
  }, [isEditing, selectedIds, items, screenToCanvas, mousePos, onAddTextAt, onSelectItems, onUpdateItem, setEditingTextId, textareaRef])

  // 'E' hotkey to enter edit/crop mode on selected image, video, or text
  // Also applies/confirms edits when already in crop mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return
      if (e.key !== 'e' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      // If already in crop mode, apply and exit
      if (croppingImageId) {
        e.preventDefault()
        applyCrop()
        return
      }
      if (croppingVideoId) {
        e.preventDefault()
        applyOrCancelVideoCrop()
        return
      }

      if (isEditing) return
      if (selectedIds.length !== 1) return

      const selectedItem = items.find(item => item.id === selectedIds[0])
      if (!selectedItem) return

      if (selectedItem.type === 'image') {
        e.preventDefault()
        const img = loadedImages.get((selectedItem as ImageItem).src)
        if (!img) return
        const natW = img.naturalWidth
        const natH = img.naturalHeight
        const initialCrop = (selectedItem as ImageItem).cropRect
          ? { ...(selectedItem as ImageItem).cropRect! }
          : { x: 0, y: 0, width: natW, height: natH }
        setCroppingImageId(selectedItem.id)
        setPendingCropRect(initialCrop)
      } else if (selectedItem.type === 'video') {
        e.preventDefault()
        const videoItem = selectedItem as VideoItem
        const origW = videoItem.originalWidth ?? videoItem.width
        const origH = videoItem.originalHeight ?? videoItem.height
        const initialCrop = videoItem.cropRect ?? { x: 0, y: 0, width: origW, height: origH }
        startVideoCrop(
          videoItem.id, initialCrop,
          videoItem.speedFactor ?? 1,
          videoItem.removeAudio ?? false,
          videoItem.trim ?? false,
          videoItem.trimStart ?? 0,
          videoItem.trimEnd ?? 0,
        )
      } else if (selectedItem.type === 'text') {
        e.preventDefault()
        setEditingTextId(selectedItem.id)
        setTimeout(() => {
          textareaRef.current?.focus()
          textareaRef.current?.select()
        }, 0)
      } else if (selectedItem.type === 'prompt') {
        e.preventDefault()
        promptEditing.handleTextDblClick(selectedItem.id)
      } else if (selectedItem.type === 'image-gen-prompt') {
        e.preventDefault()
        imageGenPromptEditing.handleTextDblClick(selectedItem.id)
      } else if (selectedItem.type === 'html-gen-prompt') {
        e.preventDefault()
        htmlGenPromptEditing.handleTextDblClick(selectedItem.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, selectedIds, items, loadedImages, setCroppingImageId, setPendingCropRect, startVideoCrop, croppingImageId, croppingVideoId, applyCrop, applyOrCancelVideoCrop, setEditingTextId, textareaRef, promptEditing, imageGenPromptEditing, htmlGenPromptEditing])

  // F2 hotkey to start label editing on the selected item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return
      if (e.key !== 'F2' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (isEditing) return
      if (selectedIds.length !== 1) return

      const selectedItem = items.find(item => item.id === selectedIds[0])
      if (!selectedItem) return

      const type = selectedItem.type
      if (type === 'image' || type === 'video' || type === 'pdf' || type === 'text-file') {
        e.preventDefault()
        onStartLabelEdit(selectedItem.id, type)
      } else if (type === 'prompt') {
        e.preventDefault()
        promptEditing.handleLabelDblClick(selectedItem.id)
      } else if (type === 'image-gen-prompt') {
        e.preventDefault()
        imageGenPromptEditing.handleLabelDblClick(selectedItem.id)
      } else if (type === 'html-gen-prompt') {
        e.preventDefault()
        htmlGenPromptEditing.handleLabelDblClick(selectedItem.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, selectedIds, items, onStartLabelEdit, promptEditing, imageGenPromptEditing, htmlGenPromptEditing])

  // Ctrl+D hotkey to download selected items (image, video, text-file, pdf)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return
      if (!(e.key === 'd' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey)) return
      e.preventDefault()
      if (selectedIds.length === 0) return

      const { downloadSelectedItems } = await import('../utils/downloadItem')
      downloadSelectedItems(items, selectedIds, sceneId).catch(error => {
        console.error('Failed to download items:', error)
      })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, items, sceneId])

  // Viewport hotkeys: Shift+V = fit-to-view, C = center at cursor, Shift+C = fit-to-view at 100%
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
        const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
        setStagePos({
          x: stageSize.width / 2 - canvasPos.x * stageScale,
          y: stageSize.height / 2 - canvasPos.y * stageScale,
        })
        return
      }

      // F: center viewport on selection bounding box
      // Shift+F: fit selection to screen (zoom so selection fills 90% of viewport)
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selectedIds.length === 0) return
        e.preventDefault()
        const selectedItems = items.filter(i => selectedIds.includes(i.id))
        if (selectedItems.length === 0) return

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const item of selectedItems) {
          const w = item.width * ((item as ImageItem).scaleX ?? 1)
          let h = item.height * ((item as ImageItem).scaleY ?? 1)
          // TextFile and CodingRobot items have a header rendered above the content area
          if (item.type === 'text-file' && !(item as TextFileItem).minimized) {
            h += TEXTFILE_HEADER_HEIGHT
          }
          if (item.type === 'coding-robot') {
            h += CODING_ROBOT_HEADER_HEIGHT
          }
          minX = Math.min(minX, item.x)
          minY = Math.min(minY, item.y)
          maxX = Math.max(maxX, item.x + w)
          maxY = Math.max(maxY, item.y + h)
          // CodingRobot activity panel extends to the right of the main item
          if (item.type === 'coding-robot' && (item as CodingRobotItem).showActivity) {
            const panelWidth = (item as CodingRobotItem).activityPanelWidth ?? CODING_ROBOT_ACTIVITY_PANEL_WIDTH
            maxX = Math.max(maxX, item.x + w + CODING_ROBOT_ACTIVITY_PANEL_GAP + panelWidth)
          }
        }
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        if (e.shiftKey) {
          // Shift+F: zoom to fit selection at 90% of viewport
          const contentWidth = maxX - minX
          const contentHeight = maxY - minY
          const scale = Math.min(
            (stageSize.width * 0.9) / contentWidth,
            (stageSize.height * 0.9) / contentHeight,
            5,
          )
          _setStageScale(scale)
          setStagePos({
            x: stageSize.width / 2 - centerX * scale,
            y: stageSize.height / 2 - centerY * scale,
          })
        } else {
          // F: center on selection without changing zoom
          setStagePos({
            x: stageSize.width / 2 - centerX * stageScale,
            y: stageSize.height / 2 - centerY * stageScale,
          })
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, items, selectedIds, stageSize, stageScale, mousePos, screenToCanvas, setStagePos, _setStageScale])

  // 'Y' hotkey to create prompt at cursor, Shift+Y for image-gen prompt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }
      if (isEditing) return

      // Shift+Y: create image-gen prompt at cursor
      if (e.key === 'Y' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
        const newId = onAddImageGenPrompt?.(canvasPos.x, canvasPos.y)
        if (newId) {
          setTimeout(() => {
            onSelectItems([newId])
            imageGenPromptEditing.handleTextDblClick(newId)
          }, 20)
        }
        return
      }

      // y: create prompt at cursor
      if (e.key === 'y' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
        const newId = onAddPrompt?.(canvasPos.x, canvasPos.y)
        if (newId) {
          setTimeout(() => {
            onSelectItems([newId])
            promptEditing.handleTextDblClick(newId)
          }, 20)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, screenToCanvas, mousePos, onAddPrompt, onAddImageGenPrompt, onSelectItems, promptEditing, imageGenPromptEditing])

  // 'Q' hotkey to open quick prompt, Shift+Q for quick image-gen prompt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return
      if (isEditing) return

      if (e.key === 'Q' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
        onOpenQuickPrompt('image-gen-prompt', { x: mousePos.x, y: mousePos.y }, canvasPos)
        return
      }

      if (e.key === 'q' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const canvasPos = screenToCanvas(mousePos.x, mousePos.y)
        onOpenQuickPrompt('prompt', { x: mousePos.x, y: mousePos.y }, canvasPos)
        return
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, screenToCanvas, mousePos, onOpenQuickPrompt])
}

/**
 * React keyboard event handlers for input elements
 */
export const keyboardHandlers = {
  /**
   * Handles keyboard events for text textarea editing
   */
  handleTextareaKeyDown: (
    e: React.KeyboardEvent,
    editingTextId: string | null,
    textareaRef: React.RefObject<HTMLTextAreaElement>,
    onUpdateItem: (id: string, changes: Partial<CanvasItem>, skipHistory?: boolean) => void,
    setEditingTextId: (id: string | null) => void
  ) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter commits text
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
  },

  /**
   * Handles keyboard events for HTML label editing
   */
  handleHtmlLabelKeyDown: (
    e: React.KeyboardEvent,
    setEditingHtmlLabelId: (id: string | null) => void,
    handleHtmlLabelBlur: () => void
  ) => {
    if (e.key === 'Escape') {
      setEditingHtmlLabelId(null)
    } else if (e.key === 'Enter') {
      handleHtmlLabelBlur()
    }
  },

  /**
   * Handles keyboard events for video label editing
   */
  handleVideoLabelKeyDown: (
    e: React.KeyboardEvent,
    setEditingVideoLabelId: (id: string | null) => void,
    handleVideoLabelBlur: () => void
  ) => {
    if (e.key === 'Escape') {
      setEditingVideoLabelId(null)
    } else if (e.key === 'Enter') {
      handleVideoLabelBlur()
    }
  },

  /**
   * Handles keyboard events for image label editing
   */
  handleImageLabelKeyDown: (
    e: React.KeyboardEvent,
    setEditingImageLabelId: (id: string | null) => void,
    handleImageLabelBlur: () => void
  ) => {
    if (e.key === 'Escape') {
      setEditingImageLabelId(null)
    } else if (e.key === 'Enter') {
      handleImageLabelBlur()
    }
  },

  /**
   * Handles keyboard events for PDF label editing
   */
  handlePdfLabelKeyDown: (
    e: React.KeyboardEvent,
    setEditingPdfLabelId: (id: string | null) => void,
    handlePdfLabelBlur: () => void
  ) => {
    if (e.key === 'Escape') {
      setEditingPdfLabelId(null)
    } else if (e.key === 'Enter') {
      handlePdfLabelBlur()
    }
  },

  /**
   * Handles keyboard events for text file label editing
   */
  handleTextFileLabelKeyDown: (
    e: React.KeyboardEvent,
    setEditingTextFileLabelId: (id: string | null) => void,
    handleTextFileLabelBlur: () => void
  ) => {
    if (e.key === 'Escape') {
      setEditingTextFileLabelId(null)
    } else if (e.key === 'Enter') {
      handleTextFileLabelBlur()
    }
  },
}
