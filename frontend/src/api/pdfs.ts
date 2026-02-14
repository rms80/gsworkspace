import { validateUuid } from '../utils/validation'
import { ACTIVE_WORKSPACE } from './workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadPdfResult {
  success: boolean
  url: string
}

/**
 * Upload a PDF data URL to storage and return the public URL.
 */
export async function uploadPdf(
  dataUrl: string,
  sceneId: string,
  itemId: string,
  filename: string = 'document.pdf'
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(itemId, 'item ID')
  const response = await fetch(`${API_BASE}/upload-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfData: dataUrl, sceneId, itemId, filename }),
  })
  if (!response.ok) {
    throw new Error(`Failed to upload PDF: ${response.statusText}`)
  }
  const result: UploadPdfResult = await response.json()
  return result.url
}

/**
 * Upload a PDF thumbnail (PNG data URL) to storage and return the public URL.
 */
export async function uploadPdfThumbnail(
  dataUrl: string,
  sceneId: string,
  itemId: string,
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(itemId, 'item ID')
  const response = await fetch(`${API_BASE}/upload-pdf-thumbnail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, sceneId, itemId }),
  })
  if (!response.ok) {
    throw new Error(`Failed to upload PDF thumbnail: ${response.statusText}`)
  }
  const result: UploadPdfResult = await response.json()
  return result.url
}
