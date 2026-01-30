import { Scene } from '../../types'
import { SerializedHistory } from '../../history/types'

export interface SceneMetadata {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  itemCount: number
}

export interface SceneTimestamp {
  id: string
  modifiedAt: string
}

export interface StorageProvider {
  saveScene(scene: Scene): Promise<void>
  loadScene(id: string): Promise<Scene>
  listScenes(): Promise<SceneMetadata[]>
  deleteScene(id: string): Promise<void>
  saveHistory(sceneId: string, history: SerializedHistory): Promise<void>
  loadHistory(sceneId: string): Promise<SerializedHistory>
  getSceneTimestamp(id: string): Promise<SceneTimestamp | null>
}
