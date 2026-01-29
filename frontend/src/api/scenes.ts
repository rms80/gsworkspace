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
} from './storage'

export type { SceneMetadata } from './storage'
