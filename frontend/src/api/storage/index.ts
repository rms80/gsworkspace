import { DelegatingStorageProvider } from './DelegatingStorageProvider'

export type { StorageProvider, SceneMetadata, SceneTimestamp, LoadedScene } from './StorageProvider'

// Initialize offline mode from environment variable
// In Vite, env vars must be prefixed with VITE_ and accessed via import.meta.env
let offlineMode = import.meta.env.VITE_OFFLINE_MODE === 'true'

export function isOfflineMode(): boolean {
  return offlineMode
}

export function setOfflineMode(offline: boolean): void {
  offlineMode = offline
}

// Create singleton storage provider
export const storageProvider = new DelegatingStorageProvider(isOfflineMode)

// Re-export convenience functions that delegate to the provider
export const saveScene = storageProvider.saveScene.bind(storageProvider)
export const loadScene = storageProvider.loadScene.bind(storageProvider)
export const listScenes = storageProvider.listScenes.bind(storageProvider)
export const deleteScene = storageProvider.deleteScene.bind(storageProvider)
export const saveHistory = storageProvider.saveHistory.bind(storageProvider)
export const loadHistory = storageProvider.loadHistory.bind(storageProvider)
export const getSceneTimestamp = storageProvider.getSceneTimestamp.bind(storageProvider)
