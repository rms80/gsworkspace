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
