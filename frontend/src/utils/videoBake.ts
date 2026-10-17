import { v4 as uuidv4 } from 'uuid'
import { VideoItem } from '../types'
import { bakeVideoEdits, duplicateVideoFiles, resizeVideo, VideoEdits } from '../api/videoTools'

/**
 * Video counterparts of the image bake operations (see utils/imageBake). Results are saved as the
 * original file of a new item id and returned as a replacement item shown at the same place.
 */

/** The edits on a video item, in the form the server processes them */
export function videoEditsOf(item: VideoItem): VideoEdits {
  const origW = item.originalWidth ?? item.width
  const origH = item.originalHeight ?? item.height
  const crop = item.cropRect
  const isFullFrame = !crop || (
    Math.abs(crop.x) < 1 && Math.abs(crop.y) < 1 &&
    Math.abs(crop.width - origW) < 1 && Math.abs(crop.height - origH) < 1
  )
  return {
    cropRect: isFullFrame ? undefined : crop,
    speed: item.speedFactor && item.speedFactor !== 1 ? item.speedFactor : undefined,
    removeAudio: item.removeAudio || undefined,
    trim: item.trim ? { start: item.trimStart ?? 0, end: item.trimEnd ?? 0 } : undefined,
  }
}

export function hasVideoEdits(item: VideoItem): boolean {
  const e = videoEditsOf(item)
  return !!(e.cropRect || e.speed || e.removeAudio || (e.trim && (e.trim.start > 0 || e.trim.end > 0)))
}

/** Pixel size of what the video item shows: its crop (as rendered, with even dimensions) or the full frame */
export function videoDisplayPixelSize(item: VideoItem): { width: number; height: number } {
  const crop = videoEditsOf(item).cropRect
  if (crop) return { width: Math.round(crop.width / 2) * 2, height: Math.round(crop.height / 2) * 2 }
  return { width: item.originalWidth ?? item.width, height: item.originalHeight ?? item.height }
}

/** The item without any edits or rendered-edit fields */
function withoutEdits(item: VideoItem): Omit<VideoItem, 'cropRect' | 'cropSrc' | 'cropSrcFileSize' | 'speedFactor' | 'removeAudio' | 'trim' | 'trimStart' | 'trimEnd'> {
  const {
    cropRect: _cropRect, cropSrc: _cropSrc, cropSrcFileSize: _cropSrcFileSize, speedFactor: _speedFactor,
    removeAudio: _removeAudio, trim: _trim, trimStart: _trimStart, trimEnd: _trimEnd, ...rest
  } = item
  return rest
}

/** Bakes a video's edits (trim, crop, speed, audio removal): the replacement has no edits */
export async function bakeVideo(item: VideoItem, sceneId: string): Promise<VideoItem> {
  const newId = uuidv4()
  const result = await bakeVideoEdits(sceneId, item.id, newId, videoEditsOf(item))
  return {
    ...withoutEdits(item),
    id: newId,
    src: result.url,
    originalWidth: result.width,
    originalHeight: result.height,
    fileSize: result.fileSize,
  }
}

/** Bakes a resize to exactly width×height (even), displayed at the same size. Only for unedited videos. */
export async function bakeVideoResize(item: VideoItem, sceneId: string, width: number, height: number, nearest: boolean): Promise<VideoItem> {
  if (hasVideoEdits(item)) throw new Error('Cannot resize a video with edits')
  const newId = uuidv4()
  const result = await resizeVideo(sceneId, item.id, newId, width, height, nearest)
  return {
    ...withoutEdits(item),
    id: newId,
    src: result.url,
    originalWidth: width,
    originalHeight: height,
    fileSize: result.fileSize,
  }
}

/**
 * Duplicates a video: copies the source file (and the rendered edited file, if any) to a new id
 * and returns a full copy of the item - edits included - moved by (offsetX, offsetY). If the
 * original has edits that haven't been rendered yet, the copy has no cropSrc; callers can render it.
 */
export async function duplicateVideo(sceneId: string, item: VideoItem, offsetX: number, offsetY: number): Promise<VideoItem> {
  const newId = uuidv4()
  const result = await duplicateVideoFiles(sceneId, item.id, newId, hasVideoEdits(item) && !!item.cropSrc)
  const { cropSrc: _cropSrc, cropSrcFileSize: _cropSrcFileSize, ...rest } = item
  return {
    ...rest,
    id: newId,
    src: result.url,
    x: item.x + offsetX,
    y: item.y + offsetY,
    fileSize: result.fileSize,
    ...(result.cropUrl
      ? { cropSrc: `${result.cropUrl}${result.cropUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, cropSrcFileSize: result.cropFileSize }
      : {}),
  }
}
