import JSZip from 'jszip'
import { CanvasItem, ImageItem, VideoItem, TextFileItem, PdfItem } from '../types'
import { getContentData } from '../api/scenes'

// --- Helpers ---

function downloadBlob(blob: Blob, filename: string) {
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
 * Show a native Save As dialog, falling back to a direct download.
 * Returns 'saved' | 'cancelled' | 'downloaded'.
 */
async function saveAsOrDownload(blob: Blob, filename: string, description: string, mime: string, ext: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description,
          accept: { [mime]: [`.${ext}`] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

function getImageExtension(src: string): string {
  if (src.startsWith('data:image/')) {
    const match = src.match(/data:image\/(\w+)/)
    if (match) return match[1] === 'jpeg' ? 'jpg' : match[1]
  }
  if (src.includes('.')) {
    const match = src.match(/\.(\w+)(?:\?|$)/)
    if (match && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    }
  }
  return 'png'
}

export function getVideoExtension(src: string): string {
  if (src.includes('.')) {
    const match = src.match(/\.(\w+)(?:\?|$)/)
    if (match && ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase()
    }
  }
  if (src.startsWith('data:video/')) {
    const match = src.match(/data:video\/(\w+)/)
    if (match) return match[1]
  }
  return 'mp4'
}

const IMAGE_MIMES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
}

const VIDEO_MIMES: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
  mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
}

const TEXT_MIMES: Record<string, string> = {
  txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  js: 'text/javascript', ts: 'text/typescript', tsx: 'text/typescript',
  cs: 'text/plain', cpp: 'text/plain', h: 'text/plain', c: 'text/plain',
  py: 'text/x-python', md: 'text/markdown', sh: 'text/x-shellscript',
  log: 'text/plain', ini: 'text/plain',
}

// --- Blob fetching ---

async function fetchBlob(src: string, sceneId: string, itemId: string, type: 'image' | 'video' | 'html' | 'pdf' | 'text-file', useCrop?: boolean): Promise<Blob> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const response = await fetch(src)
    return response.blob()
  }
  return getContentData(sceneId, itemId, type, useCrop)
}

function getImageBlobInfo(imageItem: ImageItem, sceneId: string) {
  const srcToExport = imageItem.cropSrc || imageItem.src
  const ext = getImageExtension(srcToExport)
  const filename = `${imageItem.name || 'image'}.${ext}`
  const blobPromise = fetchBlob(srcToExport, sceneId, imageItem.id, 'image', !!imageItem.cropSrc)
  return { ext, filename, blobPromise }
}

function getVideoBlobInfo(videoItem: VideoItem, sceneId: string) {
  const hasEdits = !!(videoItem.cropSrc || videoItem.cropRect || videoItem.speedFactor || videoItem.removeAudio || videoItem.trim)
  const ext = hasEdits ? 'mp4' : getVideoExtension(videoItem.src)
  const filename = `${videoItem.name || 'video'}.${ext}`
  const exportSrc = videoItem.cropSrc ?? videoItem.src
  const blobPromise = fetchBlob(exportSrc, sceneId, videoItem.id, 'video', hasEdits)
  return { ext, filename, blobPromise }
}

function getTextFileBlobInfo(textFileItem: TextFileItem, sceneId: string) {
  const ext = textFileItem.fileFormat || 'txt'
  const filename = `${textFileItem.name || 'document'}.${ext}`
  const blobPromise = fetchBlob(textFileItem.src, sceneId, textFileItem.id, 'text-file')
  return { ext, filename, blobPromise }
}

function getPdfBlobInfo(pdfItem: PdfItem, sceneId: string) {
  const filename = `${pdfItem.name || 'document'}.pdf`
  const blobPromise = fetchBlob(pdfItem.src, sceneId, pdfItem.id, 'pdf')
  return { ext: 'pdf', filename, blobPromise }
}

// --- Download (direct) ---

export async function downloadImage(imageItem: ImageItem, sceneId: string) {
  const { filename, blobPromise } = getImageBlobInfo(imageItem, sceneId)
  downloadBlob(await blobPromise, filename)
}

export async function downloadVideo(videoItem: VideoItem, sceneId: string) {
  const { filename, blobPromise } = getVideoBlobInfo(videoItem, sceneId)
  downloadBlob(await blobPromise, filename)
}

export async function downloadTextFile(textFileItem: TextFileItem, sceneId: string) {
  const { filename, blobPromise } = getTextFileBlobInfo(textFileItem, sceneId)
  downloadBlob(await blobPromise, filename)
}

export async function downloadPdf(pdfItem: PdfItem, sceneId: string) {
  const { filename, blobPromise } = getPdfBlobInfo(pdfItem, sceneId)
  downloadBlob(await blobPromise, filename)
}

export async function downloadCanvasItem(item: CanvasItem, sceneId: string): Promise<boolean> {
  switch (item.type) {
    case 'image': await downloadImage(item as ImageItem, sceneId); return true
    case 'video': await downloadVideo(item as VideoItem, sceneId); return true
    case 'text-file': await downloadTextFile(item as TextFileItem, sceneId); return true
    case 'pdf': await downloadPdf(item as PdfItem, sceneId); return true
    default: return false
  }
}

/**
 * Download all downloadable items from a selection. Skips unsupported types.
 * Downloads sequentially to avoid browser throttling multiple simultaneous downloads.
 */
export async function downloadSelectedItems(items: CanvasItem[], selectedIds: string[], sceneId: string) {
  const selected = selectedIds
    .map(id => items.find(item => item.id === id))
    .filter((item): item is CanvasItem => !!item && ['image', 'video', 'text-file', 'pdf'].includes(item.type))
  for (const item of selected) {
    await downloadCanvasItem(item, sceneId)
  }
}

async function collectSelectedItemBlobs(items: CanvasItem[], selectedIds: string[], sceneId: string): Promise<{ filename: string; blob: Blob }[]> {
  const selected = selectedIds
    .map(id => items.find(item => item.id === id))
    .filter((item): item is CanvasItem => !!item && ['image', 'video', 'text-file', 'pdf'].includes(item.type))

  const results: { filename: string; blob: Blob }[] = []
  const usedNames = new Map<string, number>()

  for (const item of selected) {
    let info: { filename: string; blobPromise: Promise<Blob> } | null = null
    switch (item.type) {
      case 'image': info = getImageBlobInfo(item as ImageItem, sceneId); break
      case 'video': info = getVideoBlobInfo(item as VideoItem, sceneId); break
      case 'text-file': info = getTextFileBlobInfo(item as TextFileItem, sceneId); break
      case 'pdf': info = getPdfBlobInfo(item as PdfItem, sceneId); break
    }
    if (!info) continue

    // Deduplicate filenames
    let filename = info.filename
    const count = usedNames.get(filename) || 0
    if (count > 0) {
      const dotIdx = filename.lastIndexOf('.')
      const base = dotIdx > 0 ? filename.slice(0, dotIdx) : filename
      const ext = dotIdx > 0 ? filename.slice(dotIdx) : ''
      filename = `${base} (${count})${ext}`
    }
    usedNames.set(info.filename, count + 1)

    try {
      const blob = await info.blobPromise
      results.push({ filename, blob })
    } catch (error) {
      console.error(`Failed to fetch ${filename}:`, error)
    }
  }

  return results
}

/**
 * Download all downloadable items from a selection as a single zip file.
 */
export async function downloadSelectedItemsAsZip(items: CanvasItem[], selectedIds: string[], sceneId: string) {
  const entries = await collectSelectedItemBlobs(items, selectedIds, sceneId)
  if (entries.length === 0) return
  const zip = new JSZip()
  for (const { filename, blob } of entries) zip.file(filename, blob)
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'download.zip')
}

/**
 * Export all downloadable items from a selection as a single zip file (Save As dialog).
 */
export async function exportSelectedItemsAsZip(items: CanvasItem[], selectedIds: string[], sceneId: string) {
  const entries = await collectSelectedItemBlobs(items, selectedIds, sceneId)
  if (entries.length === 0) return
  const zip = new JSZip()
  for (const { filename, blob } of entries) zip.file(filename, blob)
  await saveAsOrDownload(await zip.generateAsync({ type: 'blob' }), 'download.zip', 'Zip archive', 'application/zip', 'zip')
}

/**
 * Export all downloadable items to a user-chosen directory.
 * Falls back to sequential individual downloads if the directory picker API is unavailable.
 */
export async function exportSelectedItemsToDirectory(items: CanvasItem[], selectedIds: string[], sceneId: string) {
  const entries = await collectSelectedItemBlobs(items, selectedIds, sceneId)
  if (entries.length === 0) return

  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
      for (const { filename, blob } of entries) {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
      }
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }

  // Fallback: download each file individually
  for (const { filename, blob } of entries) {
    downloadBlob(blob, filename)
  }
}

// --- Export (Save As dialog with fallback to download) ---

export async function exportImage(imageItem: ImageItem, sceneId: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const { ext, filename, blobPromise } = getImageBlobInfo(imageItem, sceneId)
  return saveAsOrDownload(await blobPromise, filename, 'Image file', IMAGE_MIMES[ext] || 'image/png', ext)
}

export async function exportVideo(videoItem: VideoItem, sceneId: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const { ext, filename, blobPromise } = getVideoBlobInfo(videoItem, sceneId)
  return saveAsOrDownload(await blobPromise, filename, 'Video file', VIDEO_MIMES[ext] || 'video/mp4', ext)
}

export async function exportTextFile(textFileItem: TextFileItem, sceneId: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const { ext, filename, blobPromise } = getTextFileBlobInfo(textFileItem, sceneId)
  return saveAsOrDownload(await blobPromise, filename, `${ext.toUpperCase()} file`, TEXT_MIMES[ext] || 'text/plain', ext)
}

export async function exportPdf(pdfItem: PdfItem, sceneId: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const { filename, blobPromise } = getPdfBlobInfo(pdfItem, sceneId)
  return saveAsOrDownload(await blobPromise, filename, 'PDF file', 'application/pdf', 'pdf')
}
