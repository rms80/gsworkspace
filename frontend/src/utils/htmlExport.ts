/**
 * HTML/Markdown Export Utility
 * Exports HTML content with images to local files using File System Access API
 */

import TurndownService from 'turndown'
import JSZip from 'jszip'

/**
 * Extract all image sources from HTML content
 */
export function extractImageSources(html: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const images = doc.querySelectorAll('img')
  const sources: string[] = []

  images.forEach((img) => {
    const src = img.getAttribute('src')
    if (src) {
      sources.push(src)
    }
  })

  return sources
}

/**
 * Convert a data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream'

  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return new Blob([bytes], { type: mimeType })
}

/**
 * Map of image src URLs to their display names (from canvas ImageItem.name)
 */
export type ImageNameMap = Map<string, string>

/**
 * Sanitize a name for use as a filename (remove/replace invalid characters)
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    || 'image' // Fallback if empty
}

/**
 * Generate a unique filename for an image, using its name from the canvas if available
 */
function generateImageFilename(
  src: string,
  extension: string,
  imageNameMap: ImageNameMap | undefined,
  usedNames: Set<string>
): string {
  // Try to get name from map
  let baseName = imageNameMap?.get(src)

  if (baseName) {
    baseName = sanitizeFilename(baseName)
  } else {
    baseName = 'image'
  }

  // Ensure uniqueness
  let filename = `${baseName}.${extension}`
  let counter = 2
  while (usedNames.has(filename)) {
    filename = `${baseName}_${counter}.${extension}`
    counter++
  }
  usedNames.add(filename)

  return filename
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/ico': 'ico',
    'image/x-icon': 'ico',
  }
  return mimeToExt[mimeType] || 'png'
}

/**
 * Fetch an image as a Blob (handles data URLs, S3 URLs, external URLs)
 * Uses proxy endpoint for remote URLs to avoid CORS issues
 */
export async function fetchImageAsBlob(src: string): Promise<{ blob: Blob; extension: string }> {
  if (src.startsWith('data:')) {
    const blob = dataUrlToBlob(src)
    const extension = getExtensionFromMimeType(blob.type)
    return { blob, extension }
  }

  // Use proxy endpoint to avoid CORS issues
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
  const response = await fetch(proxyUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || blob.type
  const extension = getExtensionFromMimeType(contentType)

  return { blob, extension }
}

/**
 * Rewrite HTML image paths to use local relative paths
 */
export function rewriteHtmlImagePaths(html: string, imageMap: Map<string, string>): string {
  let result = html

  imageMap.forEach((newPath, originalSrc) => {
    // Escape special regex characters in the original src
    const escaped = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`src=["']${escaped}["']`, 'g')
    result = result.replace(regex, `src="./${newPath}"`)
  })

  return result
}

/**
 * Convert an image URL to a data URL for embedding
 */
async function imageToDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) {
    return src
  }

  const { blob } = await fetchImageAsBlob(src)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Rewrite HTML to embed all images as data URLs (fallback for browsers without File System Access API)
 */
async function embedImagesAsDataUrls(html: string): Promise<string> {
  const sources = extractImageSources(html)
  let result = html

  for (const src of sources) {
    try {
      const dataUrl = await imageToDataUrl(src)
      const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`src=["']${escaped}["']`, 'g')
      result = result.replace(regex, `src="${dataUrl}"`)
    } catch (error) {
      console.warn(`Failed to embed image ${src}:`, error)
      // Keep original URL
    }
  }

  return result
}

/**
 * Download HTML with embedded images (fallback method)
 */
async function downloadEmbeddedHtml(html: string, filename: string): Promise<void> {
  const embeddedHtml = await embedImagesAsDataUrls(html)
  const blob = new Blob([embeddedHtml], { type: 'text/html' })
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
 * Check if File System Access API is available
 */
function hasFileSystemAccess(): boolean {
  return 'showSaveFilePicker' in window
}

// Type definitions for File System Access API
interface SaveFilePickerOptions {
  suggestedName?: string
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

interface DirectoryPickerOptions {
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  mode?: 'read' | 'readwrite'
}

interface FileSystemWindow {
  showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  showDirectoryPicker: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
}

/**
 * Main export function - exports HTML with images to local files
 * User chooses HTML filename via save dialog, images go in a subfolder named {basename}_images/
 */
export async function exportHtmlWithImages(html: string, suggestedFilename: string, imageNameMap?: ImageNameMap): Promise<void> {
  // Fallback for browsers without File System Access API
  if (!hasFileSystemAccess()) {
    await downloadEmbeddedHtml(html, `${suggestedFilename}.html`)
    return
  }

  const fsWindow = window as unknown as FileSystemWindow

  // Show native save file picker for HTML
  const htmlFileHandle = await fsWindow.showSaveFilePicker({
    suggestedName: `${suggestedFilename}.html`,
    types: [
      {
        description: 'HTML Files',
        accept: { 'text/html': ['.html', '.htm'] },
      },
    ],
  })

  // Get base name from chosen filename for images folder
  const htmlFilename = htmlFileHandle.name
  const baseName = htmlFilename.replace(/\.(html|htm)$/i, '')
  const imagesFolderName = `${baseName}_images`

  // Extract image sources
  const sources = extractImageSources(html)
  const imageMap = new Map<string, string>()

  // Only handle images if there are any
  if (sources.length > 0) {
    // Ask user to select the directory where HTML will be saved (for creating images subfolder)
    // startIn: htmlFileHandle should open the picker in the same directory
    const dirHandle = await fsWindow.showDirectoryPicker({
      startIn: htmlFileHandle,
      mode: 'readwrite',
    })

    // Create images subfolder
    const imagesDirHandle = await dirHandle.getDirectoryHandle(imagesFolderName, { create: true })

    // Download and save each image to the subfolder
    const usedNames = new Set<string>()
    for (const src of sources) {
      try {
        const { blob, extension } = await fetchImageAsBlob(src)
        const imageFilename = generateImageFilename(src, extension, imageNameMap, usedNames)

        const imageFileHandle = await imagesDirHandle.getFileHandle(imageFilename, { create: true })
        const writable = await imageFileHandle.createWritable()
        await writable.write(blob)
        await writable.close()

        // Path relative to HTML file
        imageMap.set(src, `${imagesFolderName}/${imageFilename}`)
      } catch (error) {
        console.warn(`Failed to save image ${src}:`, error)
        // Keep original URL in HTML
      }
    }
  }

  // Rewrite HTML with local paths
  const rewrittenHtml = rewriteHtmlImagePaths(html, imageMap)

  // Save HTML file
  const htmlWritable = await htmlFileHandle.createWritable()
  await htmlWritable.write(rewrittenHtml)
  await htmlWritable.close()
}

/**
 * Strip style and script tags from HTML
 */
function stripStylesAndScripts(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Remove all style tags
  doc.querySelectorAll('style').forEach((el) => el.remove())
  // Remove all script tags
  doc.querySelectorAll('script').forEach((el) => el.remove())
  // Remove inline style attributes
  doc.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'))

  return doc.body.innerHTML
}

/**
 * Convert HTML to Markdown using Turndown
 */
function htmlToMarkdown(html: string): string {
  // Strip CSS and scripts before conversion
  const cleanHtml = stripStylesAndScripts(html)

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })
  return turndownService.turndown(cleanHtml)
}

/**
 * Rewrite Markdown image paths to use local relative paths
 */
function rewriteMarkdownImagePaths(markdown: string, imageMap: Map<string, string>): string {
  let result = markdown

  imageMap.forEach((newPath, originalSrc) => {
    // Escape special regex characters in the original src
    const escaped = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match markdown image syntax: ![alt](src)
    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, 'g')
    result = result.replace(regex, `![$1](./${newPath})`)
  })

  return result
}

/**
 * Download Markdown with embedded images (fallback method)
 */
async function downloadEmbeddedMarkdown(html: string, filename: string): Promise<void> {
  const embeddedHtml = await embedImagesAsDataUrls(html)
  const markdown = htmlToMarkdown(embeddedHtml)
  const blob = new Blob([markdown], { type: 'text/markdown' })
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
 * Export HTML as Markdown with images to local files
 * User chooses Markdown filename via save dialog, images go in a subfolder named {basename}_images/
 */
export async function exportMarkdownWithImages(html: string, suggestedFilename: string, imageNameMap?: ImageNameMap): Promise<void> {
  // Fallback for browsers without File System Access API
  if (!hasFileSystemAccess()) {
    await downloadEmbeddedMarkdown(html, `${suggestedFilename}.md`)
    return
  }

  const fsWindow = window as unknown as FileSystemWindow

  // Show native save file picker for Markdown
  const mdFileHandle = await fsWindow.showSaveFilePicker({
    suggestedName: `${suggestedFilename}.md`,
    types: [
      {
        description: 'Markdown Files',
        accept: { 'text/markdown': ['.md', '.markdown'] },
      },
    ],
  })

  // Get base name from chosen filename for images folder
  const mdFilename = mdFileHandle.name
  const baseName = mdFilename.replace(/\.(md|markdown)$/i, '')
  const imagesFolderName = `${baseName}_images`

  // Extract image sources from HTML
  const sources = extractImageSources(html)
  const imageMap = new Map<string, string>()

  // Only handle images if there are any
  if (sources.length > 0) {
    // Ask user to select the directory where Markdown will be saved (for creating images subfolder)
    const dirHandle = await fsWindow.showDirectoryPicker({
      startIn: mdFileHandle,
      mode: 'readwrite',
    })

    // Create images subfolder
    const imagesDirHandle = await dirHandle.getDirectoryHandle(imagesFolderName, { create: true })

    // Download and save each image to the subfolder
    const usedNames = new Set<string>()
    for (const src of sources) {
      try {
        const { blob, extension } = await fetchImageAsBlob(src)
        const imageFilename = generateImageFilename(src, extension, imageNameMap, usedNames)

        const imageFileHandle = await imagesDirHandle.getFileHandle(imageFilename, { create: true })
        const writable = await imageFileHandle.createWritable()
        await writable.write(blob)
        await writable.close()

        // Path relative to Markdown file
        imageMap.set(src, `${imagesFolderName}/${imageFilename}`)
      } catch (error) {
        console.warn(`Failed to save image ${src}:`, error)
        // Keep original URL in Markdown
      }
    }
  }

  // Convert HTML to Markdown
  const markdown = htmlToMarkdown(html)

  // Rewrite Markdown with local image paths
  const rewrittenMarkdown = rewriteMarkdownImagePaths(markdown, imageMap)

  // Save Markdown file
  const mdWritable = await mdFileHandle.createWritable()
  await mdWritable.write(rewrittenMarkdown)
  await mdWritable.close()
}

/**
 * Helper to trigger a zip download via save file picker or fallback <a> download
 */
async function downloadZip(zip: JSZip, suggestedFilename: string): Promise<void> {
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  if (hasFileSystemAccess()) {
    const fsWindow = window as unknown as FileSystemWindow
    const fileHandle = await fsWindow.showSaveFilePicker({
      suggestedName: suggestedFilename,
      types: [
        {
          description: 'ZIP Files',
          accept: { 'application/zip': ['.zip'] },
        },
      ],
    })
    const writable = await fileHandle.createWritable()
    await writable.write(zipBlob)
    await writable.close()
  } else {
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedFilename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

/**
 * Collect images and build an image map for zip export.
 * Returns the imageMap (originalSrc -> relative path) and adds files to the zip.
 */
async function collectImagesForZip(
  html: string,
  imagesFolderName: string,
  zip: JSZip,
  imageNameMap?: ImageNameMap
): Promise<Map<string, string>> {
  const sources = extractImageSources(html)
  const imageMap = new Map<string, string>()

  if (sources.length > 0) {
    const imagesFolder = zip.folder(imagesFolderName)!

    const usedNames = new Set<string>()
    for (const src of sources) {
      try {
        const { blob, extension } = await fetchImageAsBlob(src)
        const imageFilename = generateImageFilename(src, extension, imageNameMap, usedNames)
        imagesFolder.file(imageFilename, blob)
        imageMap.set(src, `${imagesFolderName}/${imageFilename}`)
      } catch (error) {
        console.warn(`Failed to add image ${src} to zip:`, error)
      }
    }
  }

  return imageMap
}

/**
 * Export HTML with images as a ZIP file
 */
export async function exportHtmlZip(html: string, suggestedFilename: string, imageNameMap?: ImageNameMap): Promise<void> {
  const zip = new JSZip()
  const imagesFolderName = `${suggestedFilename}_images`

  // Collect images
  const imageMap = await collectImagesForZip(html, imagesFolderName, zip, imageNameMap)

  // Rewrite HTML with local paths
  const rewrittenHtml = rewriteHtmlImagePaths(html, imageMap)

  // Add HTML file
  zip.file(`${suggestedFilename}.html`, rewrittenHtml)

  // Download
  await downloadZip(zip, `${suggestedFilename}.zip`)
}

/**
 * Export Markdown with images as a ZIP file
 */
export async function exportMarkdownZip(html: string, suggestedFilename: string, imageNameMap?: ImageNameMap): Promise<void> {
  const zip = new JSZip()
  const imagesFolderName = `${suggestedFilename}_images`

  // Collect images
  const imageMap = await collectImagesForZip(html, imagesFolderName, zip, imageNameMap)

  // Convert HTML to Markdown
  const markdown = htmlToMarkdown(html)

  // Rewrite Markdown with local image paths
  const rewrittenMarkdown = rewriteMarkdownImagePaths(markdown, imageMap)

  // Add Markdown file
  zip.file(`${suggestedFilename}.md`, rewrittenMarkdown)

  // Download
  await downloadZip(zip, `${suggestedFilename}.zip`)
}
