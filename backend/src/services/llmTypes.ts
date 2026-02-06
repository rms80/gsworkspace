import { loadAsBuffer } from './storage.js'

const USER_FOLDER = 'version0'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** What the frontend sends in online mode */
export interface LLMRequestItem {
  type: 'text' | 'image'
  text?: string
  id?: string
  sceneId?: string
  useEdited?: boolean
}

/** What LLM services receive (images already resolved to base64) */
export interface ResolvedContentItem {
  type: 'text' | 'image'
  text?: string
  imageData?: { base64: string; mimeType: string }
}

/**
 * Load an image from storage and return its base64 data + mimeType.
 * Tries multiple extensions (png, jpg, webp, etc.).
 * When useEdited is true, looks for the .crop.{ext} version first.
 */
export async function resolveImageData(
  sceneId: string,
  itemId: string,
  useEdited: boolean
): Promise<{ base64: string; mimeType: string } | null> {
  const sceneFolder = `${USER_FOLDER}/${sceneId}`

  // If useEdited, try cropped versions first
  if (useEdited) {
    for (const ext of IMAGE_EXTENSIONS) {
      const key = `${sceneFolder}/${itemId}.crop.${ext}`
      const buffer = await loadAsBuffer(key)
      if (buffer) {
        return {
          base64: buffer.toString('base64'),
          mimeType: MIME_TYPES[ext] || 'image/png',
        }
      }
    }
  }

  // Try original versions
  for (const ext of IMAGE_EXTENSIONS) {
    const key = `${sceneFolder}/${itemId}.${ext}`
    const buffer = await loadAsBuffer(key)
    if (buffer) {
      return {
        base64: buffer.toString('base64'),
        mimeType: MIME_TYPES[ext] || 'image/png',
      }
    }
  }

  return null
}
