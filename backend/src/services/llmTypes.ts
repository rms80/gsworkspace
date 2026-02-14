import { loadAsBuffer } from './storage.js'

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
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  id?: string
  sceneId?: string
  useEdited?: boolean
  fileFormat?: string
}

/** What LLM services receive (images/PDFs already resolved to base64) */
export interface ResolvedContentItem {
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  imageData?: { base64: string; mimeType: string }
  pdfData?: { base64: string }
  textFileData?: { text: string }
}

/**
 * Load an image from storage and return its base64 data + mimeType.
 * Tries multiple extensions (png, jpg, webp, etc.).
 * When useEdited is true, looks for the .crop.{ext} version first.
 */
export async function resolveImageData(
  workspace: string,
  sceneId: string,
  itemId: string,
  useEdited: boolean
): Promise<{ base64: string; mimeType: string } | null> {
  const sceneFolder = `${workspace}/${sceneId}`

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

/**
 * Load a PDF from storage and return its base64 data.
 */
export async function resolvePdfData(
  workspace: string,
  sceneId: string,
  itemId: string
): Promise<{ base64: string } | null> {
  const key = `${workspace}/${sceneId}/${itemId}.pdf`
  const buffer = await loadAsBuffer(key)
  if (buffer) {
    return { base64: buffer.toString('base64') }
  }
  return null
}

/**
 * Load a text file from storage and return its content as a UTF-8 string.
 */
export async function resolveTextFileData(
  workspace: string,
  sceneId: string,
  itemId: string,
  fileFormat: string
): Promise<{ text: string } | null> {
  const ext = fileFormat || 'txt'
  const key = `${workspace}/${sceneId}/${itemId}.${ext}`
  const buffer = await loadAsBuffer(key)
  if (buffer) {
    return { text: buffer.toString('utf-8') }
  }
  return null
}
