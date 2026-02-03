const API_BASE = '/api/items'

export interface UploadVideoResult {
  success: boolean
  url: string
}

/**
 * Upload a video file to storage and return the URL.
 * Uses multipart/form-data for efficient upload (no base64 overhead).
 * In offline mode, stores in IndexedDB and returns a blob URL.
 */
export async function uploadVideo(
  file: File,
  isOffline: boolean = false
): Promise<string> {
  if (isOffline) {
    // In offline mode, create a blob URL for local playback
    // The video will be stored with the scene data
    return URL.createObjectURL(file)
  }

  const formData = new FormData()
  formData.append('video', file)

  const response = await fetch(`${API_BASE}/upload-video`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser sets it with boundary automatically
  })

  if (!response.ok) {
    throw new Error(`Failed to upload video: ${response.statusText}`)
  }

  const result: UploadVideoResult = await response.json()
  return result.url
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
): Promise<void> {
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
