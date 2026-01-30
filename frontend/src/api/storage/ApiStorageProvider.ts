import { Scene } from '../../types'
import { SerializedHistory } from '../../history/types'
import { StorageProvider, SceneMetadata, SceneTimestamp, LoadedScene } from './StorageProvider'

const API_BASE = '/api/scenes'

export class ApiStorageProvider implements StorageProvider {
  async saveScene(scene: Scene): Promise<void> {
    const response = await fetch(`${API_BASE}/${scene.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene),
    })
    if (!response.ok) {
      throw new Error(`Failed to save scene: ${response.statusText}`)
    }
  }

  async loadScene(id: string): Promise<LoadedScene> {
    const response = await fetch(`${API_BASE}/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to load scene: ${response.statusText}`)
    }
    const data = await response.json()
    // Extract assetBaseUrl from response, return scene data separately
    const { assetBaseUrl, ...scene } = data
    return { scene, assetBaseUrl }
  }

  async listScenes(): Promise<SceneMetadata[]> {
    const response = await fetch(API_BASE)
    if (!response.ok) {
      throw new Error(`Failed to list scenes: ${response.statusText}`)
    }
    return response.json()
  }

  async deleteScene(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete scene: ${response.statusText}`)
    }
  }

  async loadHistory(sceneId: string): Promise<SerializedHistory> {
    const response = await fetch(`${API_BASE}/${sceneId}/history`)
    if (!response.ok) {
      throw new Error(`Failed to load history: ${response.statusText}`)
    }
    return response.json()
  }

  async saveHistory(sceneId: string, history: SerializedHistory): Promise<void> {
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
