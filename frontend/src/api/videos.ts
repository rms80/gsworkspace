const API_BASE = '/api/items'

export interface UploadVideoResult {
  success: boolean
  url: string
}

/**
 * Upload a video file to S3 and return the S3 URL.
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

  // Convert file to base64 for upload
  const base64 = await fileToBase64(file)

  const response = await fetch(`${API_BASE}/upload-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoData: base64,
      filename: file.name,
      contentType: file.type
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to upload video: ${response.statusText}`)
  }

  const result: UploadVideoResult = await response.json()
  return result.url
}

/**
 * Convert a File to base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface CropVideoResult {
  url: string
}

/**
 * Process a video on the server (crop, speed change, and/or audio removal) and save to S3.
 * Returns the S3 URL of the processed video.
 */
export async function cropVideo(
  src: string,
  cropRect?: { x: number; y: number; width: number; height: number },
  speed?: number,
  removeAudio?: boolean
): Promise<string> {
  const response = await fetch(`${API_BASE}/crop-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src, cropRect, speed, removeAudio }),
  })
  if (!response.ok) {
    throw new Error(`Failed to process video: ${response.statusText}`)
  }
  const result: CropVideoResult = await response.json()
  return result.url
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
