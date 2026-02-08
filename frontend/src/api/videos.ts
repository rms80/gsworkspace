import { ACTIVE_WORKSPACE } from './workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadVideoResult {
  success: boolean
  url: string
  transcoded?: boolean
}

/**
 * Upload a video file to storage and return the result.
 * Uses multipart/form-data for efficient upload (no base64 overhead).
 * In offline mode, stores in IndexedDB and returns a blob URL.
 * Non-browser-native formats (e.g. MKV) are transcoded to MP4 on the server.
 */
export async function uploadVideo(
  file: File,
  sceneId: string,
  itemId: string,
  isOffline: boolean = false
): Promise<UploadVideoResult> {
  if (isOffline) {
    // In offline mode, create a blob URL for local playback
    return { success: true, url: URL.createObjectURL(file) }
  }

  const formData = new FormData()
  formData.append('video', file)
  formData.append('sceneId', sceneId)
  formData.append('itemId', itemId)

  const response = await fetch(`${API_BASE}/upload-video`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser sets it with boundary automatically
  })

  if (!response.ok) {
    throw new Error(`Failed to upload video: ${response.statusText}`)
  }

  const result: UploadVideoResult = await response.json()
  return result
}

/**
 * Process a video on the server (crop, speed change, audio removal, and/or trim) and save to storage.
 * After success, use getContentUrl(sceneId, videoId, 'video', 'mp4', true) to get the processed video URL.
 * @param extension - The original video file extension (e.g., 'mp4', 'mov', 'webm')
 */
export async function cropVideo(
  sceneId: string,
  videoId: string,
  cropRect?: { x: number; y: number; width: number; height: number },
  speed?: number,
  removeAudio?: boolean,
  trim?: { start: number; end: number },
  extension?: string
): Promise<{ fileSize: number }> {
  const requestBody = { sceneId, videoId, cropRect, speed, removeAudio, trim, extension }
  const response = await fetch(`${API_BASE}/crop-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errorJson = await response.json()
      errorDetail = errorJson.error || errorDetail
    } catch { /* ignore parse error */ }
    console.error('cropVideo failed:', {
      status: response.status,
      error: errorDetail,
      request: { sceneId, videoId, cropRect, speed, removeAudio, trim },
    })
    throw new Error(`Failed to process video: ${errorDetail}`)
  }
  return response.json()
}

/**
 * Get video dimensions and file size from a file
 */
export function getVideoDimensions(file: File): Promise<{ width: number; height: number; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        fileSize: file.size,
      })
    }

    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video metadata'))
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * Try to get video dimensions from a file. Returns null on failure
 * (e.g. for MKV or other formats the browser can't parse).
 */
export async function getVideoDimensionsSafe(file: File): Promise<{ width: number; height: number; fileSize: number } | null> {
  try {
    return await getVideoDimensions(file)
  } catch {
    return null
  }
}

/**
 * Get video dimensions from a URL (works for transcoded MP4s with faststart).
 * Creates a temporary <video> element and waits for loadedmetadata.
 */
export function getVideoDimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'

    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      })
      video.src = ''
    }

    video.onerror = () => {
      reject(new Error('Failed to load video metadata from URL'))
      video.src = ''
    }

    video.src = url
  })
}

export interface ConvertMediaResult {
  url: string
  newItemId: string
  width: number
  height: number
  fileSize: number
}

/**
 * Convert a media item between video and GIF formats on the server.
 * @param sceneId - The scene containing the item
 * @param itemId - The source item ID
 * @param targetFormat - 'gif' to convert video→GIF, 'mp4' to convert GIF→video
 * @param isEdit - Whether to use the edited (.crop) version of the source
 * @param extension - The source file extension (e.g., 'mp4', 'gif', 'webm')
 */
export async function convertMedia(
  sceneId: string,
  itemId: string,
  targetFormat: 'gif' | 'mp4',
  isEdit: boolean,
  extension: string
): Promise<ConvertMediaResult> {
  const response = await fetch(`${API_BASE}/convert-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, itemId, targetFormat, isEdit, extension }),
  })
  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errorJson = await response.json()
      errorDetail = errorJson.error || errorDetail
    } catch { /* ignore parse error */ }
    throw new Error(`Failed to convert media: ${errorDetail}`)
  }
  return response.json()
}

/** Video extensions recognized beyond MIME type detection */
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'ogg', 'ogv', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts', 'mts',
])

/**
 * Check if a file is a video, using both MIME type and file extension.
 * Needed because .mkv files may get an empty or generic MIME type in some browsers.
 */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? VIDEO_EXTENSIONS.has(ext) : false
}
