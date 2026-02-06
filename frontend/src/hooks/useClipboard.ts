import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem } from '../types'
import { uploadImage } from '../api/images'
import { getContentData } from '../api/scenes'
import { useBackgroundOperations } from '../contexts/BackgroundOperationsContext'

interface UseClipboardParams {
  items: CanvasItem[]
  selectedIds: string[]
  sceneId: string
  isEditing: boolean
  isOffline: boolean
  croppingImageId: string | null
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  scaleImageToViewport: (w: number, h: number) => { width: number; height: number }
  onAddTextAt: (x: number, y: number, text: string) => string | void
  onAddImageAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => void
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onDeleteSelected: () => void
}

export interface ClipboardActions {
  mousePos: { x: number; y: number }
  handleContextMenuPaste: (canvasX: number, canvasY: number) => Promise<void>
}

export function useClipboard({
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
}: UseClipboardParams): ClipboardActions {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const { startOperation, endOperation } = useBackgroundOperations()

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Handle paste from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (isEditing) return
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

      const text = e.clipboardData?.getData('text/plain')
      if (text && selectedTextItem) {
        e.preventDefault()
        onUpdateItem(selectedTextItem.id, { text })
        return
      }

      const canvasPos = screenToCanvas(mousePos.x, mousePos.y)

      for (const item of clipboardItems) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue

          // Capture file size for pasted images
          const fileSize = blob.size
          const reader = new FileReader()
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const img = new window.Image()
            img.onload = async () => {
              const scaled = scaleImageToViewport(img.width, img.height)
              const originalWidth = img.naturalWidth
              const originalHeight = img.naturalHeight
              // Use "Image" as base name - unique name generator will make it Image1, Image2, etc.
              const name = 'Image'
              // Generate item ID upfront so it matches the uploaded file
              const itemId = uuidv4()
              // In offline mode, skip S3 upload and use data URL directly
              if (isOffline) {
                onAddImageAt(itemId, canvasPos.x, canvasPos.y, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
                return
              }
              try {
                startOperation()
                const s3Url = await uploadImage(dataUrl, sceneId, itemId, `pasted-${Date.now()}.png`)
                endOperation()
                onAddImageAt(itemId, canvasPos.x, canvasPos.y, s3Url, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
              } catch (err) {
                endOperation()
                console.error('Failed to upload image, using data URL:', err)
                onAddImageAt(itemId, canvasPos.x, canvasPos.y, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
              }
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(blob)
          return
        }
      }

      if (text) {
        e.preventDefault()
        onAddTextAt(canvasPos.x, canvasPos.y, text)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [isEditing, isOffline, mousePos, screenToCanvas, onAddTextAt, onAddImageAt, items, onUpdateItem, selectedIds, scaleImageToViewport])

  // Handle Ctrl+C to copy text from selected items
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (isEditing) return

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
    }

    document.addEventListener('copy', handleCopy)
    return () => document.removeEventListener('copy', handleCopy)
  }, [items, selectedIds, isEditing])

  // Handle Ctrl+C for images (needs async clipboard API)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'c')) return
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (isEditing) return

      const selectedItems = items.filter((item) => selectedIds.includes(item.id))
      if (selectedItems.length !== 1) return

      const item = selectedItems[0]
      if (item.type !== 'image') return

      e.preventDefault()
      try {
        const isDataUrl = item.src.startsWith('data:')

        if (isDataUrl) {
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
            new ClipboardItem({ 'image/png': blob })
          ])
        } else {
          // Use getContentData API for S3 URLs
          const blob = await getContentData(sceneId, item.id, 'image', false)
          const blobUrl = URL.createObjectURL(blob)

          try {
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
              img.src = blobUrl
            })

            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': pngBlob })
            ])
          } finally {
            URL.revokeObjectURL(blobUrl)
          }
        }
      } catch (err) {
        console.error('Failed to copy image to clipboard:', err)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [items, selectedIds, isEditing])

  // Handle Delete/Backspace keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing || croppingImageId) return
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDeleteSelected()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, croppingImageId, onDeleteSelected])

  // Context menu paste handler
  const handleContextMenuPaste = async (canvasX: number, canvasY: number) => {
    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          // Capture file size for pasted images
          const fileSize = blob.size
          const reader = new FileReader()
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const img = new window.Image()
            img.onload = async () => {
              const scaled = scaleImageToViewport(img.width, img.height)
              const originalWidth = img.naturalWidth
              const originalHeight = img.naturalHeight
              // Use "Image" as base name - unique name generator will make it Image1, Image2, etc.
              const name = 'Image'
              // Generate item ID upfront so it matches the uploaded file
              const itemId = uuidv4()
              // In offline mode, skip S3 upload and use data URL directly
              if (isOffline) {
                onAddImageAt(itemId, canvasX, canvasY, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
                return
              }
              try {
                startOperation()
                const s3Url = await uploadImage(dataUrl, sceneId, itemId, `pasted-${Date.now()}.png`)
                endOperation()
                onAddImageAt(itemId, canvasX, canvasY, s3Url, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
              } catch (err) {
                endOperation()
                console.error('Failed to upload image, using data URL:', err)
                onAddImageAt(itemId, canvasX, canvasY, dataUrl, scaled.width, scaled.height, name, originalWidth, originalHeight, fileSize)
              }
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(blob)
          return
        }

        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const text = await blob.text()
          onAddTextAt(canvasX, canvasY, text)
          return
        }
      }
    } catch {
      // Fallback for browsers that don't support clipboard.read()
      const text = await navigator.clipboard.readText()
      if (text) {
        onAddTextAt(canvasX, canvasY, text)
      }
    }
  }

  return {
    mousePos,
    handleContextMenuPaste,
  }
}
