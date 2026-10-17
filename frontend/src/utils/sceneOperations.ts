/**
 * Scene editing operations - duplicate, etc.
 * These functions handle the data fetching and processing for scene edits,
 * returning results that callers can use to update the scene.
 */

import { ImageItem, VideoItem } from '../types'
import { getContentData } from '../api/scenes'
import { uploadImage } from '../api/images'
import { convertMedia, renderVideoGifPreview, GifConversionOptions, VideoGifPreview } from '../api/videos'
import { v4 as uuidv4 } from 'uuid'

/**
 * Duplicate an image item.
 * Copies the original (uncropped) image to a new file and returns a full copy of the item -
 * crop rect, size, scale, rotation etc. included - moved by (offsetX, offsetY).
 * The copy has no server-side crop file (cropSrc) yet; callers can regenerate it from the crop rect.
 */
export async function duplicateImage(
  sceneId: string,
  imageItem: ImageItem,
  offsetX: number,
  offsetY: number
): Promise<ImageItem> {
  // Data/blob URLs (not yet on the server) are read directly; otherwise fetch the original from the server
  const isLocalSrc = imageItem.src.startsWith('data:') || imageItem.src.startsWith('blob:')
  const blob = isLocalSrc
    ? await (await fetch(imageItem.src)).blob()
    : await getContentData(sceneId, imageItem.id, 'image', false)

  // Convert blob to data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read image blob'))
    reader.readAsDataURL(blob)
  })

  // Generate item ID and upload to scene folder
  // Preserve source extension (e.g. gif) instead of always using png
  const ext = isLocalSrc
    ? (blob.type.match(/^image\/(\w+)/)?.[1] ?? 'png')
    : getExtensionFromSrc(imageItem.src, 'png')
  const id = uuidv4()
  const url = await uploadImage(dataUrl, sceneId, id, `${imageItem.name || 'image'}.${ext}`)

  const { cropSrc: _cropSrc, cropSrcFileSize: _cropSrcFileSize, ...rest } = imageItem
  return {
    ...rest,
    id,
    src: url,
    x: imageItem.x + offsetX,
    y: imageItem.y + offsetY,
    fileSize: blob.size,
  }
}

/**
 * Get file extension from a src URL.
 */
function getExtensionFromSrc(src: string, fallback: string): string {
  const match = src.match(/\.(\w+)(?:\?|$)/)
  if (match) return match[1].toLowerCase()
  return fallback
}

export interface ConvertToGifResult {
  id: string
  url: string
  pixelWidth: number
  pixelHeight: number
  visualWidth: number
  visualHeight: number
  positionX: number
  positionY: number
  name: string
  fileSize: number
}

export interface ConvertToVideoResult {
  id: string
  url: string
  pixelWidth: number
  pixelHeight: number
  visualWidth: number
  visualHeight: number
  positionX: number
  positionY: number
  name: string
  fileSize: number
}

/** The server-side file a video converts from: its edited version if it has edits, else the original */
function videoSourceFile(videoItem: VideoItem): { hasEdit: boolean; extension: string } {
  const hasEdit = !!(videoItem.cropRect || videoItem.speedFactor || videoItem.removeAudio || videoItem.trim)
  // Edited videos are always saved as mp4; original uses source extension
  const extension = hasEdit ? 'mp4' : getExtensionFromSrc(videoItem.src, 'mp4')
  return { hasEdit, extension }
}

/** Render (as a temporary preview) the GIF a video item converts to with the given settings */
export function renderGifConversionPreview(
  sceneId: string,
  videoItem: VideoItem,
  gifOptions: GifConversionOptions,
  signal?: AbortSignal
): Promise<VideoGifPreview> {
  const { hasEdit, extension } = videoSourceFile(videoItem)
  return renderVideoGifPreview(sceneId, videoItem.id, hasEdit, extension, gifOptions, signal)
}

/**
 * Convert a video item to a GIF.
 * Calls the server to do ffmpeg conversion, returns info to add the new GIF as an image item.
 */
export async function convertToGif(
  sceneId: string,
  videoItem: VideoItem,
  gifOptions?: GifConversionOptions
): Promise<ConvertToGifResult> {
  const { hasEdit, extension } = videoSourceFile(videoItem)

  const result = await convertMedia(sceneId, videoItem.id, 'gif', hasEdit, extension, gifOptions)

  // Calculate visual size from source item
  const scaleX = videoItem.scaleX ?? 1
  const scaleY = videoItem.scaleY ?? 1
  const visualWidth = Math.round(videoItem.width * scaleX)
  const visualHeight = Math.round(videoItem.height * scaleY)
  const gap = 20

  const positionX = videoItem.x + visualWidth + gap + visualWidth / 2
  const positionY = videoItem.y + visualHeight / 2

  return {
    id: result.newItemId,
    url: result.url,
    pixelWidth: result.width,
    pixelHeight: result.height,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: (videoItem.name || 'Video') + '_gif',
    fileSize: result.fileSize,
  }
}

/**
 * Convert a GIF image item to a video.
 * Calls the server to do ffmpeg conversion, returns info to add the new video item.
 */
export async function convertToVideo(
  sceneId: string,
  imageItem: ImageItem
): Promise<ConvertToVideoResult> {
  const hasEdit = !!imageItem.cropRect
  // Edited GIFs are always saved as gif; original uses source extension
  const extension = 'gif'

  const result = await convertMedia(sceneId, imageItem.id, 'mp4', hasEdit, extension)

  // Calculate visual size from source item
  const scaleX = imageItem.scaleX ?? 1
  const scaleY = imageItem.scaleY ?? 1
  const visualWidth = Math.round(imageItem.width * scaleX)
  const visualHeight = Math.round(imageItem.height * scaleY)
  const gap = 20

  const positionX = imageItem.x + visualWidth + gap + visualWidth / 2
  const positionY = imageItem.y + visualHeight / 2

  return {
    id: result.newItemId,
    url: result.url,
    pixelWidth: result.width,
    pixelHeight: result.height,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: (imageItem.name || 'Image') + '_mp4',
    fileSize: result.fileSize,
  }
}
