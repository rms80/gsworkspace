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
  fileSize: number
}

/**
 * Crop an image on the server and save the cropped version to storage.
 * Returns the URL and file size of the cropped image.
 */
export async function cropImage(
  sceneId: string,
  imageId: string,
  cropRect: { x: number; y: number; width: number; height: number }
): Promise<CropImageResult> {
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
  return response.json()
}

/**
 * Bake an image's crop on the server: the cropped pixels are saved as the original
 * file of a new image item (newImageId). The source image file is left untouched.
 */
export async function bakeImageCrop(
  sceneId: string,
  imageId: string,
  newImageId: string,
  cropRect: { x: number; y: number; width: number; height: number }
): Promise<CropImageResult> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(imageId, 'image ID')
  validateUuid(newImageId, 'new image ID')
  const response = await fetch(`${API_BASE}/bake-crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, imageId, newImageId, cropRect }),
  })
  if (!response.ok) {
    throw new Error(`Failed to bake image crop: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Resize an image on the server to exactly width×height: the resized pixels are saved as the
 * original file of a new image item (newImageId). The source image file is left untouched.
 */
export async function resizeImage(
  sceneId: string,
  imageId: string,
  newImageId: string,
  width: number,
  height: number,
  nearest: boolean
): Promise<CropImageResult> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(imageId, 'image ID')
  validateUuid(newImageId, 'new image ID')
  const response = await fetch(`${API_BASE}/resize-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, imageId, newImageId, width, height, nearest }),
  })
  if (!response.ok) {
    throw new Error(`Failed to resize image: ${response.statusText}`)
  }
  return response.json()
}

export interface GifFrame {
  imageId: string
  cropRect?: { x: number; y: number; width: number; height: number }
}

interface CreateGifParams {
  sceneId: string
  frames: GifFrame[]
  /** Display time of each frame in ms */
  delays: number[]
  width: number
  height: number
}

async function postCreateGif(body: object): Promise<Response> {
  const response = await fetch(`${API_BASE}/create-gif`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error ?? `Failed to create GIF: ${response.statusText}`)
  }
  return response
}

/** Create a temporary, reduced-size preview of an animated GIF built from image frames */
export async function createGifPreview(params: CreateGifParams): Promise<{ url: string; previewId: string }> {
  validateUuid(params.sceneId, 'scene ID')
  return (await postCreateGif({ ...params, preview: true })).json()
}

/** Create an animated GIF from image frames, saved as the original file of a new image item */
export async function createGif(
  params: CreateGifParams & { newImageId: string }
): Promise<{ url: string; width: number; height: number; fileSize: number }> {
  validateUuid(params.sceneId, 'scene ID')
  validateUuid(params.newImageId, 'new image ID')
  return (await postCreateGif(params)).json()
}

/** Delete a temporary GIF preview */
export async function discardGifPreview(previewId: string): Promise<void> {
  await fetch(`${API_BASE}/discard-gif-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ previewId }),
  })
}

export async function uploadImage(
  dataUrl: string,
  sceneId: string,
  itemId: string,
  filename: string = 'image.png',
  isCrop: boolean = false,
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(itemId, 'item ID')
  const response = await fetch(`${API_BASE}/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, sceneId, itemId, filename, isCrop }),
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
