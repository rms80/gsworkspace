// Re-export from storage module for backwards compatibility
export {
  saveScene,
  loadScene,
  listScenes,
  deleteScene,
  saveHistory,
  loadHistory,
  isOfflineMode,
  setOfflineMode,
  storageProvider,
  getSceneTimestamp,
  getStorageMode,
  setStorageMode,
} from './storage'

export type { SceneMetadata, SceneTimestamp, StorageMode } from './storage'

import { validateUuid } from '../utils/validation'

const API_BASE = '/api/scenes'

/**
 * Get the URL for a content item in a scene.
 * Constructs the permanent S3 URL for videos, images, or html content.
 */
export async function getContentUrl(
  sceneId: string,
  contentId: string,
  contentType: 'video' | 'image' | 'html',
  extension?: string,
  isEdit: boolean = false
): Promise<string> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(contentId, 'content ID')
  const params = new URLSearchParams({
    contentId,
    contentType,
    isEdit: String(isEdit),
  })
  if (extension) {
    params.set('extension', extension)
  }

  const response = await fetch(`${API_BASE}/${sceneId}/content-url?${params}`)
  if (!response.ok) {
    throw new Error(`Failed to get content URL: ${response.statusText}`)
  }
  const result = await response.json()
  return result.url
}

/**
 * Get the actual data for a content item in a scene.
 * Returns the file as a Blob, avoiding the need for proxy endpoints.
 */
export async function getContentData(
  sceneId: string,
  contentId: string,
  contentType: 'video' | 'image' | 'html',
  isEdit: boolean = false
): Promise<Blob> {
  validateUuid(sceneId, 'scene ID')
  validateUuid(contentId, 'content ID')
  const params = new URLSearchParams({
    contentId,
    contentType,
    isEdit: String(isEdit),
  })

  const response = await fetch(`${API_BASE}/${sceneId}/content-data?${params}`)
  if (!response.ok) {
    throw new Error(`Failed to get content data: ${response.statusText}`)
  }
  return response.blob()
}
