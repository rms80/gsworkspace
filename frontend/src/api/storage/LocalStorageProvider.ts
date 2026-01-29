import localforage from 'localforage'
import { Scene } from '../../types'
import { SerializedHistory } from '../../history/types'
import { StorageProvider, SceneMetadata } from './StorageProvider'

const SCENE_PREFIX = 'workspaceapp:scene:'
const SCENES_INDEX_KEY = 'workspaceapp:scenes-index'
const HISTORY_PREFIX = 'workspaceapp:history:'

// Configure localforage
localforage.config({
  name: 'workspaceapp',
  storeName: 'scenes',
})

interface ScenesIndex {
  sceneIds: string[]
}

export class LocalStorageProvider implements StorageProvider {
  private getSceneKey(id: string): string {
    return `${SCENE_PREFIX}${id}`
  }

  private getHistoryKey(sceneId: string): string {
    return `${HISTORY_PREFIX}${sceneId}`
  }

  private async getIndex(): Promise<ScenesIndex> {
    const index = await localforage.getItem<ScenesIndex>(SCENES_INDEX_KEY)
    return index || { sceneIds: [] }
  }

  private async setIndex(index: ScenesIndex): Promise<void> {
    await localforage.setItem(SCENES_INDEX_KEY, index)
  }

  async saveScene(scene: Scene): Promise<void> {
    const key = this.getSceneKey(scene.id)
    await localforage.setItem(key, scene)

    // Update index if this is a new scene
    const index = await this.getIndex()
    if (!index.sceneIds.includes(scene.id)) {
      index.sceneIds.push(scene.id)
      await this.setIndex(index)
    }
  }

  async loadScene(id: string): Promise<Scene> {
    const key = this.getSceneKey(id)
    const scene = await localforage.getItem<Scene>(key)
    if (!scene) {
      throw new Error(`Scene not found: ${id}`)
    }
    return scene
  }

  async listScenes(): Promise<SceneMetadata[]> {
    const index = await this.getIndex()
    const metadataList: SceneMetadata[] = []

    for (const sceneId of index.sceneIds) {
      try {
        const scene = await this.loadScene(sceneId)
        metadataList.push({
          id: scene.id,
          name: scene.name,
          createdAt: scene.createdAt,
          modifiedAt: scene.modifiedAt,
          itemCount: scene.items.length,
        })
      } catch {
        // Scene in index but not found - skip it
        console.warn(`Scene ${sceneId} in index but not found, skipping`)
      }
    }

    return metadataList
  }

  async deleteScene(id: string): Promise<void> {
    const key = this.getSceneKey(id)
    await localforage.removeItem(key)

    // Also remove history
    const historyKey = this.getHistoryKey(id)
    await localforage.removeItem(historyKey)

    // Update index
    const index = await this.getIndex()
    index.sceneIds = index.sceneIds.filter((sceneId) => sceneId !== id)
    await this.setIndex(index)
  }

  async loadHistory(sceneId: string): Promise<SerializedHistory> {
    const key = this.getHistoryKey(sceneId)
    const history = await localforage.getItem<SerializedHistory>(key)
    if (!history) {
      // Return empty history if none exists
      return { records: [], currentIndex: -1 }
    }
    return history
  }

  async saveHistory(sceneId: string, history: SerializedHistory): Promise<void> {
    const key = this.getHistoryKey(sceneId)
    await localforage.setItem(key, history)
  }
}
