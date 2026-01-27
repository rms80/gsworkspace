import { CropRect } from '../types'

/**
 * Loads an image from a source URL, crops it using canvas, and returns a cropped data URL.
 * For S3 URLs, loads via /api/proxy-image to avoid CORS canvas taint.
 * For data URLs, loads directly.
 */
export function getCroppedImageDataUrl(src: string, cropRect: CropRect): Promise<string> {
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

    // For S3 URLs, proxy through backend to avoid CORS canvas taint
    if (src.startsWith('data:')) {
      img.src = src
    } else {
      img.src = `/api/proxy-image?url=${encodeURIComponent(src)}`
    }
  })
}
