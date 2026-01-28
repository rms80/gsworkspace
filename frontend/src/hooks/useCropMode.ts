import { useState, useEffect } from 'react'
import { CanvasItem, CropRect } from '../types'
import { cropImage } from '../api/images'

interface UseCropModeParams {
  items: CanvasItem[]
  loadedImages: Map<string, HTMLImageElement>
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
}

export interface CropMode {
  croppingImageId: string | null
  pendingCropRect: CropRect | null
  setCroppingImageId: (id: string | null) => void
  setPendingCropRect: (rect: CropRect | null) => void
  applyCrop: () => void
  cancelCrop: () => void
}

export function useCropMode({
  items,
  loadedImages,
  onUpdateItem,
}: UseCropModeParams): CropMode {
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null)
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(null)

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
    const currentSourceW = item.cropRect?.width ?? natW
    const displayScale = item.width / currentSourceW

    const newWidth = pendingCropRect.width * displayScale
    const newHeight = pendingCropRect.height * displayScale

    const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScale
    const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScale
    const newX = offsetX + pendingCropRect.x * displayScale
    const newY = offsetY + pendingCropRect.y * displayScale

    const itemId = croppingImageId
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

    cropImage(item.src, cropRect)
      .then((cropUrl) => {
        onUpdateItem(itemId, { cropSrc: cropUrl })
      })
      .catch((err) => {
        console.error('Failed to create server-side crop, LLM canvas crop still works:', err)
      })
  }

  const cancelCrop = () => {
    setCroppingImageId(null)
    setPendingCropRect(null)
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
    setCroppingImageId,
    setPendingCropRect,
    applyCrop,
    cancelCrop,
  }
}
