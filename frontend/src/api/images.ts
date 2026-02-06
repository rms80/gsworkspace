import { validateUuid } from '../utils/validation'
import { ACTIVE_WORKSPACE } from './workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadImageResult {
  success: boolean
  url: string
}

/**
 * Upload an image data URL to S3 and return the S3 URL.
 * This is called immediately on paste/drop to avoid storing
 * large data URLs in memory and history.
 */
export interface CropImageResult {
  url: string
}

/**
 * Crop an image on the server and save the cropped version to storage.
 * Returns the URL of the cropped image.
 */
export async function cropImage(
  sceneId: string,
  imageId: string,
  cropRect: { x: number; y: number; width: number; height: number }
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(imageId, 'image ID')
  const response = await fetch(`${API_BASE}/crop-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, imageId, cropRect }),
  })
  if (!response.ok) {
    throw new Error(`Failed to crop image: ${response.statusText}`)
  }
  const result: CropImageResult = await response.json()
  return result.url
}

export async function uploadImage(
  dataUrl: string,
  sceneId: string,
  itemId: string,
  filename: string = 'image.png'
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(itemId, 'item ID')
  const response = await fetch(`${API_BASE}/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, sceneId, itemId, filename }),
  })
  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.statusText}`)
  }
  const result: UploadImageResult = await response.json()
  return result.url
}

/**
 * Get image dimensions and file size from a File object.
 * Similar to getVideoDimensions in videos.ts.
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSize: file.size,
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }

    img.src = URL.createObjectURL(file)
  })
}
