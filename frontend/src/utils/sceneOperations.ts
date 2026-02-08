/**
 * Scene editing operations - duplicate, etc.
 * These functions handle the data fetching and processing for scene edits,
 * returning results that callers can use to update the scene.
 */

import { ImageItem, VideoItem } from '../types'
import { getContentData } from '../api/scenes'
import { uploadImage } from '../api/images'
import { uploadVideo, convertMedia } from '../api/videos'
import { v4 as uuidv4 } from 'uuid'

export interface DuplicateImageResult {
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

export interface DuplicateVideoResult {
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

/**
 * Duplicate an image item.
 * Fetches the image data (edited version if available), uploads as new file,
 * and returns the information needed to create the duplicate item.
 */
export async function duplicateImage(
  sceneId: string,
  imageItem: ImageItem
): Promise<DuplicateImageResult> {
  // Determine if we're duplicating the edited (cropped) version
  const hasEdit = !!imageItem.cropRect

  // Get the content data directly from the server
  const blob = await getContentData(sceneId, imageItem.id, 'image', hasEdit)

  // Convert blob to data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read image blob'))
    reader.readAsDataURL(blob)
  })

  // Load into an Image element to get the actual pixel dimensions
  const { width: pixelWidth, height: pixelHeight } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image for duplication'))
    img.src = dataUrl
  })

  // Generate item ID and upload to scene folder
  const id = uuidv4()
  const url = await uploadImage(dataUrl, sceneId, id, `${imageItem.name || 'image'}.png`)

  // Calculate the visual size the original is displayed at
  const scaleX = imageItem.scaleX ?? 1
  const scaleY = imageItem.scaleY ?? 1
  const visualWidth = Math.round(imageItem.width * scaleX)
  const visualHeight = Math.round(imageItem.height * scaleY)
  const gap = 20

  // Calculate position to the right of original
  // onAddImageAt centers at given position, so calculate center of new position
  const positionX = imageItem.x + visualWidth + gap + visualWidth / 2
  const positionY = imageItem.y + visualHeight / 2

  return {
    id,
    url,
    pixelWidth,
    pixelHeight,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: imageItem.name || 'Image',
    fileSize: blob.size,
  }
}

/**
 * Duplicate a video item.
 * Fetches the video data (edited version if available), uploads as new file,
 * and returns the information needed to create the duplicate item.
 */
export async function duplicateVideo(
  sceneId: string,
  videoItem: VideoItem,
  isOffline: boolean
): Promise<DuplicateVideoResult> {
  // Determine if we're duplicating the edited version
  const hasEdit = !!(videoItem.cropRect || videoItem.speedFactor || videoItem.removeAudio || videoItem.trim)

  // Get the content data directly from the server
  const blob = await getContentData(sceneId, videoItem.id, 'video', hasEdit)

  // Create a File object for upload (edited videos are always mp4)
  const ext = hasEdit ? 'mp4' : (videoItem.src.match(/\.(\w+)(?:\?|$)/)?.[1] || 'mp4')
  const file = new File([blob], `${videoItem.name || 'video'}.${ext}`, { type: `video/${ext}` })

  // Generate item ID and upload to scene folder
  const id = uuidv4()
  const uploadResult = await uploadVideo(file, sceneId, id, isOffline)
  const url = uploadResult.url

  // Calculate the visual size the original is displayed at
  const scaleX = videoItem.scaleX ?? 1
  const scaleY = videoItem.scaleY ?? 1
  const visualWidth = Math.round(videoItem.width * scaleX)
  const visualHeight = Math.round(videoItem.height * scaleY)
  const gap = 20

  // Determine the actual pixel dimensions of what we're duplicating
  // If cropped/edited, the pixel dimensions are the crop rect size
  // Otherwise, use the original pixel dimensions
  const pixelWidth = videoItem.cropRect
    ? Math.round(videoItem.cropRect.width)
    : (videoItem.originalWidth ?? visualWidth)
  const pixelHeight = videoItem.cropRect
    ? Math.round(videoItem.cropRect.height)
    : (videoItem.originalHeight ?? visualHeight)

  // Calculate position to the right of original
  // onAddVideoAt centers at given position, so calculate center of new position
  const positionX = videoItem.x + visualWidth + gap + visualWidth / 2
  const positionY = videoItem.y + visualHeight / 2

  return {
    id,
    url,
    pixelWidth,
    pixelHeight,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: videoItem.name || 'Video',
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

/**
 * Convert a video item to a GIF.
 * Calls the server to do ffmpeg conversion, returns info to add the new GIF as an image item.
 */
export async function convertToGif(
  sceneId: string,
  videoItem: VideoItem
): Promise<ConvertToGifResult> {
  const hasEdit = !!(videoItem.cropRect || videoItem.speedFactor || videoItem.removeAudio || videoItem.trim)
  // Edited videos are always saved as mp4; original uses source extension
  const extension = hasEdit ? 'mp4' : getExtensionFromSrc(videoItem.src, 'mp4')

  const result = await convertMedia(sceneId, videoItem.id, 'gif', hasEdit, extension)

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
