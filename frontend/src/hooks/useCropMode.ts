import { useState, useEffect } from 'react'
import { CanvasItem, CropRect } from '../types'
import { cropImage } from '../api/images'
import { computeCropChanges } from '../utils/imageCrop'

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

    const itemId = croppingImageId
    const cropRect = pendingCropRect
    const { changes, isFullImage } = computeCropChanges(item, img.naturalWidth, img.naturalHeight, cropRect)
    onUpdateItem(itemId, changes)

    setCroppingImageId(null)
    setPendingCropRect(null)
    setLockAspectRatio(false)

    // No server-side crop when the crop was removed, or in offline mode
    if (isFullImage || isOffline) {
      return
    }

    setProcessingImageId(itemId)
    cropImage(sceneId, itemId, cropRect)
      .then((result) => {
        // Add cache-busting timestamp to force browser to fetch fresh image
        const cacheBustedUrl = `${result.url}${result.url.includes('?') ? '&' : '?'}t=${Date.now()}`
        onUpdateItem(itemId, { cropSrc: cacheBustedUrl, cropSrcFileSize: result.fileSize })
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
