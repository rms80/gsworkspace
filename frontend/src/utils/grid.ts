const STORAGE_KEY = 'gsworkspace-viewport'

interface ViewportSettings {
  snapEnabled: boolean
  gridSize: number
}

function getSettings(): ViewportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        snapEnabled: typeof parsed.snapEnabled === 'boolean' ? parsed.snapEnabled : true,
        gridSize: typeof parsed.gridSize === 'number' && parsed.gridSize >= 1 && parsed.gridSize <= 1000
          ? Math.round(parsed.gridSize)
          : 5,
      }
    }
  } catch {
    // ignore
  }
  return { snapEnabled: true, gridSize: 5 }
}

function saveSettings(settings: ViewportSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getSnapEnabled(): boolean {
  return getSettings().snapEnabled
}

export function setSnapEnabled(enabled: boolean) {
  const settings = getSettings()
  settings.snapEnabled = enabled
  saveSettings(settings)
}

export function getGridSize(): number {
  return getSettings().gridSize
}

export function setGridSize(size: number) {
  const settings = getSettings()
  settings.gridSize = Math.max(1, Math.min(1000, Math.round(size)))
  saveSettings(settings)
}

export function snapToGrid(value: number): number {
  const settings = getSettings()
  if (!settings.snapEnabled) return value
  const gs = settings.gridSize
  return Math.round(value / gs) * gs
}
