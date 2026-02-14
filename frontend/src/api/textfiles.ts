import { validateUuid } from '../utils/validation'
import { ACTIVE_WORKSPACE } from './workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadTextFileResult {
  success: boolean
  url: string
}

/**
 * Upload a text file data URL to storage and return the public URL.
 */
export async function uploadTextFile(
  dataUrl: string,
  sceneId: string,
  itemId: string,
  filename: string = 'document.txt',
  fileFormat: string = 'txt'
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(itemId, 'item ID')
  const response = await fetch(`${API_BASE}/upload-textfile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ textData: dataUrl, sceneId, itemId, filename, fileFormat }),
  })
  if (!response.ok) {
    throw new Error(`Failed to upload text file: ${response.statusText}`)
  }
  const result: UploadTextFileResult = await response.json()
  return result.url
}
