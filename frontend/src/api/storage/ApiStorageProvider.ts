import { Scene } from '../../types'
import { SerializedHistory } from '../../history/types'
import { StorageProvider, SceneMetadata, SceneTimestamp } from './StorageProvider'
import { validateUuid } from '../../utils/validation'
import { ACTIVE_WORKSPACE } from '../workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/scenes`

export class ApiStorageProvider implements StorageProvider {
  async saveScene(scene: Scene): Promise<void> {
    validateUuid(scene.id, 'scene ID')
    const body = JSON.stringify(scene)
    const response = await fetch(`${API_BASE}/${scene.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!response.ok) {
      // Status 413: include payload size in the message, since the body parser
      // may reject the request before our handler can format a JSON error.
      if (response.status === 413) {
        const mb = (body.length / (1024 * 1024)).toFixed(1)
        throw new Error(`Scene too large to save (${mb} MB). The server rejected the upload — embedded media (videos/images as data URLs) is likely the cause.`)
      }
      const detail = await response.text().catch(() => '')
      const trimmed = detail.trim().slice(0, 300)
      throw new Error(`Failed to save scene: ${response.status} ${response.statusText}${trimmed ? ` — ${trimmed}` : ''}`)
    }
  }

  async loadScene(id: string): Promise<Scene> {
    validateUuid(id, 'scene ID')
    const response = await fetch(`${API_BASE}/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to load scene: ${response.statusText}`)
    }
    return response.json()
  }

  async listScenes(): Promise<SceneMetadata[]> {
    const response = await fetch(API_BASE)
    if (!response.ok) {
      throw new Error(`Failed to list scenes: ${response.statusText}`)
    }
    return response.json()
  }

  async deleteScene(id: string): Promise<void> {
    validateUuid(id, 'scene ID')
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete scene: ${response.statusText}`)
    }
  }

  async loadHistory(sceneId: string): Promise<SerializedHistory> {
    validateUuid(sceneId, 'scene ID')
    const response = await fetch(`${API_BASE}/${sceneId}/history`)
    if (!response.ok) {
      throw new Error(`Failed to load history: ${response.statusText}`)
    }
    return response.json()
  }

  async saveHistory(sceneId: string, history: SerializedHistory): Promise<void> {
    validateUuid(sceneId, 'scene ID')
    const response = await fetch(`${API_BASE}/${sceneId}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(history),
    })
    if (!response.ok) {
      throw new Error(`Failed to save history: ${response.statusText}`)
    }
  }

  async getSceneTimestamp(id: string): Promise<SceneTimestamp | null> {
    validateUuid(id, 'scene ID')
    try {
      const response = await fetch(`${API_BASE}/${id}/timestamp`)
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`Failed to get scene timestamp: ${response.statusText}`)
      }
      return response.json()
    } catch {
      // Network errors or other failures - return null to avoid disrupting the user
      return null
    }
  }
}
