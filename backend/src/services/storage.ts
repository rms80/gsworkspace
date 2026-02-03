import dotenv from 'dotenv'
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

// Allow runtime changes to storage mode (for future API endpoint)
let runtimeStorageMode: StorageMode | null = null

export function getStorageMode(): StorageMode {
  if (runtimeStorageMode) {
    return runtimeStorageMode
  }
  const mode = process.env.STORAGE_MODE || 'online'
  if (mode === 'local') {
    return 'local'
  }
  return 'online'
}

export function setStorageMode(mode: StorageMode): void {
  runtimeStorageMode = mode
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
