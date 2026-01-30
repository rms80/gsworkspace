import JSZip from 'jszip'
import { Scene, ImageItem } from '../types'
import { SerializedHistory } from '../history'

// File System Access API types (not yet in standard TypeScript lib)
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | BufferSource | string): Promise<void>
    close(): Promise<void>
  }
}

/**
 * Fetches an image and returns it as a Blob
 * Handles both data URLs and external URLs (via proxy for CORS)
 */
async function fetchImageAsBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    // Convert data URL to blob
    const response = await fetch(src)
    return response.blob()
  } else {
    // External URL - use proxy to avoid CORS issues
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
    const response = await fetch(proxyUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    return response.blob()
  }
}

/**
 * Gets the file extension from an image src or blob type
 */
function getImageExtension(src: string, blob: Blob): string {
  // Try to get from MIME type
  if (blob.type) {
    const mimeMatch = blob.type.match(/image\/(\w+)/)
    if (mimeMatch) {
      const ext = mimeMatch[1]
      // Normalize jpeg to jpg
      return ext === 'jpeg' ? 'jpg' : ext
    }
  }

  // Try to get from data URL
  if (src.startsWith('data:')) {
    const mimeMatch = src.match(/data:image\/(\w+)/)
    if (mimeMatch) {
      const ext = mimeMatch[1]
      return ext === 'jpeg' ? 'jpg' : ext
    }
  }

  // Default to png
  return 'png'
}

/**
 * Exports a scene and its history to a ZIP file blob
 */
export async function exportScene(
  scene: Scene,
  history: SerializedHistory
): Promise<Blob> {
  const zip = new JSZip()

  // Create a copy of the scene to modify image paths
  const exportScene = JSON.parse(JSON.stringify(scene)) as Scene

  // Process images and add to ZIP
  const imageItems = exportScene.items.filter(
    (item): item is ImageItem => item.type === 'image'
  )

  for (const item of imageItems) {
    try {
      // Fetch and save the main image
      const blob = await fetchImageAsBlob(item.src)
      const ext = getImageExtension(item.src, blob)
      const filename = `${item.id}.${ext}`
      zip.file(`images/${filename}`, blob)

      // Update the item's src to use relative path
      item.src = `images/${filename}`

      // If there's a cropped version, save it too
      if (item.cropSrc) {
        const cropBlob = await fetchImageAsBlob(item.cropSrc)
        const cropExt = getImageExtension(item.cropSrc, cropBlob)
        const cropFilename = `${item.id}_crop.${cropExt}`
        zip.file(`images/${cropFilename}`, cropBlob)
        item.cropSrc = `images/${cropFilename}`
      }
    } catch (error) {
      console.error(`Failed to export image ${item.id}:`, error)
      // Keep the original src if we fail to fetch
    }
  }

  // Add scene.json
  zip.file('scene.json', JSON.stringify(exportScene, null, 2))

  // Add history.json
  zip.file('history.json', JSON.stringify(history, null, 2))

  // Generate the ZIP
  return zip.generateAsync({ type: 'blob' })
}

/**
 * Triggers a download of a blob as a file (fallback method)
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Sanitizes a filename by removing invalid characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'scene'
}

/**
 * Saves a blob using the File System Access API with a save dialog
 * Falls back to download if the API is not supported or user cancels
 */
async function saveWithFilePicker(blob: Blob, suggestedName: string): Promise<'saved' | 'cancelled' | 'fallback'> {
  // Check if File System Access API is supported
  const showSaveFilePicker = window.showSaveFilePicker
  if (!showSaveFilePicker) {
    return 'fallback'
  }

  try {
    const handle = await showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'ZIP Archive',
          accept: { 'application/zip': ['.zip'] },
        },
      ],
    })

    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  } catch (error) {
    // User cancelled the dialog
    if ((error as Error).name === 'AbortError') {
      return 'cancelled'
    }
    // Other error - fall back to download
    return 'fallback'
  }
}

/**
 * Exports a scene to a ZIP file and prompts user to save
 */
export async function exportSceneToZip(
  scene: Scene,
  history: SerializedHistory
): Promise<void> {
  const blob = await exportScene(scene, history)
  const filename = `${sanitizeFilename(scene.name)}.zip`

  // Try to use file picker, fall back to download
  const result = await saveWithFilePicker(blob, filename)
  if (result === 'fallback') {
    downloadBlob(blob, filename)
  }
  // If 'cancelled', do nothing silently
}
