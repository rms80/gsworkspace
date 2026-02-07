import { useState, useEffect } from 'react'
import { CanvasItem, CropRect } from '../types'
import { cropImage } from '../api/images'

interface UseCropModeParams {
  items: CanvasItem[]
  sceneId: string
  loadedImages: Map<string, HTMLImageElement>
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
}

export interface CropMode {
  croppingImageId: string | null
  pendingCropRect: CropRect | null
  lockAspectRatio: boolean
  processingImageId: string | null
  setCroppingImageId: (id: string | null) => void
  setPendingCropRect: (rect: CropRect | null) => void
  setLockAspectRatio: (locked: boolean) => void
  applyCrop: () => void
  cancelCrop: () => void
}

export function useCropMode({
  items,
  sceneId,
  loadedImages,
  isOffline,
  onUpdateItem,
}: UseCropModeParams): CropMode {
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null)
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(null)
  const [lockAspectRatio, setLockAspectRatio] = useState(false)
  const [processingImageId, setProcessingImageId] = useState<string | null>(null)

  const applyCrop = () => {
    if (!croppingImageId || !pendingCropRect) {
      setCroppingImageId(null)
      setPendingCropRect(null)
      return
    }
    const item = items.find((i) => i.id === croppingImageId)
    if (!item || item.type !== 'image') {
      setCroppingImageId(null)
      setPendingCropRect(null)
      return
    }
    const img = loadedImages.get(item.src)
    if (!img) {
      setCroppingImageId(null)
      setPendingCropRect(null)
      return
    }

    const natW = img.naturalWidth
    const natH = img.naturalHeight
    const scaleX = item.scaleX ?? 1
    const scaleY = item.scaleY ?? 1

    const currentSourceW = item.cropRect?.width ?? natW
    const currentSourceH = item.cropRect?.height ?? natH
    const baseDisplayScaleX = item.width / currentSourceW
    const baseDisplayScaleY = item.height / currentSourceH
    const displayScaleX = baseDisplayScaleX * scaleX
    const displayScaleY = baseDisplayScaleY * scaleY

    const itemId = croppingImageId

    // Check if crop covers the full image (within a small tolerance for floating point)
    const isFullImage =
      Math.abs(pendingCropRect.x) < 1 &&
      Math.abs(pendingCropRect.y) < 1 &&
      Math.abs(pendingCropRect.width - natW) < 1 &&
      Math.abs(pendingCropRect.height - natH) < 1

    if (isFullImage) {
      // Remove crop - restore to full image
      const newWidth = natW * baseDisplayScaleX
      const newHeight = natH * baseDisplayScaleY
      const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScaleX
      const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScaleY

      onUpdateItem(itemId, {
        x: offsetX,
        y: offsetY,
        width: newWidth,
        height: newHeight,
        cropRect: undefined,
        cropSrc: undefined,
      })

      setCroppingImageId(null)
      setPendingCropRect(null)
      setLockAspectRatio(false)
      return
    }

    const newWidth = pendingCropRect.width * baseDisplayScaleX
    const newHeight = pendingCropRect.height * baseDisplayScaleY

    const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScaleX
    const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScaleY
    const newX = offsetX + pendingCropRect.x * displayScaleX
    const newY = offsetY + pendingCropRect.y * displayScaleY

    const cropRect = pendingCropRect
    onUpdateItem(itemId, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      cropRect,
    })

    setCroppingImageId(null)
    setPendingCropRect(null)
    setLockAspectRatio(false)

    // Skip server-side crop in offline mode
    if (isOffline) {
      return
    }

    setProcessingImageId(itemId)
    cropImage(sceneId, itemId, cropRect)
      .then((cropUrl) => {
        // Add cache-busting timestamp to force browser to fetch fresh image
        const cacheBustedUrl = `${cropUrl}${cropUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
        onUpdateItem(itemId, { cropSrc: cacheBustedUrl })
      })
      .catch((err) => {
        console.error('Failed to create server-side crop, LLM canvas crop still works:', err)
      })
      .finally(() => {
        setProcessingImageId(null)
      })
  }

  const cancelCrop = () => {
    setCroppingImageId(null)
    setPendingCropRect(null)
    setLockAspectRatio(false)
  }

  // Keyboard handler for crop mode (Enter to apply, Escape to cancel)
  useEffect(() => {
    if (!croppingImageId) return

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
  }, [croppingImageId, pendingCropRect, items, loadedImages])

  return {
    croppingImageId,
    pendingCropRect,
    lockAspectRatio,
    processingImageId,
    setCroppingImageId,
    setPendingCropRect,
    setLockAspectRatio,
    applyCrop,
    cancelCrop,
  }
}
