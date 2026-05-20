import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import {
  Scene,
  ImageItem,
  VideoItem,
  PdfItem,
  TextFileItem,
  Model3DItem,
  SplatItem,
  TextFileFormat,
  Model3DFormat,
  SplatFormat,
} from '../types'
import { SerializedHistory } from '../history'
import { uploadImage } from '../api/images'
import { uploadVideo } from '../api/videos'
import { uploadPdf, uploadPdfThumbnail } from '../api/pdfs'
import { uploadTextFile } from '../api/textfiles'
import { uploadModel3D } from '../api/models3d'
import { uploadSplat } from '../api/splats'

/**
 * Resolves the path inside a zip for a given relative ref, if it is one.
 * Returns null for absolute URLs, data: URLs, blob: URLs, or anything else
 * that should pass through unchanged.
 */
function isRelativeZipPath(src: string | undefined): src is string {
  if (!src) return false
  if (src.startsWith('data:') || src.startsWith('blob:')) return false
  if (src.startsWith('http://') || src.startsWith('https://')) return false
  if (src.startsWith('/')) return false
  return true
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf',
  txt: 'text/plain', csv: 'text/csv', js: 'text/javascript',
  ts: 'text/typescript', tsx: 'text/typescript',
  json: 'application/json', py: 'text/x-python', md: 'text/markdown',
  sh: 'text/x-shellscript', log: 'text/plain', ini: 'text/plain',
  cs: 'text/plain', cpp: 'text/plain', h: 'text/plain', c: 'text/plain',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', stl: 'model/stl',
  obj: 'text/plain', fbx: 'application/octet-stream',
  splat: 'application/octet-stream', ksplat: 'application/octet-stream',
  ply: 'application/octet-stream',
}

/**
 * JSZip extracts blobs with an empty MIME type. The upload-image/-pdf/-textfile
 * endpoints rely on a `data:<mime>;base64,...` prefix to strip — without a MIME
 * the prefix-strip regex doesn't match and the saved bytes are corrupted.
 * Re-wrap the blob with a MIME type inferred from the file extension.
 */
function typedBlob(blob: Blob, pathOrExt: string): Blob {
  if (blob.type) return blob
  const ext = extOf(pathOrExt)
  if (!ext) return blob
  const mime = EXT_TO_MIME[ext]
  if (!mime) return blob
  return blob.slice(0, blob.size, mime)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Looks up the relative path in the file map. Supports both JSZip (file by path)
 * and FileList-based imports (Map keyed by relative path).
 */
type FileSource =
  | { kind: 'zip'; zip: JSZip }
  | { kind: 'fs'; files: Map<string, File> }

async function getBlob(source: FileSource, relativePath: string): Promise<Blob | null> {
  if (source.kind === 'zip') {
    const f = source.zip.file(relativePath)
    if (!f) return null
    return f.async('blob')
  }
  const file = source.files.get(relativePath)
  return file ?? null
}

function blobToFile(blob: Blob, filename: string, fallbackType: string): File {
  if (blob instanceof File) return blob
  return new File([blob], filename, { type: blob.type || fallbackType })
}

export interface ImportProgress {
  /** Number of items processed so far (0..total). */
  current: number
  /** Total number of items with file content to resolve. */
  total: number
  /** Human-readable description of the current step. */
  message: string
}

export interface ImportOptions {
  /** When true, imported file content is inlined as data/blob URLs instead of uploaded. */
  isOffline?: boolean
  /** Called before each item is processed and once on completion. */
  onProgress?: (progress: ImportProgress) => void
}

/**
 * Result of importing a scene
 */
export interface ImportResult {
  scene: Scene
  history: SerializedHistory
}

function itemNeedsResolution(item: Scene['items'][number]): boolean {
  switch (item.type) {
    case 'image':
      return isRelativeZipPath((item as ImageItem).src) || isRelativeZipPath((item as ImageItem).cropSrc)
    case 'video':
      return isRelativeZipPath((item as VideoItem).src) || isRelativeZipPath((item as VideoItem).cropSrc)
    case 'pdf':
      return isRelativeZipPath((item as PdfItem).src) || isRelativeZipPath((item as PdfItem).thumbnailSrc)
    case 'text-file':
      return isRelativeZipPath((item as TextFileItem).src)
    case 'model3d':
      return isRelativeZipPath((item as Model3DItem).src)
    case 'splat':
      return isRelativeZipPath((item as SplatItem).src)
    default:
      return false
  }
}

function itemDescription(item: Scene['items'][number]): string {
  const named = (item as { name?: string }).name
  if (named) return named
  // Fall back to filename from the relative src if available
  const src = (item as { src?: string }).src
  if (src && isRelativeZipPath(src)) return basename(src)
  return item.type
}

/**
 * Walk every item in the scene that has a relative file ref, pull the bytes
 * from the source, and either upload them via the appropriate API endpoint
 * (online/local) or convert to a data/blob URL (offline).
 *
 * Mutates `scene.items` in place to point at the resolved URLs.
 */
async function resolveItemFiles(
  scene: Scene,
  source: FileSource,
  options: ImportOptions,
): Promise<void> {
  const isOffline = !!options.isOffline
  const onProgress = options.onProgress

  const itemsWithFiles = scene.items.filter(itemNeedsResolution)
  const total = itemsWithFiles.length
  const verb = isOffline ? 'Loading' : 'Uploading'

  let processed = 0
  for (const item of itemsWithFiles) {
    onProgress?.({
      current: processed,
      total,
      message: `${verb} ${item.type}: ${itemDescription(item)}`,
    })
    try {
      switch (item.type) {
        case 'image':
          await resolveImage(item, scene.id, source, isOffline)
          break
        case 'video':
          await resolveVideo(item, scene.id, source, isOffline)
          break
        case 'pdf':
          await resolvePdf(item, scene.id, source, isOffline)
          break
        case 'text-file':
          await resolveTextFile(item, scene.id, source, isOffline)
          break
        case 'model3d':
          await resolveModel3D(item, scene.id, source, isOffline)
          break
        case 'splat':
          await resolveSplat(item, scene.id, source, isOffline)
          break
      }
    } catch (error) {
      console.error(`Failed to resolve content for item ${item.id} (${item.type}):`, error)
      // Leave src unchanged so the item still renders with whatever it had
    }
    processed++
  }

  onProgress?.({ current: total, total, message: 'Finalizing scene...' })
}

async function resolveImage(
  item: ImageItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (isRelativeZipPath(item.src)) {
    const blob = await getBlob(source, item.src)
    if (blob) {
      const dataUrl = await blobToDataUrl(typedBlob(blob, item.src))
      item.src = isOffline ? dataUrl : await uploadImage(dataUrl, sceneId, item.id, basename(item.src))
    }
  }
  // Pre-rendered cropped image: upload to the .crop.<ext> slot the rest of the
  // server expects (see crop-image). cropRect is preserved as-is.
  if (isRelativeZipPath(item.cropSrc)) {
    const blob = await getBlob(source, item.cropSrc)
    if (blob) {
      const dataUrl = await blobToDataUrl(typedBlob(blob, item.cropSrc))
      item.cropSrc = isOffline
        ? dataUrl
        : await uploadImage(dataUrl, sceneId, item.id, basename(item.cropSrc), true)
    }
  }
}

async function resolveVideo(
  item: VideoItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (isRelativeZipPath(item.src)) {
    const blob = await getBlob(source, item.src)
    if (blob) {
      if (isOffline) {
        item.src = URL.createObjectURL(blob)
      } else {
        const file = blobToFile(blob, basename(item.src) || `${item.id}.mp4`, 'video/mp4')
        const { url } = await uploadVideo(file, sceneId, item.id, false)
        item.src = url
      }
    }
  }

  // Pre-rendered edited version, if present. Uploaded as .crop.mp4 so the
  // server's existing edit-fetch path (isEdit=true) finds it.
  if (isRelativeZipPath(item.cropSrc)) {
    const blob = await getBlob(source, item.cropSrc)
    if (blob) {
      if (isOffline) {
        item.cropSrc = URL.createObjectURL(blob)
      } else {
        const file = blobToFile(blob, basename(item.cropSrc) || `${item.id}.mp4`, 'video/mp4')
        const { url } = await uploadVideo(file, sceneId, item.id, false, true)
        item.cropSrc = url
      }
    }
  }
}

async function resolvePdf(
  item: PdfItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (isRelativeZipPath(item.src)) {
    const blob = await getBlob(source, item.src)
    if (blob) {
      const dataUrl = await blobToDataUrl(typedBlob(blob, item.src))
      item.src = isOffline ? dataUrl : await uploadPdf(dataUrl, sceneId, item.id, basename(item.src) || 'document.pdf')
    }
  }
  if (isRelativeZipPath(item.thumbnailSrc)) {
    const blob = await getBlob(source, item.thumbnailSrc)
    if (blob) {
      const dataUrl = await blobToDataUrl(typedBlob(blob, item.thumbnailSrc))
      item.thumbnailSrc = isOffline ? dataUrl : await uploadPdfThumbnail(dataUrl, sceneId, item.id)
    }
  }
}

async function resolveTextFile(
  item: TextFileItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (!isRelativeZipPath(item.src)) return
  const blob = await getBlob(source, item.src)
  if (!blob) return
  const dataUrl = await blobToDataUrl(typedBlob(blob, item.src))
  if (isOffline) {
    item.src = dataUrl
    return
  }
  const ext = item.fileFormat || (extOf(item.src) as TextFileFormat) || 'txt'
  const filename = basename(item.src) || `document.${ext}`
  item.src = await uploadTextFile(dataUrl, sceneId, item.id, filename, ext)
}

async function resolveModel3D(
  item: Model3DItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (!isRelativeZipPath(item.src)) return
  const blob = await getBlob(source, item.src)
  if (!blob) return

  if (isOffline) {
    item.src = URL.createObjectURL(blob)
    return
  }

  const ext = item.format || (extOf(item.src) as Model3DFormat) || 'glb'
  const file = blobToFile(blob, basename(item.src) || `${item.id}.${ext}`, 'application/octet-stream')
  const { url } = await uploadModel3D(file, sceneId, item.id)
  item.src = url
}

async function resolveSplat(
  item: SplatItem,
  sceneId: string,
  source: FileSource,
  isOffline: boolean,
): Promise<void> {
  if (!isRelativeZipPath(item.src)) return
  const blob = await getBlob(source, item.src)
  if (!blob) return

  if (isOffline) {
    item.src = URL.createObjectURL(blob)
    return
  }

  const ext = item.format || (extOf(item.src) as SplatFormat) || 'ksplat'
  const file = blobToFile(blob, basename(item.src) || `${item.id}.${ext}`, 'application/octet-stream')
  const result = await uploadSplat(file, sceneId, item.id)
  item.src = result.url
  // uploadSplat may convert ply/splat → ksplat. Reflect that in the item.
  item.format = result.format
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(slash + 1) : path
}

function extOf(path: string): string | null {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  if (dot < 0) return null
  return base.slice(dot + 1).toLowerCase()
}

function freshSceneIds(scene: Scene): void {
  const now = new Date().toISOString()
  scene.id = uuidv4()
  scene.createdAt = now
  scene.modifiedAt = now
}

/**
 * Imports a scene from a ZIP file
 */
export async function importSceneFromZip(
  file: File,
  options: ImportOptions = {},
): Promise<ImportResult> {
  options.onProgress?.({ current: 0, total: 0, message: 'Reading archive...' })
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

  // Assign a fresh ID before resolving files so uploads go to the new folder
  freshSceneIds(scene)

  await resolveItemFiles(scene, { kind: 'zip', zip }, options)

  return { scene, history }
}

/**
 * Imports a scene from a directory (FileList from directory input)
 */
export async function importSceneFromDirectory(
  files: FileList,
  options: ImportOptions = {},
): Promise<ImportResult> {
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

  // Build a path → File map covering every relative folder we recognize
  const fileMap = new Map<string, File>()
  const recognized = /(?:^|\/)(images|videos|pdfs|textfiles|models|splats)\/(.+)$/
  for (const f of fileArray) {
    const m = f.webkitRelativePath.match(recognized)
    if (m) {
      fileMap.set(`${m[1]}/${m[2]}`, f)
    }
  }

  freshSceneIds(scene)

  await resolveItemFiles(scene, { kind: 'fs', files: fileMap }, options)

  return { scene, history }
}
