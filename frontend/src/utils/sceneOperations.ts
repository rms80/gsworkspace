/**
 * Scene editing operations - duplicate, etc.
 * These functions handle the data fetching and processing for scene edits,
 * returning results that callers can use to update the scene.
 */

import { ImageItem, VideoItem } from '../types'
import { getContentData } from '../api/scenes'
import { uploadImage } from '../api/images'
import { uploadVideo } from '../api/videos'

export interface DuplicateImageResult {
  url: string
  pixelWidth: number
  pixelHeight: number
  visualWidth: number
  visualHeight: number
  positionX: number
  positionY: number
  name: string
}

export interface DuplicateVideoResult {
  url: string
  pixelWidth: number
  pixelHeight: number
  visualWidth: number
  visualHeight: number
  positionX: number
  positionY: number
  name: string
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

  // Upload as new file
  const url = await uploadImage(dataUrl, `${imageItem.name || 'image'}.png`)

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
    url,
    pixelWidth,
    pixelHeight,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: imageItem.name || 'Image',
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

  // Upload as new file
  const url = await uploadVideo(file, isOffline)

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
    url,
    pixelWidth,
    pixelHeight,
    visualWidth,
    visualHeight,
    positionX,
    positionY,
    name: videoItem.name || 'Video',
  }
}
