import dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as s3 from './s3.js'
import * as disk from './diskStorage.js'

dotenv.config()

export type StorageMode = 'online' | 'local'

export interface StorageService {
  save(key: string, data: string | Buffer, contentType?: string): Promise<void>
  load(key: string): Promise<string | null>
  loadAsBuffer(key: string): Promise<Buffer | null>
  list(prefix: string): Promise<string[]>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  getPublicUrl(key: string): string
}

// Config file path for persisting storage mode (only used when env var not set)
const CONFIG_DIR = process.env.LOCAL_STORAGE_PATH || path.join(os.homedir(), '.gsworkspace')
const CONFIG_FILE = path.join(CONFIG_DIR, '.storage-config.json')

// Check if STORAGE_MODE was explicitly set in environment
// If set, env var is authoritative (for cloud deployments)
// If not set, we can use/persist config file (for local development)
const ENV_STORAGE_MODE = process.env.STORAGE_MODE

// Allow runtime changes to storage mode
let runtimeStorageMode: StorageMode | null = null

// Load persisted storage mode from config file
function loadPersistedStorageMode(): StorageMode | null {
  // Don't load from file if env var is explicitly set
  if (ENV_STORAGE_MODE) {
    return null
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const config = JSON.parse(data)
      if (config.storageMode === 'local' || config.storageMode === 'online') {
        console.log(`Loaded persisted storage mode: ${config.storageMode}`)
        return config.storageMode
      }
    }
  } catch (error) {
    console.warn('Failed to load persisted storage mode:', error)
  }
  return null
}

// Persist storage mode to config file
function persistStorageMode(mode: StorageMode): void {
  // Don't persist if env var is set (cloud deployment)
  if (ENV_STORAGE_MODE) {
    console.log(`Storage mode set to ${mode} (not persisted - STORAGE_MODE env var is set)`)
    return
  }

  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ storageMode: mode }, null, 2))
    console.log(`Storage mode persisted: ${mode}`)
  } catch (error) {
    console.warn('Failed to persist storage mode:', error)
  }
}

// Initialize from persisted config (only if env var not set)
runtimeStorageMode = loadPersistedStorageMode()

export function getStorageMode(): StorageMode {
  if (runtimeStorageMode) {
    return runtimeStorageMode
  }
  const mode = ENV_STORAGE_MODE || 'online'
  if (mode === 'local') {
    return 'local'
  }
  return 'online'
}

export function setStorageMode(mode: StorageMode): void {
  runtimeStorageMode = mode
  persistStorageMode(mode)
}

// S3 storage adapter
const s3Storage: StorageService = {
  async save(key: string, data: string | Buffer, contentType?: string): Promise<void> {
    return s3.saveToS3(key, data, contentType)
  },
  async load(key: string): Promise<string | null> {
    return s3.loadFromS3(key)
  },
  async loadAsBuffer(key: string): Promise<Buffer | null> {
    // S3 doesn't have a native loadAsBuffer, so load as string and convert
    // For binary files, we need to fetch directly
    const url = s3.getPublicUrl(key)
    try {
      const response = await fetch(url)
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          return null
        }
        throw new Error(`S3 fetch failed: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch {
      return null
    }
  },
  async list(prefix: string): Promise<string[]> {
    return s3.listFromS3(prefix)
  },
  async delete(key: string): Promise<void> {
    return s3.deleteFromS3(key)
  },
  async exists(key: string): Promise<boolean> {
    return s3.existsInS3(key)
  },
  getPublicUrl(key: string): string {
    return s3.getPublicUrl(key)
  },
}

// Disk storage adapter
const diskStorage: StorageService = {
  async save(key: string, data: string | Buffer, contentType?: string): Promise<void> {
    return disk.saveToDisk(key, data, contentType)
  },
  async load(key: string): Promise<string | null> {
    return disk.loadFromDisk(key)
  },
  async loadAsBuffer(key: string): Promise<Buffer | null> {
    return disk.loadFromDiskAsBuffer(key)
  },
  async list(prefix: string): Promise<string[]> {
    return disk.listFromDisk(prefix)
  },
  async delete(key: string): Promise<void> {
    return disk.deleteFromDisk(key)
  },
  async exists(key: string): Promise<boolean> {
    return disk.existsOnDisk(key)
  },
  getPublicUrl(key: string): string {
    return disk.getLocalUrl(key)
  },
}

export function getStorageService(): StorageService {
  const mode = getStorageMode()
  return mode === 'local' ? diskStorage : s3Storage
}

// Convenience functions that use the current storage service
export async function save(
  key: string,
  data: string | Buffer,
  contentType?: string
): Promise<void> {
  return getStorageService().save(key, data, contentType)
}

export async function load(key: string): Promise<string | null> {
  return getStorageService().load(key)
}

export async function loadAsBuffer(key: string): Promise<Buffer | null> {
  return getStorageService().loadAsBuffer(key)
}

export async function list(prefix: string): Promise<string[]> {
  return getStorageService().list(prefix)
}

export async function del(key: string): Promise<void> {
  return getStorageService().delete(key)
}

export async function exists(key: string): Promise<boolean> {
  return getStorageService().exists(key)
}

export function getPublicUrl(key: string): string {
  return getStorageService().getPublicUrl(key)
}
