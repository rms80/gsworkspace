const STORAGE_KEY = 'gsworkspace-experimental'

interface ExperimentalSettings {
  codingRobotEnabled: boolean
}

function getSettings(): ExperimentalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        codingRobotEnabled: typeof parsed.codingRobotEnabled === 'boolean' ? parsed.codingRobotEnabled : false,
      }
    }
  } catch {
    // ignore
  }
  return { codingRobotEnabled: false }
}

function saveSettings(settings: ExperimentalSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getCodingRobotEnabled(): boolean {
  return getSettings().codingRobotEnabled
}

export function setCodingRobotEnabled(enabled: boolean) {
  const settings = getSettings()
  settings.codingRobotEnabled = enabled
  saveSettings(settings)
}
