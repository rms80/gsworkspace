import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import { Scene, ImageItem, VideoItem } from '../types'
import { SerializedHistory } from '../history'

/**
 * Converts a File/Blob to a data URL
 */
async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Result of importing a scene
 */
export interface ImportResult {
  scene: Scene
  history: SerializedHistory
}

/**
 * Imports a scene from a ZIP file
 */
export async function importSceneFromZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file)

  // Read scene.json
  const sceneFile = zip.file('scene.json')
  if (!sceneFile) {
    throw new Error('Invalid scene archive: missing scene.json')
  }
  const sceneJson = await sceneFile.async('string')
  const scene = JSON.parse(sceneJson) as Scene

  // Read history.json (optional - may not exist in older exports)
  let history: SerializedHistory = { records: [], currentIndex: -1 }
  const historyFile = zip.file('history.json')
  if (historyFile) {
    const historyJson = await historyFile.async('string')
    history = JSON.parse(historyJson) as SerializedHistory
  }

  // Process images - convert from ZIP to data URLs
  const imageItems = scene.items.filter(
    (item): item is ImageItem => item.type === 'image'
  )

  for (const item of imageItems) {
    // Load main image if it's a relative path
    if (item.src.startsWith('images/')) {
      const imageFile = zip.file(item.src)
      if (imageFile) {
        const blob = await imageFile.async('blob')
        item.src = await fileToDataUrl(blob)
      }
    }

    // Load cropped image if it exists
    if (item.cropSrc && item.cropSrc.startsWith('images/')) {
      const cropFile = zip.file(item.cropSrc)
      if (cropFile) {
        const blob = await cropFile.async('blob')
        item.cropSrc = await fileToDataUrl(blob)
      }
    }
  }

  // Process videos - convert from ZIP to data URLs
  const videoItems = scene.items.filter(
    (item): item is VideoItem => item.type === 'video'
  )

  for (const item of videoItems) {
    if (item.src.startsWith('videos/')) {
      const videoFile = zip.file(item.src)
      if (videoFile) {
        const blob = await videoFile.async('blob')
        item.src = await fileToDataUrl(blob)
      }
    }
  }

  // Generate new scene ID to avoid conflicts
  const now = new Date().toISOString()
  scene.id = uuidv4()
  scene.createdAt = now
  scene.modifiedAt = now

  return { scene, history }
}

/**
 * Imports a scene from a directory (FileList from directory input)
 */
export async function importSceneFromDirectory(
  files: FileList
): Promise<ImportResult> {
  // Convert FileList to array for easier processing
  const fileArray = Array.from(files)

  // Find scene.json
  const sceneFile = fileArray.find(
    (f) => f.name === 'scene.json' || f.webkitRelativePath.endsWith('/scene.json')
  )
  if (!sceneFile) {
    throw new Error('Invalid scene folder: missing scene.json')
  }

  // Read scene.json
  const sceneJson = await sceneFile.text()
  const scene = JSON.parse(sceneJson) as Scene

  // Find and read history.json (optional)
  let history: SerializedHistory = { records: [], currentIndex: -1 }
  const historyFile = fileArray.find(
    (f) => f.name === 'history.json' || f.webkitRelativePath.endsWith('/history.json')
  )
  if (historyFile) {
    const historyJson = await historyFile.text()
    history = JSON.parse(historyJson) as SerializedHistory
  }

  // Build a map of image paths to files
  const imageFiles = new Map<string, File>()
  const videoFiles = new Map<string, File>()
  for (const file of fileArray) {
    // Match files in the images folder
    const imagePathMatch = file.webkitRelativePath.match(/images\/(.+)$/)
    if (imagePathMatch) {
      imageFiles.set(`images/${imagePathMatch[1]}`, file)
    }
    // Match files in the videos folder
    const videoPathMatch = file.webkitRelativePath.match(/videos\/(.+)$/)
    if (videoPathMatch) {
      videoFiles.set(`videos/${videoPathMatch[1]}`, file)
    }
  }

  // Process images - convert from files to data URLs
  const imageItems = scene.items.filter(
    (item): item is ImageItem => item.type === 'image'
  )

  for (const item of imageItems) {
    // Load main image if it's a relative path
    if (item.src.startsWith('images/')) {
      const imageFile = imageFiles.get(item.src)
      if (imageFile) {
        item.src = await fileToDataUrl(imageFile)
      }
    }

    // Load cropped image if it exists
    if (item.cropSrc && item.cropSrc.startsWith('images/')) {
      const cropFile = imageFiles.get(item.cropSrc)
      if (cropFile) {
        item.cropSrc = await fileToDataUrl(cropFile)
      }
    }
  }

  // Process videos - convert from files to data URLs
  const videoItems = scene.items.filter(
    (item): item is VideoItem => item.type === 'video'
  )

  for (const item of videoItems) {
    if (item.src.startsWith('videos/')) {
      const videoFile = videoFiles.get(item.src)
      if (videoFile) {
        item.src = await fileToDataUrl(videoFile)
      }
    }
  }

  // Generate new scene ID to avoid conflicts
  const now = new Date().toISOString()
  scene.id = uuidv4()
  scene.createdAt = now
  scene.modifiedAt = now

  return { scene, history }
}
