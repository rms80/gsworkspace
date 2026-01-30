/**
 * Persistent user settings stored in localStorage
 * Separate from scene data (which uses IndexedDB/S3)
 */

const SETTINGS_KEY = 'workspaceapp-settings'

export interface ModeSettings {
  /** IDs of scenes that should be open on reload */
  openSceneIds: string[]
  /** ID of the active scene */
  activeSceneId: string | null
}

export interface Settings {
  /** Settings for online mode */
  online: ModeSettings
  /** Settings for offline mode */
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
        offline: { ...defaultModeSettings },
      }
    }

    // Merge with defaults to handle missing fields from older versions
    return {
      online: { ...defaultModeSettings, ...parsed.online },
      offline: { ...defaultModeSettings, ...parsed.offline },
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
    return { ...defaultSettings }
  }
}

/**
 * Load settings for a specific mode (online/offline)
 */
export function loadModeSettings(isOffline: boolean): ModeSettings {
  const settings = loadSettings()
  return isOffline ? settings.offline : settings.online
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
 * Update settings for a specific mode (online/offline)
 */
export function updateModeSettings(isOffline: boolean, updates: Partial<ModeSettings>): void {
  const current = loadSettings()
  const modeKey = isOffline ? 'offline' : 'online'
  saveSettings({
    ...current,
    [modeKey]: { ...current[modeKey], ...updates },
  })
}

/**
 * Update the list of open scene IDs for a specific mode
 */
export function setOpenSceneIds(ids: string[], isOffline: boolean): void {
  updateModeSettings(isOffline, { openSceneIds: ids })
}

/**
 * Update the active scene ID for a specific mode
 */
export function setActiveSceneId(id: string | null, isOffline: boolean): void {
  updateModeSettings(isOffline, { activeSceneId: id })
}

/**
 * Convenience function to update both open scenes and active scene for a specific mode
 */
export function setOpenScenes(openIds: string[], activeId: string | null, isOffline: boolean): void {
  updateModeSettings(isOffline, { openSceneIds: openIds, activeSceneId: activeId })
}
