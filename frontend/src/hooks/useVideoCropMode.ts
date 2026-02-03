import { useState, useEffect, useCallback } from 'react'
import { CanvasItem, CropRect, VideoItem } from '../types'
import { cropVideo } from '../api/videos'
import { getContentUrl } from '../api/scenes'

interface UseVideoCropModeParams {
  items: CanvasItem[]
  sceneId: string
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
}

export interface VideoCropMode {
  croppingVideoId: string | null
  pendingCropRect: CropRect | null
  pendingSpeed: number
  pendingRemoveAudio: boolean
  pendingTrim: boolean
  pendingTrimStart: number
  pendingTrimEnd: number
  processingVideoId: string | null
  startCrop: (id: string, initialRect: CropRect, initialSpeed: number, initialRemoveAudio: boolean, initialTrim: boolean, initialTrimStart: number, initialTrimEnd: number) => void
  setPendingCropRect: (rect: CropRect | null) => void
  setPendingSpeed: (speed: number) => void
  setPendingRemoveAudio: (remove: boolean) => void
  setPendingTrim: (trim: boolean) => void
  setPendingTrimStart: (start: number) => void
  setPendingTrimEnd: (end: number) => void
  applyCrop: () => void
  cancelCrop: () => void
  applyOrCancelCrop: () => void
}

function cropRectsEqual(a: CropRect | null, b: CropRect | null): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * Extract the file extension from a video src URL
 */
function getVideoExtension(src: string): string {
  // Try to get from URL path
  if (src.includes('.')) {
    const match = src.match(/\.(\w+)(?:\?|$)/)
    if (match && ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase()
    }
  }
  // Try to get from data URL
  if (src.startsWith('data:video/')) {
    const match = src.match(/data:video\/(\w+)/)
    if (match) {
      return match[1]
    }
  }
  // Default to mp4
  return 'mp4'
}

export function useVideoCropMode({
  items,
  sceneId,
  isOffline,
  onUpdateItem,
}: UseVideoCropModeParams): VideoCropMode {
  const [croppingVideoId, setCroppingVideoId] = useState<string | null>(null)
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(null)
  const [initialCropRect, setInitialCropRect] = useState<CropRect | null>(null)
  const [pendingSpeed, setPendingSpeed] = useState<number>(1)
  const [initialSpeed, setInitialSpeed] = useState<number>(1)
  const [pendingRemoveAudio, setPendingRemoveAudio] = useState<boolean>(false)
  const [initialRemoveAudio, setInitialRemoveAudio] = useState<boolean>(false)
  const [pendingTrim, setPendingTrim] = useState<boolean>(false)
  const [initialTrim, setInitialTrim] = useState<boolean>(false)
  const [pendingTrimStart, setPendingTrimStart] = useState<number>(0)
  const [initialTrimStart, setInitialTrimStart] = useState<number>(0)
  const [pendingTrimEnd, setPendingTrimEnd] = useState<number>(0)
  const [initialTrimEnd, setInitialTrimEnd] = useState<number>(0)
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null)

  const startCrop = useCallback((id: string, initialRect: CropRect, speed: number, removeAudio: boolean, trim: boolean, trimStart: number, trimEnd: number) => {
    setCroppingVideoId(id)
    setPendingCropRect(initialRect)
    setInitialCropRect(initialRect)
    setPendingSpeed(speed)
    setInitialSpeed(speed)
    setPendingRemoveAudio(removeAudio)
    setInitialRemoveAudio(removeAudio)
    setPendingTrim(trim)
    setInitialTrim(trim)
    setPendingTrimStart(trimStart)
    setInitialTrimStart(trimStart)
    setPendingTrimEnd(trimEnd)
    setInitialTrimEnd(trimEnd)
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
    const removeAudioChanged = pendingRemoveAudio !== initialRemoveAudio
    const trimChanged = pendingTrim !== initialTrim
    const trimStartChanged = pendingTrimStart !== initialTrimStart
    const trimEndChanged = pendingTrimEnd !== initialTrimEnd

    // Update item with crop rect, speed, removeAudio, and trim immediately (for UI display)
    onUpdateItem(itemId, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      cropRect,
      speedFactor: pendingSpeed !== 1 ? pendingSpeed : undefined,
      removeAudio: pendingRemoveAudio || undefined,
      trim: pendingTrim || undefined,
      trimStart: pendingTrim ? pendingTrimStart : undefined,
      trimEnd: pendingTrim ? pendingTrimEnd : undefined,
    })

    setCroppingVideoId(null)
    setPendingCropRect(null)
    setInitialCropRect(null)
    setPendingSpeed(1)
    setInitialSpeed(1)
    setPendingRemoveAudio(false)
    setInitialRemoveAudio(false)
    setPendingTrim(false)
    setInitialTrim(false)
    setPendingTrimStart(0)
    setInitialTrimStart(0)
    setPendingTrimEnd(0)
    setInitialTrimEnd(0)

    // Skip server-side processing in offline mode
    if (isOffline) {
      return
    }

    // Only call server if something changed
    if (!cropRectChanged && !speedChanged && !removeAudioChanged && !trimChanged && !trimStartChanged && !trimEndChanged) {
      return
    }

    // Show processing spinner and call server
    setProcessingVideoId(itemId)

    // Pass cropRect only if it changed, speed only if not 1
    const cropRectToSend = cropRectChanged ? cropRect : undefined
    const speedToSend = speedChanged ? pendingSpeed : undefined
    const removeAudioToSend = removeAudioChanged ? pendingRemoveAudio : undefined
    const trimToSend = (trimChanged || trimStartChanged || trimEndChanged) && pendingTrim ? { start: pendingTrimStart, end: pendingTrimEnd } : undefined
    const extensionToSend = getVideoExtension(videoItem.src)

    cropVideo(sceneId, itemId, cropRectToSend, speedToSend, removeAudioToSend, trimToSend, extensionToSend)
      .then(async () => {
        // Get the URL for the processed video using the content-url endpoint
        const cropUrl = await getContentUrl(sceneId, itemId, 'video', 'mp4', true)
        onUpdateItem(itemId, { cropSrc: cropUrl })
        setProcessingVideoId(null)
      })
      .catch((err) => {
        console.error('Failed to create server-side video processing:', err)
        setProcessingVideoId(null)
      })
  }, [croppingVideoId, pendingCropRect, initialCropRect, pendingSpeed, initialSpeed, pendingRemoveAudio, initialRemoveAudio, pendingTrim, initialTrim, pendingTrimStart, initialTrimStart, pendingTrimEnd, initialTrimEnd, items, sceneId, isOffline, onUpdateItem])

  const cancelCrop = useCallback(() => {
    setCroppingVideoId(null)
    setPendingCropRect(null)
    setInitialCropRect(null)
    setPendingSpeed(1)
    setInitialSpeed(1)
    setPendingRemoveAudio(false)
    setInitialRemoveAudio(false)
    setPendingTrim(false)
    setInitialTrim(false)
    setPendingTrimStart(0)
    setInitialTrimStart(0)
    setPendingTrimEnd(0)
    setInitialTrimEnd(0)
  }, [])

  // Apply crop if modified (crop, speed, removeAudio, or trim changed), otherwise cancel
  const applyOrCancelCrop = useCallback(() => {
    const cropChanged = !cropRectsEqual(pendingCropRect, initialCropRect)
    const speedChanged = pendingSpeed !== initialSpeed
    const removeAudioChanged = pendingRemoveAudio !== initialRemoveAudio
    const trimChanged = pendingTrim !== initialTrim || pendingTrimStart !== initialTrimStart || pendingTrimEnd !== initialTrimEnd
    if (!cropChanged && !speedChanged && !removeAudioChanged && !trimChanged) {
      cancelCrop()
    } else {
      applyCrop()
    }
  }, [pendingCropRect, initialCropRect, pendingSpeed, initialSpeed, pendingRemoveAudio, initialRemoveAudio, pendingTrim, initialTrim, pendingTrimStart, initialTrimStart, pendingTrimEnd, initialTrimEnd, cancelCrop, applyCrop])

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
    pendingRemoveAudio,
    pendingTrim,
    pendingTrimStart,
    pendingTrimEnd,
    processingVideoId,
    startCrop,
    setPendingCropRect,
    setPendingSpeed,
    setPendingRemoveAudio,
    setPendingTrim,
    setPendingTrimStart,
    setPendingTrimEnd,
    applyCrop,
    cancelCrop,
    applyOrCancelCrop,
  }
}
