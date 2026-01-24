import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group } from 'react-konva'
import Konva from 'konva'
import { CanvasItem, SelectionRect, LLMModel, ImageGenModel } from '../types'
import { config } from '../config'
import { uploadImage } from '../api/images'

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
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectionStartRef = useRef({ x: 0, y: 0 })
  // Middle-mouse panning
  const [isMiddleMousePanning, setIsMiddleMousePanning] = useState(false)
  const middleMouseStartRef = useRef({ x: 0, y: 0, stageX: 0, stageY: 0 })
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const textTransformerRef = useRef<Konva.Transformer>(null)
  const imageTransformerRef = useRef<Konva.Transformer>(null)
  const promptTransformerRef = useRef<Konva.Transformer>(null)
  const imageGenPromptTransformerRef = useRef<Konva.Transformer>(null)
  const htmlGenPromptTransformerRef = useRef<Konva.Transformer>(null)
  const htmlTransformerRef = useRef<Konva.Transformer>(null)
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editingPromptField, setEditingPromptField] = useState<'label' | 'text' | null>(null)
  const [editingImageGenPromptId, setEditingImageGenPromptId] = useState<string | null>(null)
  const [editingImageGenPromptField, setEditingImageGenPromptField] = useState<'label' | 'text' | null>(null)
  const imageGenPromptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const imageGenLabelInputRef = useRef<HTMLInputElement>(null)
  const [imageGenModelMenuPromptId, setImageGenModelMenuPromptId] = useState<string | null>(null)
  const [imageGenModelMenuPosition, setImageGenModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [editingHtmlGenPromptId, setEditingHtmlGenPromptId] = useState<string | null>(null)
  const [editingHtmlGenPromptField, setEditingHtmlGenPromptField] = useState<'label' | 'text' | null>(null)
  const htmlGenPromptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const htmlGenLabelInputRef = useRef<HTMLInputElement>(null)
  const [htmlGenModelMenuPromptId, setHtmlGenModelMenuPromptId] = useState<string | null>(null)
  const [htmlGenModelMenuPosition, setHtmlGenModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const [pulsePhase, setPulsePhase] = useState(0)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)
  const [modelMenuPromptId, setModelMenuPromptId] = useState<string | null>(null)
  const [modelMenuPosition, setModelMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{ imageId: string; x: number; y: number } | null>(null)
  const [isViewportTransforming, setIsViewportTransforming] = useState(false)
  const zoomTimeoutRef = useRef<number | null>(null)
  // Track real-time transforms of HTML items during drag/transform
  const [htmlItemTransforms, setHtmlItemTransforms] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  // Track when any drag/transform is in progress to disable iframe pointer events
  const [isAnyDragActive, setIsAnyDragActive] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Handle container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)

    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(updateSize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateSize)
      resizeObserver.disconnect()
    }
  }, [])

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
      .filter((item) => selectedIds.includes(item.id) && item.type === 'image')
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
  }, [items, selectedIds])

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
    // Don't paste if we're editing text in an overlay
    if (editingTextId || editingPromptId || editingImageGenPromptId || editingHtmlGenPromptId) return
    // Don't paste if focus is in an input/textarea
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return

    const clipboardItems = e.clipboardData?.items
    if (!clipboardItems) return

    // Check if we have a single selected text-based item to paste into
    const selectedItems = items.filter((item) => selectedIds.includes(item.id))
    const selectedTextItem = selectedItems.length === 1 &&
      (selectedItems[0].type === 'text' ||
       selectedItems[0].type === 'prompt' ||
       selectedItems[0].type === 'image-gen-prompt' ||
       selectedItems[0].type === 'html-gen-prompt')
      ? selectedItems[0] : null

    // Check for text first if we have a selected text-based item
    const text = e.clipboardData?.getData('text/plain')
    if (text && selectedTextItem) {
      e.preventDefault()
      onUpdateItem(selectedTextItem.id, { text })
      return
    }

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
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string
          const img = new window.Image()
          img.onload = async () => {
            const scaled = scaleImageToViewport(img.width, img.height)
            try {
              // Upload to S3 immediately to avoid storing large data URLs in memory
              const s3Url = await uploadImage(dataUrl, `pasted-${Date.now()}.png`)
              onAddImageAt(canvasPos.x, canvasPos.y, s3Url, scaled.width, scaled.height)
            } catch (err) {
              console.error('Failed to upload image, using data URL:', err)
              // Fallback to data URL if upload fails
              onAddImageAt(canvasPos.x, canvasPos.y, dataUrl, scaled.width, scaled.height)
            }
          }
          img.src = dataUrl
        }
        reader.readAsDataURL(blob)
        return
      }
    }

    // Check for text - create new text item
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
  }, [editingTextId, editingPromptId, editingImageGenPromptId, editingHtmlGenPromptId, mousePos, stagePos, stageScale, onAddTextAt, onAddImageAt, items, onUpdateItem])

  // Handle Ctrl+C to copy text from selected items (synchronous copy event)
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      // Don't interfere if focus is in an input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      // Don't interfere if editing
      if (editingTextId || editingPromptId || editingImageGenPromptId || editingHtmlGenPromptId) return

      const selectedItems = items.filter((item) => selectedIds.includes(item.id))
      if (selectedItems.length !== 1) return

      const item = selectedItems[0]

      if (item.type === 'text') {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', item.text)
      } else if (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt') {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', item.text)
      }
      // Images are handled by keydown handler below
    }

    document.addEventListener('copy', handleCopy)
    return () => document.removeEventListener('copy', handleCopy)
  }, [items, selectedIds, editingTextId, editingPromptId, editingImageGenPromptId, editingHtmlGenPromptId])

  // Handle Ctrl+C for images (needs async clipboard API)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'c')) return
      // Don't interfere if focus is in an input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      // Don't interfere if editing
      if (editingTextId || editingPromptId || editingImageGenPromptId || editingHtmlGenPromptId) return

      const selectedItems = items.filter((item) => selectedIds.includes(item.id))
      if (selectedItems.length !== 1) return

      const item = selectedItems[0]
      if (item.type !== 'image') return

      e.preventDefault()
      try {
        // Check if it's a data URL (no CORS issues) or S3 URL (needs proxy)
        const isDataUrl = item.src.startsWith('data:')

        if (isDataUrl) {
          // For data URLs, we can load directly
          const img = new window.Image()

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = item.src
          })

          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Failed to get canvas context')
          ctx.drawImage(img, 0, 0)

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => {
              if (b) resolve(b)
              else reject(new Error('Failed to create blob'))
            }, 'image/png')
          })

          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob
            })
          ])
        } else {
          // For S3 URLs, fetch through backend proxy to avoid CORS
          const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(item.src)}`)
          if (!response.ok) throw new Error('Failed to fetch image through proxy')
          const blob = await response.blob()

          // Convert to PNG if needed
          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            const img = new window.Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              if (!ctx) {
                reject(new Error('Failed to get canvas context'))
                return
              }
              ctx.drawImage(img, 0, 0)
              canvas.toBlob((b) => {
                if (b) resolve(b)
                else reject(new Error('Failed to create blob'))
              }, 'image/png')
            }
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = URL.createObjectURL(blob)
          })

          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': pngBlob
            })
          ])
        }
      } catch (err) {
        console.error('Failed to copy image to clipboard:', err)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [items, selectedIds, editingTextId, editingPromptId, editingImageGenPromptId, editingHtmlGenPromptId])

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Middle-mouse panning - use native events on container to intercept before Konva
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMiddleMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return // Only middle mouse
      e.preventDefault()
      e.stopPropagation()
      setIsMiddleMousePanning(true)
      setIsAnyDragActive(true)
      middleMouseStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        stageX: stagePos.x,
        stageY: stagePos.y,
      }
      if (config.features.hideHtmlDuringTransform) {
        setIsViewportTransforming(true)
      }
    }

    const handleMiddleMouseMove = (e: MouseEvent) => {
      if (!isMiddleMousePanning) return
      const dx = e.clientX - middleMouseStartRef.current.x
      const dy = e.clientY - middleMouseStartRef.current.y
      setStagePos({
        x: middleMouseStartRef.current.stageX + dx,
        y: middleMouseStartRef.current.stageY + dy,
      })
    }

    const handleMiddleMouseUp = (e: MouseEvent) => {
      if (e.button !== 1) return // Only middle mouse
      if (!isMiddleMousePanning) return
      setIsMiddleMousePanning(false)
      setIsAnyDragActive(false)
      if (config.features.hideHtmlDuringTransform) {
        setIsViewportTransforming(false)
      }
    }

    // Use capture phase to intercept before Konva handles the events
    container.addEventListener('mousedown', handleMiddleMouseDown, { capture: true })
    document.addEventListener('mousemove', handleMiddleMouseMove)
    document.addEventListener('mouseup', handleMiddleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMiddleMouseDown, { capture: true })
      document.removeEventListener('mousemove', handleMiddleMouseMove)
      document.removeEventListener('mouseup', handleMiddleMouseUp)
    }
  }, [isMiddleMousePanning, stagePos.x, stagePos.y])

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

    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        // Check for images
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const reader = new FileReader()
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const img = new window.Image()
            img.onload = async () => {
              const scaled = scaleImageToViewport(img.width, img.height)
              try {
                // Upload to S3 immediately to avoid storing large data URLs in memory
                const s3Url = await uploadImage(dataUrl, `pasted-${Date.now()}.png`)
                onAddImageAt(contextMenu.canvasX, contextMenu.canvasY, s3Url, scaled.width, scaled.height)
              } catch (err) {
                console.error('Failed to upload image, using data URL:', err)
                // Fallback to data URL if upload fails
                onAddImageAt(contextMenu.canvasX, contextMenu.canvasY, dataUrl, scaled.width, scaled.height)
              }
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

    // Hide HTML overlays while zooming
    if (config.features.hideHtmlDuringTransform) {
      setIsViewportTransforming(true)
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current)
      }
      zoomTimeoutRef.current = window.setTimeout(() => {
        setIsViewportTransforming(false)
      }, config.timing.zoomEndDelay)
    }

    setStageScale(clampedScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    })
  }

  // Handle click on empty canvas to clear selection
  // Using onClick instead of mouseDown so dragging (panning) doesn't clear selection
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return
    // Don't clear if Ctrl is held (user might be doing marquee)
    if (e.evt.ctrlKey || e.evt.metaKey) return
    // Clicking on empty canvas clears selection
    onSelectItems([])
  }

  // Selection rectangle (Ctrl + drag)
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Middle mouse is handled by native event listener at container level
    if (e.evt.button === 1) return

    if (e.target !== stageRef.current) return

    // Only start marquee selection if Ctrl is held
    if (!e.evt.ctrlKey && !e.evt.metaKey) {
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
    // Middle-mouse panning is handled by native event listener
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
    // Middle-mouse panning is handled by native event listener
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
    const isSelected = selectedIds.includes(id)

    if (metaPressed && isSelected) {
      onSelectItems(selectedIds.filter((selectedId) => selectedId !== id))
    } else if (metaPressed) {
      onSelectItems([...selectedIds, id])
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

  // Prompt editing handlers
  const handlePromptLabelDblClick = (id: string) => {
    setEditingPromptId(id)
    setEditingPromptField('label')
    setTimeout(() => {
      labelInputRef.current?.focus()
      labelInputRef.current?.select()
    }, 0)
  }

  const handlePromptTextDblClick = (id: string) => {
    setEditingPromptId(id)
    setEditingPromptField('text')
    setTimeout(() => {
      promptTextareaRef.current?.focus()
      promptTextareaRef.current?.select()
    }, 0)
  }

  const handlePromptLabelBlur = () => {
    if (editingPromptId && labelInputRef.current) {
      onUpdateItem(editingPromptId, { label: labelInputRef.current.value })
    }
    setEditingPromptId(null)
    setEditingPromptField(null)
  }

  const handlePromptTextBlur = () => {
    if (editingPromptId && promptTextareaRef.current) {
      onUpdateItem(editingPromptId, { text: promptTextareaRef.current.value })
    }
    setEditingPromptId(null)
    setEditingPromptField(null)
  }

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingPromptId(null)
      setEditingPromptField(null)
    }
  }

  // Image Gen Prompt editing handlers
  const handleImageGenPromptLabelDblClick = (id: string) => {
    setEditingImageGenPromptId(id)
    setEditingImageGenPromptField('label')
    setTimeout(() => {
      imageGenLabelInputRef.current?.focus()
      imageGenLabelInputRef.current?.select()
    }, 0)
  }

  const handleImageGenPromptTextDblClick = (id: string) => {
    setEditingImageGenPromptId(id)
    setEditingImageGenPromptField('text')
    setTimeout(() => {
      imageGenPromptTextareaRef.current?.focus()
      imageGenPromptTextareaRef.current?.select()
    }, 0)
  }

  const handleImageGenPromptLabelBlur = () => {
    if (editingImageGenPromptId && imageGenLabelInputRef.current) {
      onUpdateItem(editingImageGenPromptId, { label: imageGenLabelInputRef.current.value })
    }
    setEditingImageGenPromptId(null)
    setEditingImageGenPromptField(null)
  }

  const handleImageGenPromptTextBlur = () => {
    if (editingImageGenPromptId && imageGenPromptTextareaRef.current) {
      onUpdateItem(editingImageGenPromptId, { text: imageGenPromptTextareaRef.current.value })
    }
    setEditingImageGenPromptId(null)
    setEditingImageGenPromptField(null)
  }

  const handleImageGenPromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingImageGenPromptId(null)
      setEditingImageGenPromptField(null)
    }
  }

  // HTML Gen Prompt editing handlers
  const handleHtmlGenPromptLabelDblClick = (id: string) => {
    setEditingHtmlGenPromptId(id)
    setEditingHtmlGenPromptField('label')
    setTimeout(() => {
      htmlGenLabelInputRef.current?.focus()
      htmlGenLabelInputRef.current?.select()
    }, 0)
  }

  const handleHtmlGenPromptTextDblClick = (id: string) => {
    setEditingHtmlGenPromptId(id)
    setEditingHtmlGenPromptField('text')
    setTimeout(() => {
      htmlGenPromptTextareaRef.current?.focus()
      htmlGenPromptTextareaRef.current?.select()
    }, 0)
  }

  const handleHtmlGenPromptLabelBlur = () => {
    if (editingHtmlGenPromptId && htmlGenLabelInputRef.current) {
      onUpdateItem(editingHtmlGenPromptId, { label: htmlGenLabelInputRef.current.value })
    }
    setEditingHtmlGenPromptId(null)
    setEditingHtmlGenPromptField(null)
  }

  const handleHtmlGenPromptTextBlur = () => {
    if (editingHtmlGenPromptId && htmlGenPromptTextareaRef.current) {
      onUpdateItem(editingHtmlGenPromptId, { text: htmlGenPromptTextareaRef.current.value })
    }
    setEditingHtmlGenPromptId(null)
    setEditingHtmlGenPromptField(null)
  }

  const handleHtmlGenPromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingHtmlGenPromptId(null)
      setEditingHtmlGenPromptField(null)
    }
  }

  const getEditingTextItem = () => {
    if (!editingTextId) return null
    const item = items.find((i) => i.id === editingTextId)
    if (!item || item.type !== 'text') return null
    return item
  }

  const getEditingPromptItem = () => {
    if (!editingPromptId) return null
    const item = items.find((i) => i.id === editingPromptId)
    if (!item || item.type !== 'prompt') return null
    return item
  }

  const getEditingImageGenPromptItem = () => {
    if (!editingImageGenPromptId) return null
    const item = items.find((i) => i.id === editingImageGenPromptId)
    if (!item || item.type !== 'image-gen-prompt') return null
    return item
  }

  const getEditingHtmlGenPromptItem = () => {
    if (!editingHtmlGenPromptId) return null
    const item = items.find((i) => i.id === editingHtmlGenPromptId)
    if (!item || item.type !== 'html-gen-prompt') return null
    return item
  }

  const editingItem = getEditingTextItem()
  const editingPrompt = getEditingPromptItem()
  const editingImageGenPrompt = getEditingImageGenPromptItem()
  const editingHtmlGenPrompt = getEditingHtmlGenPromptItem()

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
        draggable
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
                  const scaleY = node.scaleY()
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
            return (
              <KonvaImage
                key={item.id}
                id={item.id}
                x={item.x}
                y={item.y}
                image={img}
                width={item.width}
                height={item.height}
                scaleX={item.scaleX ?? 1}
                scaleY={item.scaleY ?? 1}
                rotation={item.rotation ?? 0}
                draggable
                onClick={(e) => handleItemClick(e, item.id)}
                onContextMenu={(e) => {
                  e.evt.preventDefault()
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
            const isEditingThis = editingPromptId === item.id
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
                  onDblClick={() => handlePromptLabelDblClick(item.id)}
                  visible={!(isEditingThis && editingPromptField === 'label')}
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
                  onDblClick={() => handlePromptTextDblClick(item.id)}
                  visible={!(isEditingThis && editingPromptField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'image-gen-prompt') {
            const headerHeight = 28
            const isEditingThis = editingImageGenPromptId === item.id
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
                  onDblClick={() => handleImageGenPromptLabelDblClick(item.id)}
                  visible={!(isEditingThis && editingImageGenPromptField === 'label')}
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
                  onDblClick={() => handleImageGenPromptTextDblClick(item.id)}
                  visible={!(isEditingThis && editingImageGenPromptField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html-gen-prompt') {
            const headerHeight = 28
            const isEditingThis = editingHtmlGenPromptId === item.id
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
                  onDblClick={() => handleHtmlGenPromptLabelDblClick(item.id)}
                  visible={!(isEditingThis && editingHtmlGenPromptField === 'label')}
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
                  onDblClick={() => handleHtmlGenPromptTextDblClick(item.id)}
                  visible={!(isEditingThis && editingHtmlGenPromptField === 'text')}
                />
              </Group>
            )
          } else if (item.type === 'html') {
            const headerHeight = 24
            const zoom = item.zoom ?? 1
            const zoomButtonWidth = 24
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
        {/* Transformer for images - full controls */}
        <Transformer ref={imageTransformerRef} />
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
      {editingPrompt && editingPromptField === 'label' && (
        <input
          ref={labelInputRef}
          type="text"
          defaultValue={editingPrompt.label}
          onBlur={handlePromptLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handlePromptLabelBlur()
            }
            handlePromptKeyDown(e)
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
      {editingPrompt && editingPromptField === 'text' && (
        <textarea
          ref={promptTextareaRef}
          defaultValue={editingPrompt.text}
          onBlur={handlePromptTextBlur}
          onKeyDown={handlePromptKeyDown}
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
      {editingImageGenPrompt && editingImageGenPromptField === 'label' && (
        <input
          ref={imageGenLabelInputRef}
          type="text"
          defaultValue={editingImageGenPrompt.label}
          onBlur={handleImageGenPromptLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleImageGenPromptLabelBlur()
            }
            handleImageGenPromptKeyDown(e)
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
      {editingImageGenPrompt && editingImageGenPromptField === 'text' && (
        <textarea
          ref={imageGenPromptTextareaRef}
          defaultValue={editingImageGenPrompt.text}
          onBlur={handleImageGenPromptTextBlur}
          onKeyDown={handleImageGenPromptKeyDown}
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
      {editingHtmlGenPrompt && editingHtmlGenPromptField === 'label' && (
        <input
          ref={htmlGenLabelInputRef}
          type="text"
          defaultValue={editingHtmlGenPrompt.label}
          onBlur={handleHtmlGenPromptLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleHtmlGenPromptLabelBlur()
            }
            handleHtmlGenPromptKeyDown(e)
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
      {editingHtmlGenPrompt && editingHtmlGenPromptField === 'text' && (
        <textarea
          ref={htmlGenPromptTextareaRef}
          defaultValue={editingHtmlGenPrompt.text}
          onBlur={handleHtmlGenPromptTextBlur}
          onKeyDown={handleHtmlGenPromptKeyDown}
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
      {imageContextMenu && (
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
        </div>
      )}
    </div>
  )
}

export default InfiniteCanvas
