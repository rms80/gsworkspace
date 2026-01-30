/**
 * Persistent user settings stored in localStorage
 * Separate from scene data (which uses IndexedDB/S3)
 */

const SETTINGS_KEY = 'workspaceapp-settings'

export interface Settings {
  /** IDs of scenes that should be open on reload */
  openSceneIds: string[]
  /** ID of the active scene */
  activeSceneId: string | null
}

const defaultSettings: Settings = {
  openSceneIds: [],
  activeSceneId: null,
}

/**
 * Load settings from localStorage
 */
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (!stored) {
      return { ...defaultSettings }
    }
    const parsed = JSON.parse(stored)
    // Merge with defaults to handle missing fields from older versions
    return {
      ...defaultSettings,
      ...parsed,
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
    return { ...defaultSettings }
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

/**
 * Update specific settings fields (partial update)
 */
export function updateSettings(updates: Partial<Settings>): void {
  const current = loadSettings()
  saveSettings({ ...current, ...updates })
}

/**
 * Update the list of open scene IDs
 */
export function setOpenSceneIds(ids: string[]): void {
  updateSettings({ openSceneIds: ids })
}

/**
 * Update the active scene ID
 */
export function setActiveSceneId(id: string | null): void {
  updateSettings({ activeSceneId: id })
}

/**
 * Convenience function to update both open scenes and active scene
 */
export function setOpenScenes(openIds: string[], activeId: string | null): void {
  updateSettings({ openSceneIds: openIds, activeSceneId: activeId })
}
