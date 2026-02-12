import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import dotenv from 'dotenv'

dotenv.config()

// Default to ~/.gsworkspace if not specified
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), '.gsworkspace')

function getStoragePath(): string {
  return process.env.LOCAL_STORAGE_PATH || DEFAULT_STORAGE_PATH
}

// Resolve a key to a full file path
function resolvePath(key: string): string {
  const storagePath = getStoragePath()
  // Normalize path separators for cross-platform compatibility
  const normalizedKey = key.split('/').join(path.sep)
  return path.join(storagePath, normalizedKey)
}

// Ensure directory exists for a file path
async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

// Security: validate that the resolved path is within the storage directory
function validatePath(resolvedPath: string): void {
  const storagePath = getStoragePath()
  const normalizedResolved = path.normalize(resolvedPath)
  const normalizedStorage = path.normalize(storagePath)

  if (!normalizedResolved.startsWith(normalizedStorage)) {
    throw new Error('Path traversal attempt detected')
  }
}

export async function saveToDisk(
  key: string,
  data: string | Buffer,
  _contentType?: string
): Promise<void> {
  const filePath = resolvePath(key)
  validatePath(filePath)
  await ensureDir(filePath)
  await fs.writeFile(filePath, data)
}

export async function loadFromDisk(key: string): Promise<string | null> {
  const filePath = resolvePath(key)
  validatePath(filePath)

  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return data
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function loadFromDiskAsBuffer(key: string): Promise<Buffer | null> {
  const filePath = resolvePath(key)
  validatePath(filePath)

  try {
    const data = await fs.readFile(filePath)
    return data
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function listFromDisk(prefix: string): Promise<string[]> {
  const storagePath = getStoragePath()
  const prefixPath = resolvePath(prefix)
  validatePath(prefixPath)

  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          await walk(fullPath)
        } else {
          // Convert back to key format (forward slashes)
          const relativePath = path.relative(storagePath, fullPath)
          const key = relativePath.split(path.sep).join('/')

          // Only include if it starts with the prefix
          if (key.startsWith(prefix)) {
            results.push(key)
          }
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist yet, return empty
        return
      }
      throw error
    }
  }

  // Walk from the prefix directory if it exists, otherwise from the nearest parent
  let walkDir = prefixPath
  while (!fsSync.existsSync(walkDir) && walkDir !== storagePath) {
    walkDir = path.dirname(walkDir)
  }

  if (fsSync.existsSync(walkDir)) {
    await walk(walkDir)
  }

  return results
}

export async function deleteFromDisk(key: string): Promise<void> {
  const filePath = resolvePath(key)
  validatePath(filePath)

  try {
    await fs.unlink(filePath)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, that's fine
      return
    }
    throw error
  }
}

export async function existsOnDisk(key: string): Promise<boolean> {
  const filePath = resolvePath(key)
  validatePath(filePath)

  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function getLocalUrl(key: string): string {
  // Return a URL that will be served by the local files endpoint
  return `/api/local-files/${key}`
}

// Get the content type based on file extension
export function getContentTypeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.json': 'application/json',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
  }
  return contentTypes[ext] || 'application/octet-stream'
}

// Initialize storage directory on startup
export async function initializeStorage(): Promise<void> {
  const storagePath = getStoragePath()
  await fs.mkdir(storagePath, { recursive: true })

  // Create subdirectories
  await fs.mkdir(path.join(storagePath, 'temp', 'images'), { recursive: true })
  await fs.mkdir(path.join(storagePath, 'temp', 'videos'), { recursive: true })
  await fs.mkdir(path.join(storagePath, 'scenes'), { recursive: true })

  console.log(`Local storage initialized at: ${storagePath}`)
}

// Resolve a key to a validated file path (for streaming in routes)
export function resolveFilePath(key: string): string {
  const filePath = resolvePath(key)
  validatePath(filePath)
  return filePath
}

// Export storage path getter for use in routes
export { getStoragePath }
