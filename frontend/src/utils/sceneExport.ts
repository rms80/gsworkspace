import JSZip from 'jszip'
import { Scene, ImageItem, VideoItem } from '../types'
import { SerializedHistory } from '../history'
import { getContentData } from '../api/scenes'

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
 * Handles both data URLs and S3 URLs (via getContentData API)
 */
async function fetchImageAsBlob(sceneId: string, itemId: string, src: string): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    // Convert data URL or blob URL to blob
    const response = await fetch(src)
    return response.blob()
  } else {
    // Use getContentData API for S3 URLs
    return getContentData(sceneId, itemId, 'image', false)
  }
}

/**
 * Fetches a video and returns it as a Blob
 * Handles both blob URLs, data URLs, and S3 URLs (via getContentData API)
 */
async function fetchVideoAsBlob(sceneId: string, itemId: string, src: string, isEdit: boolean = false): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const response = await fetch(src)
    return response.blob()
  } else {
    // Use getContentData API for S3 URLs
    return getContentData(sceneId, itemId, 'video', isEdit)
  }
}

/**
 * Gets the file extension from a video src or blob type
 */
function getVideoExtension(src: string, blob: Blob): string {
  // Try to get from MIME type
  if (blob.type) {
    const mimeMatch = blob.type.match(/video\/(\w+)/)
    if (mimeMatch) {
      return mimeMatch[1]
    }
  }

  // Try to get from data URL
  if (src.startsWith('data:')) {
    const mimeMatch = src.match(/data:video\/(\w+)/)
    if (mimeMatch) {
      return mimeMatch[1]
    }
  }

  // Try to get from URL path
  if (src.includes('.')) {
    const ext = src.split('.').pop()?.split('?')[0]
    if (ext && ['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      return ext
    }
  }

  // Default to mp4
  return 'mp4'
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
      const blob = await fetchImageAsBlob(scene.id, item.id, item.src)
      const ext = getImageExtension(item.src, blob)
      const filename = `${item.id}.${ext}`
      zip.file(`images/${filename}`, blob)

      // Update the item's src to use relative path
      item.src = `images/${filename}`

      // If there's a cropped version, save it too
      if (item.cropSrc) {
        // Cropped images are stored with isEdit=true
        const cropBlob = await fetchImageAsBlob(scene.id, item.id, item.cropSrc)
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

  // Process videos and add to ZIP
  const videoItems = exportScene.items.filter(
    (item): item is VideoItem => item.type === 'video'
  )

  for (const item of videoItems) {
    try {
      // Determine if we should fetch the edited/cropped version
      const hasEdits = !!(item.cropSrc || item.cropRect || item.speedFactor || item.removeAudio || item.trim)
      const blob = await fetchVideoAsBlob(scene.id, item.id, item.src, hasEdits)
      const ext = getVideoExtension(item.src, blob)
      const filename = `${item.id}.${ext}`
      zip.file(`videos/${filename}`, blob)

      // Update the item's src to use relative path
      item.src = `videos/${filename}`
    } catch (error) {
      console.error(`Failed to export video ${item.id}:`, error)
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
