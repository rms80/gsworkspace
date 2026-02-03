import { DelegatingStorageProvider } from './DelegatingStorageProvider'

export type { StorageProvider, SceneMetadata, SceneTimestamp } from './StorageProvider'

// Storage modes:
// - 'online': S3 cloud storage via backend
// - 'local': Local disk storage via backend
// - 'offline': Browser IndexedDB storage (no backend)
export type StorageMode = 'online' | 'local' | 'offline'

// Initialize storage mode from environment variable
// In Vite, env vars must be prefixed with VITE_ and accessed via import.meta.env
let storageMode: StorageMode = import.meta.env.VITE_OFFLINE_MODE === 'true' ? 'offline' : 'online'

export function getStorageMode(): StorageMode {
  return storageMode
}

export function setStorageMode(mode: StorageMode): void {
  storageMode = mode
}

// Backward compatibility: returns true only for browser-based offline mode
export function isOfflineMode(): boolean {
  return storageMode === 'offline'
}

// For backward compatibility with existing code
export function setOfflineMode(offline: boolean): void {
  storageMode = offline ? 'offline' : 'online'
}

// Check if the current mode uses the backend API
export function usesBackendApi(): boolean {
  return storageMode === 'online' || storageMode === 'local'
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
