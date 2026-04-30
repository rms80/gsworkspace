import { ACTIVE_WORKSPACE } from './workspace'
import type { Model3DFormat } from '../types'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadModel3DResult {
  success: boolean
  url: string
}

/**
 * Upload a 3D model file to storage and return the result.
 * Uses multipart/form-data for efficient upload (no base64 overhead).
 */
export async function uploadModel3D(
  file: File,
  sceneId: string,
  itemId: string,
): Promise<UploadModel3DResult> {
  const formData = new FormData()
  formData.append('model', file)
  formData.append('sceneId', sceneId)
  formData.append('itemId', itemId)

  const response = await fetch(`${API_BASE}/upload-model3d`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Failed to upload 3D model: ${response.statusText}`)
  }

  const result: UploadModel3DResult = await response.json()
  return result
}

/** Check whether a File is a supported 3D model format */
export function isModel3DFile(file: File): boolean {
  return /\.(glb|gltf|obj|stl|fbx)$/i.test(file.name)
}

/** Extract the Model3DFormat from a filename */
export function getModel3DFormat(filename: string): Model3DFormat {
  const match = filename.match(/\.(glb|gltf|obj|stl|fbx)$/i)
  return (match ? match[1].toLowerCase() : 'glb') as Model3DFormat
}
