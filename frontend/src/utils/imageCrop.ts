import { CropRect } from '../types'
import { getContentData } from '../api/scenes'

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
