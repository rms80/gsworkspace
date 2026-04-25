import { ACTIVE_WORKSPACE } from './workspace'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import type { SplatFormat } from '../types'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/items`

export interface UploadSplatResult {
  success: boolean
  url: string
  format: SplatFormat
}

/**
 * Convert a .splat or .ply file to .ksplat format in the browser using the
 * library's built-in parsers. Returns the ksplat binary as a File object.
 * Files that are already .ksplat pass through unchanged.
 */
async function convertToKsplat(file: File): Promise<File> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'ksplat') return file

  const arrayBuffer = await file.arrayBuffer()
  let splatBuffer: any

  if (ext === 'ply') {
    splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(
      arrayBuffer,
      1,    // minimumAlpha (ignore fully transparent splats)
      1,    // compressionLevel (16-bit positions/scales for smaller file)
      true, // optimizeSplatData
    )
  } else {
    // .splat format
    splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(
      arrayBuffer,
      1,    // minimumAlpha
      1,    // compressionLevel
      true, // optimizeSplatData
    )
  }

  const ksplatData = splatBuffer.bufferData as ArrayBuffer
  const baseName = file.name.replace(/\.[^/.]+$/, '')
  return new File([ksplatData], `${baseName}.ksplat`, { type: 'application/octet-stream' })
}

/**
 * Upload a Gaussian splat file to storage. Non-ksplat formats are converted
 * to .ksplat in the browser before uploading for optimal load performance.
 */
export async function uploadSplat(
  file: File,
  sceneId: string,
  itemId: string,
): Promise<UploadSplatResult> {
  const converted = await convertToKsplat(file)

  const formData = new FormData()
  formData.append('splat', converted)
  formData.append('sceneId', sceneId)
  formData.append('itemId', itemId)

  const response = await fetch(`${API_BASE}/upload-splat`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Failed to upload splat: ${response.statusText}`)
  }

  const json = await response.json()
  // After conversion, the stored file is always ksplat
  const storedFormat: SplatFormat = converted.name.endsWith('.ksplat') ? 'ksplat' : getSplatFormat(converted.name)
  return { success: json.success, url: json.url, format: storedFormat }
}

/** Check whether a File is a supported Gaussian splat format */
export function isSplatFile(file: File): boolean {
  return /\.(splat|ksplat|ply)$/i.test(file.name)
}

/** Extract the SplatFormat from a filename */
export function getSplatFormat(filename: string): SplatFormat {
  const match = filename.match(/\.(splat|ksplat|ply)$/i)
  return (match ? match[1].toLowerCase() : 'splat') as SplatFormat
}

