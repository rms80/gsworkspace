/**
 * API Key storage for offline mode
 * Stored separately from scene settings for security
 *
 * WARNING: These keys are stored in the browser's localStorage.
 * While basic obfuscation is applied, this is NOT secure encryption.
 * Users should understand their keys are accessible to anyone with
 * access to their browser's developer tools.
 */

const API_KEYS_STORAGE_KEY = 'workspaceapp-api-keys'

interface StoredApiKeys {
  anthropic?: string
  google?: string
}

/**
 * Basic obfuscation - NOT real encryption
 * Just prevents casual inspection of localStorage
 */
function obfuscate(value: string): string {
  // Simple base64 with a rotation
  const rotated = value.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) + (i % 7) + 1)
  ).join('')
  return btoa(rotated)
}

function deobfuscate(value: string): string {
  try {
    const rotated = atob(value)
    return rotated.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) - (i % 7) - 1)
    ).join('')
  } catch {
    return ''
  }
}

function loadStoredKeys(): StoredApiKeys {
  try {
    const stored = localStorage.getItem(API_KEYS_STORAGE_KEY)
    if (!stored) return {}
    return JSON.parse(stored)
  } catch {
    return {}
  }
}

function saveStoredKeys(keys: StoredApiKeys): void {
  try {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys))
  } catch (error) {
    console.error('Failed to save API keys:', error)
  }
}

/**
 * Get the stored Anthropic API key
 * @returns The API key or null if not set
 */
export function getAnthropicApiKey(): string | null {
  const keys = loadStoredKeys()
  if (!keys.anthropic) return null
  const deobfuscated = deobfuscate(keys.anthropic)
  return deobfuscated || null
}

/**
 * Set or clear the Anthropic API key
 * @param key The API key to store, or null to clear
 */
export function setAnthropicApiKey(key: string | null): void {
  const keys = loadStoredKeys()
  if (key) {
    keys.anthropic = obfuscate(key)
  } else {
    delete keys.anthropic
  }
  saveStoredKeys(keys)
}

/**
 * Get the stored Google API key
 * @returns The API key or null if not set
 */
export function getGoogleApiKey(): string | null {
  const keys = loadStoredKeys()
  if (!keys.google) return null
  const deobfuscated = deobfuscate(keys.google)
  return deobfuscated || null
}

/**
 * Set or clear the Google API key
 * @param key The API key to store, or null to clear
 */
export function setGoogleApiKey(key: string | null): void {
  const keys = loadStoredKeys()
  if (key) {
    keys.google = obfuscate(key)
  } else {
    delete keys.google
  }
  saveStoredKeys(keys)
}

/**
 * Check if any API keys are configured
 */
export function hasAnyApiKey(): boolean {
  return getAnthropicApiKey() !== null || getGoogleApiKey() !== null
}

/**
 * Check if Anthropic API key is configured
 */
export function hasAnthropicApiKey(): boolean {
  return getAnthropicApiKey() !== null
}

/**
 * Check if Google API key is configured
 */
export function hasGoogleApiKey(): boolean {
  return getGoogleApiKey() !== null
}

/**
 * Clear all stored API keys
 */
export function clearAllApiKeys(): void {
  try {
    localStorage.removeItem(API_KEYS_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear API keys:', error)
  }
}

/**
 * Validate API key format (basic validation)
 * Returns true if the format looks valid, false otherwise
 */
export function validateAnthropicKeyFormat(key: string): boolean {
  // Anthropic keys start with 'sk-ant-' and are fairly long
  return key.startsWith('sk-ant-') && key.length > 20
}

export function validateGoogleKeyFormat(key: string): boolean {
  // Google API keys are typically 39 characters
  return key.length >= 30 && /^[A-Za-z0-9_-]+$/.test(key)
}
