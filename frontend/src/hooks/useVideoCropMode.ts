import { useState, useEffect, useCallback } from 'react'
import { CanvasItem, CropRect, VideoItem } from '../types'
import { cropVideo } from '../api/videos'

interface UseVideoCropModeParams {
  items: CanvasItem[]
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
}

export interface VideoCropMode {
  croppingVideoId: string | null
  pendingCropRect: CropRect | null
  processingVideoId: string | null
  startCrop: (id: string, initialRect: CropRect) => void
  setPendingCropRect: (rect: CropRect | null) => void
  applyCrop: () => void
  cancelCrop: () => void
}

export function useVideoCropMode({
  items,
  isOffline,
  onUpdateItem,
}: UseVideoCropModeParams): VideoCropMode {
  const [croppingVideoId, setCroppingVideoId] = useState<string | null>(null)
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(null)
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null)

  const startCrop = useCallback((id: string, initialRect: CropRect) => {
    setCroppingVideoId(id)
    setPendingCropRect(initialRect)
  }, [])

  const applyCrop = useCallback(() => {
    if (!croppingVideoId || !pendingCropRect) {
      setCroppingVideoId(null)
      setPendingCropRect(null)
      return
    }

    const item = items.find((i) => i.id === croppingVideoId)
    if (!item || item.type !== 'video') {
      setCroppingVideoId(null)
      setPendingCropRect(null)
      return
    }

    const videoItem = item as VideoItem
    const origW = videoItem.originalWidth ?? videoItem.width
    const origH = videoItem.originalHeight ?? videoItem.height
    const scaleX = videoItem.scaleX ?? 1
    const scaleY = videoItem.scaleY ?? 1

    // Display scale: how big is one source pixel on screen
    const currentSourceW = videoItem.cropRect?.width ?? origW
    const currentSourceH = videoItem.cropRect?.height ?? origH
    const baseDisplayScaleX = videoItem.width / currentSourceW
    const baseDisplayScaleY = videoItem.height / currentSourceH
    const displayScaleX = baseDisplayScaleX * scaleX
    const displayScaleY = baseDisplayScaleY * scaleY

    // New item dimensions based on the crop region
    const newWidth = pendingCropRect.width * baseDisplayScaleX
    const newHeight = pendingCropRect.height * baseDisplayScaleY

    // New position accounting for the crop offset
    const offsetX = videoItem.x - (videoItem.cropRect?.x ?? 0) * displayScaleX
    const offsetY = videoItem.y - (videoItem.cropRect?.y ?? 0) * displayScaleY
    const newX = offsetX + pendingCropRect.x * displayScaleX
    const newY = offsetY + pendingCropRect.y * displayScaleY

    const itemId = croppingVideoId
    const cropRect = pendingCropRect

    // Update item with crop rect immediately (for UI display)
    onUpdateItem(itemId, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      cropRect,
    })

    setCroppingVideoId(null)
    setPendingCropRect(null)

    // Skip server-side crop in offline mode
    if (isOffline) {
      return
    }

    // Show processing spinner and call server
    setProcessingVideoId(itemId)

    cropVideo(videoItem.src, cropRect)
      .then((cropUrl) => {
        onUpdateItem(itemId, { cropSrc: cropUrl })
        setProcessingVideoId(null)
      })
      .catch((err) => {
        console.error('Failed to create server-side video crop:', err)
        setProcessingVideoId(null)
      })
  }, [croppingVideoId, pendingCropRect, items, isOffline, onUpdateItem])

  const cancelCrop = useCallback(() => {
    setCroppingVideoId(null)
    setPendingCropRect(null)
  }, [])

  // Keyboard handler for crop mode (Enter to apply, Escape to cancel)
  useEffect(() => {
    if (!croppingVideoId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        applyCrop()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelCrop()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [croppingVideoId, applyCrop, cancelCrop])

  return {
    croppingVideoId,
    pendingCropRect,
    processingVideoId,
    startCrop,
    setPendingCropRect,
    applyCrop,
    cancelCrop,
  }
}
