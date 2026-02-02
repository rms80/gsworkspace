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
} from './storage'

export type { SceneMetadata, SceneTimestamp } from './storage'

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
