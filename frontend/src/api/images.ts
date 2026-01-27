const API_BASE = '/api/items'

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
 * Crop an image on the server and save the cropped version to S3.
 * Returns the S3 URL of the cropped image.
 */
export async function cropImage(
  src: string,
  cropRect: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const response = await fetch(`${API_BASE}/crop-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src, cropRect }),
  })
  if (!response.ok) {
    throw new Error(`Failed to crop image: ${response.statusText}`)
  }
  const result: CropImageResult = await response.json()
  return result.url
}

export async function uploadImage(
  dataUrl: string,
  filename: string = 'image.png'
): Promise<string> {
  const response = await fetch(`${API_BASE}/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, filename }),
  })
  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.statusText}`)
  }
  const result: UploadImageResult = await response.json()
  return result.url
}
