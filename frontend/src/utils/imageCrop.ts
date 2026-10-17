import { CropRect, ImageItem } from '../types'
import { getContentData } from '../api/scenes'

/**
 * Computes the item changes for applying a crop (in source pixels) to an image,
 * keeping the cropped region where it currently sits on the canvas.
 * Any existing crop on the item is replaced. A crop covering the full image removes the crop.
 */
export function computeCropChanges(
  item: ImageItem,
  natW: number,
  natH: number,
  cropRect: CropRect
): { changes: Partial<ImageItem>; isFullImage: boolean } {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1

  const currentSourceW = item.cropRect?.width ?? natW
  const currentSourceH = item.cropRect?.height ?? natH
  const baseDisplayScaleX = item.width / currentSourceW
  const baseDisplayScaleY = item.height / currentSourceH
  const displayScaleX = baseDisplayScaleX * scaleX
  const displayScaleY = baseDisplayScaleY * scaleY

  // Canvas position of the full (uncropped) image's top-left corner
  const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScaleX
  const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScaleY

  // Check if crop covers the full image (within a small tolerance for floating point)
  const isFullImage =
    Math.abs(cropRect.x) < 1 &&
    Math.abs(cropRect.y) < 1 &&
    Math.abs(cropRect.width - natW) < 1 &&
    Math.abs(cropRect.height - natH) < 1

  if (isFullImage) {
    // Remove crop - restore to full image
    return {
      isFullImage,
      changes: {
        x: offsetX,
        y: offsetY,
        width: natW * baseDisplayScaleX,
        height: natH * baseDisplayScaleY,
        cropRect: undefined,
        cropSrc: undefined,
        cropSrcFileSize: undefined,
      },
    }
  }

  return {
    isFullImage,
    changes: {
      x: offsetX + cropRect.x * displayScaleX,
      y: offsetY + cropRect.y * displayScaleY,
      width: cropRect.width * baseDisplayScaleX,
      height: cropRect.height * baseDisplayScaleY,
      cropRect,
    },
  }
}

/**
 * Loads an image from a source URL, crops it using canvas, and returns a cropped data URL.
 * For S3 URLs, loads via getContentData API to avoid CORS canvas taint.
 * For data URLs, loads directly.
 */
export async function getCroppedImageDataUrl(
  sceneId: string,
  itemId: string,
  src: string,
  cropRect: CropRect
): Promise<string> {
  // For data URLs or blob URLs, we can load directly
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return cropImageFromSrc(src, cropRect)
  }

  // For S3 URLs, fetch via getContentData API to avoid CORS issues
  const blob = await getContentData(sceneId, itemId, 'image', false)
  const blobUrl = URL.createObjectURL(blob)
  try {
    return await cropImageFromSrc(blobUrl, cropRect)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Internal helper to crop an image from a src URL
 */
function cropImageFromSrc(src: string, cropRect: CropRect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = cropRect.width
        canvas.height = cropRect.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas 2d context'))
          return
        }
        ctx.drawImage(
          img,
          cropRect.x, cropRect.y, cropRect.width, cropRect.height,
          0, 0, cropRect.width, cropRect.height
        )
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image for cropping'))
    img.src = src
  })
}
