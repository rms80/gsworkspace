import { Scene } from '../../types'
import { SerializedHistory } from '../../history/types'
import { StorageProvider, SceneMetadata, SceneTimestamp, LoadedScene } from './StorageProvider'
import { ApiStorageProvider } from './ApiStorageProvider'
import { LocalStorageProvider } from './LocalStorageProvider'

export class DelegatingStorageProvider implements StorageProvider {
  private apiProvider = new ApiStorageProvider()
  private localProvider = new LocalStorageProvider()
  private getIsOffline: () => boolean

  constructor(getIsOffline: () => boolean) {
    this.getIsOffline = getIsOffline
  }

  private get active(): StorageProvider {
    return this.getIsOffline() ? this.localProvider : this.apiProvider
  }

  async saveScene(scene: Scene): Promise<void> {
    return this.active.saveScene(scene)
  }

  async loadScene(id: string): Promise<LoadedScene> {
    return this.active.loadScene(id)
  }

  async listScenes(): Promise<SceneMetadata[]> {
    return this.active.listScenes()
  }

  async deleteScene(id: string): Promise<void> {
    return this.active.deleteScene(id)
  }

  async saveHistory(sceneId: string, history: SerializedHistory): Promise<void> {
    return this.active.saveHistory(sceneId, history)
  }

  async loadHistory(sceneId: string): Promise<SerializedHistory> {
    return this.active.loadHistory(sceneId)
  }

  async getSceneTimestamp(id: string): Promise<SceneTimestamp | null> {
    return this.active.getSceneTimestamp(id)
  }
}
