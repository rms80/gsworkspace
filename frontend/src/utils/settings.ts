/**
 * Persistent user settings stored in localStorage
 * Separate from scene data (which uses IndexedDB/S3)
 */

import { StorageMode } from '../api/storage'

const SETTINGS_KEY = 'gsworkspace-settings'

export interface ModeSettings {
  /** IDs of scenes that should be open on reload */
  openSceneIds: string[]
  /** ID of the active scene */
  activeSceneId: string | null
  /** Last-used workspace name (for auto-redirect on next visit) */
  lastWorkspace?: string
}

export interface Settings {
  /** Settings for online (S3) mode */
  online: ModeSettings
  /** Settings for local disk mode */
  local: ModeSettings
  /** Settings for offline (browser) mode */
  offline: ModeSettings
  /** Legacy fields for backwards compatibility */
  openSceneIds?: string[]
  activeSceneId?: string | null
}

const defaultModeSettings: ModeSettings = {
  openSceneIds: [],
  activeSceneId: null,
}

const defaultSettings: Settings = {
  online: { ...defaultModeSettings },
  local: { ...defaultModeSettings },
  offline: { ...defaultModeSettings },
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

    // Handle migration from old format (single openSceneIds/activeSceneId)
    if (parsed.openSceneIds !== undefined && !parsed.online) {
      // Migrate old format to new format - put old settings in online mode
      return {
        online: {
          openSceneIds: parsed.openSceneIds || [],
          activeSceneId: parsed.activeSceneId || null,
        },
        local: { ...defaultModeSettings },
        offline: { ...defaultModeSettings },
      }
    }

    // Merge with defaults to handle missing fields from older versions
    return {
      online: { ...defaultModeSettings, ...parsed.online },
      local: { ...defaultModeSettings, ...parsed.local },
      offline: { ...defaultModeSettings, ...parsed.offline },
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
    return { ...defaultSettings }
  }
}

/**
 * Load settings for a specific storage mode
 */
export function loadModeSettings(mode: StorageMode): ModeSettings {
  const settings = loadSettings()
  return settings[mode]
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
 * Update settings for a specific storage mode
 */
export function updateModeSettings(mode: StorageMode, updates: Partial<ModeSettings>): void {
  const current = loadSettings()
  saveSettings({
    ...current,
    [mode]: { ...current[mode], ...updates },
  })
}

/**
 * Update the list of open scene IDs for a specific mode
 */
export function setOpenSceneIds(ids: string[], mode: StorageMode): void {
  updateModeSettings(mode, { openSceneIds: ids })
}

/**
 * Update the active scene ID for a specific mode
 */
export function setActiveSceneId(id: string | null, mode: StorageMode): void {
  updateModeSettings(mode, { activeSceneId: id })
}

/**
 * Convenience function to update both open scenes and active scene for a specific mode
 */
export function setOpenScenes(openIds: string[], activeId: string | null, mode: StorageMode): void {
  updateModeSettings(mode, { openSceneIds: openIds, activeSceneId: activeId })
}

/**
 * Get the last-used workspace for a specific storage mode
 */
export function getLastWorkspace(mode: StorageMode): string | null {
  const settings = loadModeSettings(mode)
  return settings.lastWorkspace ?? null
}

/**
 * Save the last-used workspace for a specific storage mode
 */
export function setLastWorkspace(workspace: string, mode: StorageMode): void {
  updateModeSettings(mode, { lastWorkspace: workspace })
}
