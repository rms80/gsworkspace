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
  pendingSpeed: number
  processingVideoId: string | null
  startCrop: (id: string, initialRect: CropRect, initialSpeed: number) => void
  setPendingCropRect: (rect: CropRect | null) => void
  setPendingSpeed: (speed: number) => void
  applyCrop: () => void
  cancelCrop: () => void
  applyOrCancelCrop: () => void
}

function cropRectsEqual(a: CropRect | null, b: CropRect | null): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function useVideoCropMode({
  items,
  isOffline,
  onUpdateItem,
}: UseVideoCropModeParams): VideoCropMode {
  const [croppingVideoId, setCroppingVideoId] = useState<string | null>(null)
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(null)
  const [initialCropRect, setInitialCropRect] = useState<CropRect | null>(null)
  const [pendingSpeed, setPendingSpeed] = useState<number>(1)
  const [initialSpeed, setInitialSpeed] = useState<number>(1)
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null)

  const startCrop = useCallback((id: string, initialRect: CropRect, speed: number) => {
    setCroppingVideoId(id)
    setPendingCropRect(initialRect)
    setInitialCropRect(initialRect)
    setPendingSpeed(speed)
    setInitialSpeed(speed)
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

    // Check if crop rect actually changed from original
    const cropRectChanged = !cropRectsEqual(cropRect, initialCropRect)
    const speedChanged = pendingSpeed !== initialSpeed

    // Update item with crop rect and speed immediately (for UI display)
    onUpdateItem(itemId, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      cropRect,
      speedFactor: pendingSpeed !== 1 ? pendingSpeed : undefined,
    })

    setCroppingVideoId(null)
    setPendingCropRect(null)
    setInitialCropRect(null)
    setPendingSpeed(1)
    setInitialSpeed(1)

    // Skip server-side processing in offline mode
    if (isOffline) {
      return
    }

    // Only call server if something changed
    if (!cropRectChanged && !speedChanged) {
      return
    }

    // Show processing spinner and call server
    setProcessingVideoId(itemId)

    // Pass cropRect only if it changed, speed only if not 1
    const cropRectToSend = cropRectChanged ? cropRect : undefined
    const speedToSend = speedChanged ? pendingSpeed : undefined

    cropVideo(videoItem.src, cropRectToSend, speedToSend)
      .then((cropUrl) => {
        onUpdateItem(itemId, { cropSrc: cropUrl })
        setProcessingVideoId(null)
      })
      .catch((err) => {
        console.error('Failed to create server-side video processing:', err)
        setProcessingVideoId(null)
      })
  }, [croppingVideoId, pendingCropRect, initialCropRect, pendingSpeed, initialSpeed, items, isOffline, onUpdateItem])

  const cancelCrop = useCallback(() => {
    setCroppingVideoId(null)
    setPendingCropRect(null)
    setInitialCropRect(null)
    setPendingSpeed(1)
    setInitialSpeed(1)
  }, [])

  // Apply crop if modified (crop or speed changed), otherwise cancel
  const applyOrCancelCrop = useCallback(() => {
    const cropChanged = !cropRectsEqual(pendingCropRect, initialCropRect)
    const speedChanged = pendingSpeed !== initialSpeed
    if (!cropChanged && !speedChanged) {
      cancelCrop()
    } else {
      applyCrop()
    }
  }, [pendingCropRect, initialCropRect, pendingSpeed, initialSpeed, cancelCrop, applyCrop])

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
    pendingSpeed,
    processingVideoId,
    startCrop,
    setPendingCropRect,
    setPendingSpeed,
    applyCrop,
    cancelCrop,
    applyOrCancelCrop,
  }
}
