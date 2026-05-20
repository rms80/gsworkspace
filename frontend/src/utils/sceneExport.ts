import JSZip from 'jszip'
import { Scene, ImageItem, VideoItem, PdfItem, TextFileItem, Model3DItem, SplatItem } from '../types'
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
async function fetchImageAsBlob(sceneId: string, itemId: string, src: string, isEdit: boolean = false): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    // Convert data URL or blob URL to blob
    const response = await fetch(src)
    return response.blob()
  } else {
    // Use getContentData API for S3 URLs
    return getContentData(sceneId, itemId, 'image', isEdit)
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
 * Fetches a PDF and returns it as a Blob
 */
async function fetchPdfAsBlob(sceneId: string, itemId: string, src: string): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const response = await fetch(src)
    return response.blob()
  }
  return getContentData(sceneId, itemId, 'pdf', false)
}

/**
 * Fetches a text file and returns it as a Blob
 */
async function fetchTextFileAsBlob(sceneId: string, itemId: string, src: string): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const response = await fetch(src)
    return response.blob()
  }
  return getContentData(sceneId, itemId, 'text-file', false)
}

/**
 * Fetches a generic file directly from its URL.
 * Used for content types not served via getContentData (3D models, splats).
 */
async function fetchUrlAsBlob(src: string): Promise<Blob> {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${src}: ${response.status} ${response.statusText}`)
  }
  return response.blob()
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
        const cropBlob = await fetchImageAsBlob(scene.id, item.id, item.cropSrc, true)
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

  // Process videos and add to ZIP. Always export the source; if an edited
  // version exists (cropSrc), export it too as a sibling file so edits round-trip.
  const videoItems = exportScene.items.filter(
    (item): item is VideoItem => item.type === 'video'
  )

  for (const item of videoItems) {
    try {
      // Source video
      const srcBlob = await fetchVideoAsBlob(scene.id, item.id, item.src, false)
      const srcExt = getVideoExtension(item.src, srcBlob)
      const srcFilename = `${item.id}.${srcExt}`
      zip.file(`videos/${srcFilename}`, srcBlob)
      item.src = `videos/${srcFilename}`

      // Edited/cropped version, if present. crop-video always emits mp4.
      if (item.cropSrc) {
        try {
          const cropBlob = await fetchVideoAsBlob(scene.id, item.id, item.cropSrc, true)
          const cropExt = getVideoExtension(item.cropSrc, cropBlob)
          const cropFilename = `${item.id}_crop.${cropExt}`
          zip.file(`videos/${cropFilename}`, cropBlob)
          item.cropSrc = `videos/${cropFilename}`
        } catch (cropError) {
          console.error(`Failed to export edited video ${item.id}:`, cropError)
          // Strip cropSrc so the importer doesn't try to resolve a missing file
          delete item.cropSrc
        }
      }
    } catch (error) {
      console.error(`Failed to export video ${item.id}:`, error)
      // Keep the original src if we fail to fetch
    }
  }

  // Process PDFs and add to ZIP
  const pdfItems = exportScene.items.filter(
    (item): item is PdfItem => item.type === 'pdf'
  )

  for (const item of pdfItems) {
    try {
      const blob = await fetchPdfAsBlob(scene.id, item.id, item.src)
      const filename = `${item.id}.pdf`
      zip.file(`pdfs/${filename}`, blob)
      item.src = `pdfs/${filename}`

      if (item.thumbnailSrc) {
        try {
          const thumbBlob = item.thumbnailSrc.startsWith('data:') || item.thumbnailSrc.startsWith('blob:')
            ? await (await fetch(item.thumbnailSrc)).blob()
            : await fetchUrlAsBlob(item.thumbnailSrc)
          const thumbFilename = `${item.id}_thumb.png`
          zip.file(`pdfs/${thumbFilename}`, thumbBlob)
          item.thumbnailSrc = `pdfs/${thumbFilename}`
        } catch (thumbError) {
          console.error(`Failed to export PDF thumbnail ${item.id}:`, thumbError)
        }
      }
    } catch (error) {
      console.error(`Failed to export PDF ${item.id}:`, error)
    }
  }

  // Process text files and add to ZIP
  const textFileItems = exportScene.items.filter(
    (item): item is TextFileItem => item.type === 'text-file'
  )

  for (const item of textFileItems) {
    try {
      const blob = await fetchTextFileAsBlob(scene.id, item.id, item.src)
      const ext = item.fileFormat || 'txt'
      const filename = `${item.id}.${ext}`
      zip.file(`textfiles/${filename}`, blob)
      item.src = `textfiles/${filename}`
    } catch (error) {
      console.error(`Failed to export text file ${item.id}:`, error)
    }
  }

  // Process 3D models and add to ZIP
  const model3dItems = exportScene.items.filter(
    (item): item is Model3DItem => item.type === 'model3d'
  )

  for (const item of model3dItems) {
    try {
      const blob = item.src.startsWith('data:') || item.src.startsWith('blob:')
        ? await (await fetch(item.src)).blob()
        : await fetchUrlAsBlob(item.src)
      const ext = item.format || 'glb'
      const filename = `${item.id}.${ext}`
      zip.file(`models/${filename}`, blob)
      item.src = `models/${filename}`
    } catch (error) {
      console.error(`Failed to export 3D model ${item.id}:`, error)
    }
  }

  // Process Gaussian splats and add to ZIP
  const splatItems = exportScene.items.filter(
    (item): item is SplatItem => item.type === 'splat'
  )

  for (const item of splatItems) {
    try {
      const blob = item.src.startsWith('data:') || item.src.startsWith('blob:')
        ? await (await fetch(item.src)).blob()
        : await fetchUrlAsBlob(item.src)
      const ext = item.format || 'ksplat'
      const filename = `${item.id}.${ext}`
      zip.file(`splats/${filename}`, blob)
      item.src = `splats/${filename}`
    } catch (error) {
      console.error(`Failed to export splat ${item.id}:`, error)
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
