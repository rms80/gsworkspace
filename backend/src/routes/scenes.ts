import { Router } from 'express'
import { validate as uuidValidate } from 'uuid'
import {
  save,
  load,
  loadAsBuffer,
  list,
  del,
  exists,
  getPublicUrl,
  getStorageMode,
} from '../services/storage.js'

const router = Router({ mergeParams: true })

const SCENE_FILE_VERSION = '1'

const TEXT_FILE_MIME_TYPES: Record<string, string> = {
  txt: 'text/plain', csv: 'text/csv', js: 'text/javascript', ts: 'text/typescript',
  tsx: 'text/typescript', cs: 'text/plain', cpp: 'text/plain', h: 'text/plain',
  c: 'text/plain', json: 'application/json', py: 'text/x-python',
  md: 'text/markdown', sh: 'text/x-shellscript', log: 'text/plain', ini: 'text/plain',
}

// Validate :id param is a valid UUID on all routes
router.param('id', (req, res, next, id) => {
  if (!uuidValidate(id)) {
    return res.status(400).json({ error: 'Invalid scene ID format' })
  }
  next()
})

/**
 * Validate that a URL is safe to fetch from.
 * Only allows: data URLs, our S3 bucket URLs, and local storage URLs.
 * Rejects external URLs to prevent SSRF attacks.
 */
function validateItemSrcUrl(url: string): { valid: boolean; reason?: string; type?: 'data' | 's3' | 'local' } {
  // Allow data URLs
  if (url.startsWith('data:')) {
    return { valid: true, type: 'data' }
  }

  // Check for path traversal in any URL
  if (url.includes('..') || url.includes('%2e%2e') || url.includes('%2E%2E')) {
    return { valid: false, reason: 'Path traversal detected' }
  }

  // Allow local storage URLs
  if (url.startsWith('/api/local-files/')) {
    return { valid: true, type: 'local' }
  }

  // Allow S3 URLs from our bucket only
  const bucketName = process.env.S3_BUCKET_NAME
  const region = process.env.AWS_REGION || 'us-east-1'
  if (bucketName) {
    const s3Prefix = `https://${bucketName}.s3.${region}.amazonaws.com/`
    if (url.startsWith(s3Prefix)) {
      return { valid: true, type: 's3' }
    }
  }

  // Reject all other URLs (external HTTP URLs)
  return { valid: false, reason: 'External URLs are not allowed' }
}

// Helper to extract storage key from a URL (S3 or local)
// Checks both formats regardless of current mode since URLs depend on when the file was uploaded
function getKeyFromUrl(url: string): string | null {
  // Strip query parameters first (e.g., cache-busting ?t=12345)
  const urlWithoutQuery = url.split('?')[0]

  // Check for local URLs first
  const localPrefix = '/api/local-files/'
  if (urlWithoutQuery.startsWith(localPrefix)) {
    return urlWithoutQuery.slice(localPrefix.length)
  }

  // Check for S3 URLs
  const bucketName = process.env.S3_BUCKET_NAME
  const region = process.env.AWS_REGION || 'us-east-1'
  const s3Prefix = `https://${bucketName}.s3.${region}.amazonaws.com/`
  if (urlWithoutQuery.startsWith(s3Prefix)) {
    return urlWithoutQuery.slice(s3Prefix.length)
  }

  return null
}

// Types for stored scene format
interface StoredItemBase {
  id: string
  x: number
  y: number
  width: number
  height: number
}

interface StoredTextItem extends StoredItemBase {
  type: 'text'
  fontSize: number
  text: string // inline text content
}

interface StoredImageItem extends StoredItemBase {
  type: 'image'
  file: string // reference to image file
  name?: string // editable label
  originalWidth?: number
  originalHeight?: number
  fileSize?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  cropRect?: { x: number; y: number; width: number; height: number }
  cropSrc?: string
}

interface StoredVideoItem extends StoredItemBase {
  type: 'video'
  file: string // reference to video file
  name?: string // editable label
  originalWidth?: number
  originalHeight?: number
  fileSize?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  loop?: boolean
  muted?: boolean
  playbackRate?: number
  speedFactor?: number
  removeAudio?: boolean
  cropRect?: { x: number; y: number; width: number; height: number }
  cropSrc?: string
  trim?: boolean
  trimStart?: number
  trimEnd?: number
}

interface StoredPromptItem extends StoredItemBase {
  type: 'prompt'
  fontSize: number
  label: string
  text: string
  model: string
}

interface StoredImageGenPromptItem extends StoredItemBase {
  type: 'image-gen-prompt'
  fontSize: number
  label: string
  text: string
  model: string
}

interface StoredHtmlItem extends StoredItemBase {
  type: 'html'
  label: string
  file: string // reference to .html file
  zoom?: number
}

interface StoredHtmlGenPromptItem extends StoredItemBase {
  type: 'html-gen-prompt'
  fontSize: number
  label: string
  text: string
  model: string
}

interface StoredPdfItem extends StoredItemBase {
  type: 'pdf'
  file: string
  name?: string
  fileSize?: number
  minimized?: boolean
  thumbFile?: string
}

interface StoredTextFileItem extends StoredItemBase {
  type: 'text-file'
  file: string
  name?: string
  fileSize?: number
  minimized?: boolean
  fileFormat: string
  fontMono?: boolean
  fontSize?: number
}

type StoredItem = StoredTextItem | StoredImageItem | StoredVideoItem | StoredPromptItem | StoredImageGenPromptItem | StoredHtmlItem | StoredHtmlGenPromptItem | StoredPdfItem | StoredTextFileItem

interface StoredScene {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  items: StoredItem[]
  version?: string
}

// Get scene timestamp only (lightweight check for conflict detection)
router.get('/:id/timestamp', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    // Load scene.json to get modifiedAt
    const sceneJson = await load(`${sceneFolder}/scene.json`)
    if (!sceneJson) {
      return res.status(404).json({ error: 'Scene not found' })
    }

    let storedScene: StoredScene
    try {
      storedScene = JSON.parse(sceneJson)
    } catch {
      return res.status(500).json({ error: 'Corrupted scene data' })
    }
    res.json({
      id: storedScene.id,
      modifiedAt: storedScene.modifiedAt,
    })
  } catch (error) {
    console.error('Error getting scene timestamp:', error)
    res.status(500).json({ error: 'Failed to get scene timestamp' })
  }
})

// Get content URL for a scene item
// Constructs the S3 URL for videos, images, or html content
router.get('/:id/content-url', (req, res) => {
  try {
    const { id } = req.params
    const { contentId, contentType, extension, isEdit } = req.query

    if (!contentId || !contentType) {
      return res.status(400).json({ error: 'contentId and contentType are required' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`
    let filename: string

    // Determine the file extension
    const ext = extension || (contentType === 'video' ? 'mp4' : contentType === 'image' ? 'png' : 'html')

    // Build filename based on content type and edit flag
    if (isEdit === 'true') {
      // Edited version (e.g., cropped video or image)
      filename = `${contentId}.crop.${ext}`
    } else {
      // Original version
      filename = `${contentId}.${ext}`
    }

    const url = getPublicUrl(`${sceneFolder}/${filename}`)
    res.json({ url })
  } catch (error) {
    console.error('Error getting content URL:', error)
    res.status(500).json({ error: 'Failed to get content URL' })
  }
})

// Get content data - returns the actual file data
// This avoids the need for proxy endpoints and complex URL handling
router.get('/:id/content-data', async (req, res) => {
  try {
    const { id } = req.params
    const { contentId, contentType, isEdit } = req.query

    if (!contentId || !contentType) {
      return res.status(400).json({ error: 'contentId and contentType are required' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    // Define possible extensions for each content type
    const extensions: Record<string, string[]> = {
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      video: ['mp4', 'webm', 'mov', 'avi'],
      html: ['html'],
      pdf: ['pdf'],
      'text-file': ['txt', 'csv', 'js', 'ts', 'tsx', 'cs', 'cpp', 'h', 'c', 'json', 'py', 'md', 'sh', 'log', 'ini'],
    }

    const contentTypeExts = extensions[contentType as string] || ['png']

    // Try to find the file with various extensions
    let fileBuffer: Buffer | null = null
    let foundExt: string | null = null

    for (const ext of contentTypeExts) {
      // Build filename based on edit flag
      const filename = isEdit === 'true'
        ? `${contentId}.crop.${ext}`
        : `${contentId}.${ext}`

      const key = `${sceneFolder}/${filename}`
      const buffer = await loadAsBuffer(key)

      if (buffer) {
        fileBuffer = buffer
        foundExt = ext
        break
      }
    }

    if (!fileBuffer || !foundExt) {
      return res.status(404).json({ error: 'Content not found' })
    }

    // Set appropriate content type
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      html: 'text/html',
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      js: 'text/javascript',
      cs: 'text/plain',
      cpp: 'text/plain',
      h: 'text/plain',
      c: 'text/plain',
      json: 'application/json',
      ts: 'text/typescript',
      tsx: 'text/typescript',
      py: 'text/x-python',
      md: 'text/markdown',
      sh: 'text/x-shellscript',
      log: 'text/plain',
      ini: 'text/plain',
    }

    res.setHeader('Content-Type', mimeTypes[foundExt] || 'application/octet-stream')
    res.setHeader('Content-Length', fileBuffer.length)
    res.send(fileBuffer)
  } catch (error) {
    console.error('Error getting content data:', error)
    res.status(500).json({ error: 'Failed to get content data' })
  }
})

// Save a scene
router.post('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, createdAt, modifiedAt, items } = req.body

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`
    const storedItems: StoredItem[] = []
    const stagingKeysToDelete: string[] = [] // Track staging files to clean up

    // Process each item
    for (const item of items) {
      if (item.type === 'text') {
        storedItems.push({
          id: item.id,
          type: 'text',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          text: item.text,
        })
      } else if (item.type === 'image') {
        // Determine file extension from source URL or default to png
        let imageExt = 'png'
        if (item.src.startsWith('data:image/')) {
          const match = item.src.match(/^data:image\/(\w+);/)
          if (match) imageExt = match[1]
        } else if (item.src.includes('.')) {
          const urlExt = item.src.split('.').pop()?.split('?')[0]
          if (urlExt && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(urlExt)) {
            imageExt = urlExt
          }
        }
        const imageFile = `${item.id}.${imageExt}`
        let imageSaved = false

        // If src is a data URL, extract and save the image
        if (item.src.startsWith('data:')) {
          const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
          if (matches) {
            const contentType = matches[1]
            const base64Data = matches[2]
            await save(
              `${sceneFolder}/${imageFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            imageSaved = true
          }
        } else {
          // Validate URL before processing
          const validation = validateItemSrcUrl(item.src)
          if (!validation.valid) {
            console.error(`Rejected image URL for item ${item.id}: ${validation.reason}`)
          } else {
            if (validation.type === 's3') {
              console.log(`Processing S3 image URL for item ${item.id}`)
            } else if (validation.type === 'local') {
              console.log(`Processing local image URL for item ${item.id}`)
            }

            // Check if the image is already in this scene folder (skip re-upload)
            if (item.src.includes(`/${sceneFolder}/`)) {
              imageSaved = true
            } else {
              // Check if the image file already exists in the scene folder (from a previous save)
              const imageKey = `${sceneFolder}/${imageFile}`
              const alreadyExists = await exists(imageKey)
              if (alreadyExists) {
                imageSaved = true
              } else {
                // If src is a URL, fetch/load and save the image to the scene folder
                try {
                  let buffer: Buffer | null = null
                  let contentType = 'image/png'

                  // Handle local URLs by reading directly from storage
                  if (item.src.startsWith('/api/local-files/')) {
                    const localKey = item.src.slice('/api/local-files/'.length)
                    buffer = await loadAsBuffer(localKey)
                  } else if (validation.type === 's3') {
                    // Fetch from our S3 bucket URL
                    const response = await fetch(item.src)
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer()
                      contentType = response.headers.get('content-type') || 'image/png'
                      buffer = Buffer.from(arrayBuffer)
                    }
                  }

                  if (buffer) {
                    await save(imageKey, buffer, contentType)
                    imageSaved = true
                    // Track staging file for cleanup if it's from /temp/images/ folder
                    const stagingKey = getKeyFromUrl(item.src)
                    if (stagingKey && stagingKey.startsWith('temp/images/')) {
                      stagingKeysToDelete.push(stagingKey)
                    }
                  }
                } catch (err) {
                  console.error(`Failed to fetch image from ${item.src}:`, err)
                }
              }
            }
          }
        }

        // Only add to stored items if the image was successfully saved
        if (imageSaved) {
          // Extract just the filename from cropSrc URL if present
          let cropFile: string | undefined = undefined
          if (item.cropSrc) {
            const cropKey = getKeyFromUrl(item.cropSrc)
            if (cropKey) {
              cropFile = cropKey.split('/').pop() // Get just the filename
            }
          }
          storedItems.push({
            id: item.id,
            type: 'image',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            file: imageFile,
            name: item.name,
            originalWidth: item.originalWidth,
            originalHeight: item.originalHeight,
            fileSize: item.fileSize,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            cropRect: item.cropRect,
            cropSrc: cropFile,
          })
        } else {
          console.error(`Failed to save image ${item.id}, skipping from scene`)
        }
      } else if (item.type === 'video') {
        // Determine file extension from source URL or default to mp4
        let ext = 'mp4'
        if (item.src.startsWith('data:video/')) {
          const match = item.src.match(/^data:video\/(\w+);/)
          if (match) ext = match[1]
        } else if (item.src.includes('.')) {
          const urlExt = item.src.split('.').pop()?.split('?')[0]
          if (urlExt && ['mp4', 'webm', 'ogg', 'mov'].includes(urlExt)) {
            ext = urlExt
          }
        }
        const videoFile = `${item.id}.${ext}`
        let videoSaved = false

        // If src is a data URL, extract and save the video
        if (item.src.startsWith('data:')) {
          const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
          if (matches) {
            const contentType = matches[1]
            const base64Data = matches[2]
            await save(
              `${sceneFolder}/${videoFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            videoSaved = true
          }
        } else {
          // Validate URL before processing
          const validation = validateItemSrcUrl(item.src)
          if (!validation.valid) {
            console.error(`Rejected video URL for item ${item.id}: ${validation.reason}`)
          } else {
            if (validation.type === 's3') {
              console.log(`Processing S3 video URL for item ${item.id}`)
            } else if (validation.type === 'local') {
              console.log(`Processing local video URL for item ${item.id}`)
            }

            // Check if the video is already in this scene folder (skip re-upload)
            if (item.src.includes(`/${sceneFolder}/`)) {
              videoSaved = true
            } else {
              // Check if the video file already exists in the scene folder (from a previous save)
              const videoKey = `${sceneFolder}/${videoFile}`
              const alreadyExists = await exists(videoKey)
              if (alreadyExists) {
                videoSaved = true
              } else {
                // If src is a URL, fetch/load and save the video to the scene folder
                try {
                  let buffer: Buffer | null = null
                  let contentType = 'video/mp4'

                  // Handle local URLs by reading directly from storage
                  if (item.src.startsWith('/api/local-files/')) {
                    const localKey = item.src.slice('/api/local-files/'.length)
                    buffer = await loadAsBuffer(localKey)
                  } else if (validation.type === 's3') {
                    // Fetch from our S3 bucket URL
                    const response = await fetch(item.src)
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer()
                      contentType = response.headers.get('content-type') || 'video/mp4'
                      buffer = Buffer.from(arrayBuffer)
                    } else {
                      console.error(`Failed to fetch video ${item.id}: HTTP ${response.status} ${response.statusText}`)
                    }
                  }

                  if (buffer) {
                    await save(videoKey, buffer, contentType)
                    videoSaved = true
                    // Track staging file for cleanup if it's from /temp/videos/ folder
                    const stagingKey = getKeyFromUrl(item.src)
                    if (stagingKey && stagingKey.startsWith('temp/videos/')) {
                      stagingKeysToDelete.push(stagingKey)
                    }
                  }
                } catch (err) {
                  console.error(`Failed to fetch video from ${item.src}:`, err)
                }
              }
            }
          }
        }

        // Only add to stored items if the video was successfully saved
        if (!videoSaved) {
          console.error(`Video ${item.id} not saved. Full src:`, item.src)
        }
        if (videoSaved) {
          // Extract just the filename from cropSrc URL if present
          let cropFile: string | undefined = undefined
          if (item.cropSrc) {
            const cropKey = getKeyFromUrl(item.cropSrc)
            if (cropKey) {
              cropFile = cropKey.split('/').pop() // Get just the filename
            }
          }
          storedItems.push({
            id: item.id,
            type: 'video',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            file: videoFile,
            name: item.name,
            originalWidth: item.originalWidth,
            originalHeight: item.originalHeight,
            fileSize: item.fileSize,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            loop: item.loop,
            muted: item.muted,
            playbackRate: item.playbackRate,
            speedFactor: item.speedFactor,
            removeAudio: item.removeAudio,
            cropRect: item.cropRect,
            cropSrc: cropFile,
            trim: item.trim,
            trimStart: item.trimStart,
            trimEnd: item.trimEnd,
          })
        } else {
          console.error(`Failed to save video ${item.id}, skipping from scene`)
        }
      } else if (item.type === 'prompt') {
        storedItems.push({
          id: item.id,
          type: 'prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          label: item.label,
          text: item.text,
          model: item.model || 'claude-sonnet',
        })
      } else if (item.type === 'image-gen-prompt') {
        storedItems.push({
          id: item.id,
          type: 'image-gen-prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          label: item.label,
          text: item.text,
          model: item.model || 'gemini-imagen',
        })
      } else if (item.type === 'html-gen-prompt') {
        storedItems.push({
          id: item.id,
          type: 'html-gen-prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          label: item.label,
          text: item.text,
          model: item.model || 'claude-sonnet',
        })
      } else if (item.type === 'html') {
        const htmlFile = `${item.id}.html`
        await save(`${sceneFolder}/${htmlFile}`, item.html, 'text/html')
        storedItems.push({
          id: item.id,
          type: 'html',
          label: item.label || 'HTML',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          file: htmlFile,
          zoom: item.zoom,
        })
      } else if (item.type === 'pdf') {
        const pdfFile = `${item.id}.pdf`
        let pdfSaved = false

        if (item.src.startsWith('data:')) {
          const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
          if (matches) {
            const contentType = matches[1]
            const base64Data = matches[2]
            await save(
              `${sceneFolder}/${pdfFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            pdfSaved = true
          }
        } else {
          const validation = validateItemSrcUrl(item.src)
          if (!validation.valid) {
            console.error(`Rejected PDF URL for item ${item.id}: ${validation.reason}`)
          } else {
            if (item.src.includes(`/${sceneFolder}/`)) {
              pdfSaved = true
            } else {
              const pdfKey = `${sceneFolder}/${pdfFile}`
              const alreadyExists = await exists(pdfKey)
              if (alreadyExists) {
                pdfSaved = true
              } else {
                try {
                  let buffer: Buffer | null = null
                  const contentType = 'application/pdf'

                  if (item.src.startsWith('/api/local-files/')) {
                    const localKey = item.src.slice('/api/local-files/'.length)
                    buffer = await loadAsBuffer(localKey)
                  } else if (validation.type === 's3') {
                    const response = await fetch(item.src)
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer()
                      buffer = Buffer.from(arrayBuffer)
                    }
                  }

                  if (buffer) {
                    await save(pdfKey, buffer, contentType)
                    pdfSaved = true
                  }
                } catch (err) {
                  console.error(`Failed to fetch PDF from ${item.src}:`, err)
                }
              }
            }
          }
        }

        if (pdfSaved) {
          // Handle thumbnail
          let thumbFile: string | undefined = undefined
          if (item.thumbnailSrc) {
            const thumbFileName = `${item.id}.thumb.png`
            if (item.thumbnailSrc.startsWith('data:')) {
              const matches = item.thumbnailSrc.match(/^data:([^;]+);base64,(.+)$/)
              if (matches) {
                await save(
                  `${sceneFolder}/${thumbFileName}`,
                  Buffer.from(matches[2], 'base64'),
                  matches[1]
                )
                thumbFile = thumbFileName
              }
            } else {
              // URL — check if it already points to this scene folder
              if (item.thumbnailSrc.includes(`/${sceneFolder}/`)) {
                thumbFile = thumbFileName
              } else {
                const thumbKey = `${sceneFolder}/${thumbFileName}`
                const alreadyExists = await exists(thumbKey)
                if (alreadyExists) {
                  thumbFile = thumbFileName
                } else {
                  try {
                    let buffer: Buffer | null = null
                    if (item.thumbnailSrc.startsWith('/api/local-files/')) {
                      const localKey = item.thumbnailSrc.slice('/api/local-files/'.length)
                      buffer = await loadAsBuffer(localKey)
                    } else {
                      const validation = validateItemSrcUrl(item.thumbnailSrc)
                      if (validation.valid && validation.type === 's3') {
                        const response = await fetch(item.thumbnailSrc)
                        if (response.ok) {
                          buffer = Buffer.from(await response.arrayBuffer())
                        }
                      }
                    }
                    if (buffer) {
                      await save(thumbKey, buffer, 'image/png')
                      thumbFile = thumbFileName
                    }
                  } catch (err) {
                    console.error(`Failed to save PDF thumbnail for ${item.id}:`, err)
                  }
                }
              }
            }
          }

          storedItems.push({
            id: item.id,
            type: 'pdf',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            file: pdfFile,
            name: item.name,
            fileSize: item.fileSize,
            minimized: item.minimized,
            thumbFile,
          })
        } else {
          console.error(`Failed to save PDF ${item.id}, skipping from scene`)
        }
      } else if (item.type === 'text-file') {
        const ext = item.fileFormat || 'txt'
        const textFileFile = `${item.id}.${ext}`
        let textFileSaved = false

        if (item.src.startsWith('data:')) {
          const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
          if (matches) {
            const contentType = matches[1]
            const base64Data = matches[2]
            await save(
              `${sceneFolder}/${textFileFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            textFileSaved = true
          }
        } else {
          const validation = validateItemSrcUrl(item.src)
          if (!validation.valid) {
            console.error(`Rejected text file URL for item ${item.id}: ${validation.reason}`)
          } else {
            if (item.src.includes(`/${sceneFolder}/`)) {
              textFileSaved = true
            } else {
              const textFileKey = `${sceneFolder}/${textFileFile}`
              const alreadyExists = await exists(textFileKey)
              if (alreadyExists) {
                textFileSaved = true
              } else {
                try {
                  let buffer: Buffer | null = null
                  const contentType = TEXT_FILE_MIME_TYPES[ext] || 'text/plain'

                  if (item.src.startsWith('/api/local-files/')) {
                    const localKey = item.src.slice('/api/local-files/'.length)
                    buffer = await loadAsBuffer(localKey)
                  } else if (validation.type === 's3') {
                    const response = await fetch(item.src)
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer()
                      buffer = Buffer.from(arrayBuffer)
                    }
                  }

                  if (buffer) {
                    await save(textFileKey, buffer, contentType)
                    textFileSaved = true
                  }
                } catch (err) {
                  console.error(`Failed to fetch text file from ${item.src}:`, err)
                }
              }
            }
          }
        }

        if (textFileSaved) {
          storedItems.push({
            id: item.id,
            type: 'text-file',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            file: textFileFile,
            name: item.name,
            fileSize: item.fileSize,
            minimized: item.minimized,
            fileFormat: item.fileFormat || 'txt',
            fontMono: item.fontMono,
            fontSize: item.fontSize,
          })
        } else {
          console.error(`Failed to save text file ${item.id}, skipping from scene`)
        }
      }
    }

    // Save scene.json
    const storedScene: StoredScene = {
      id,
      name,
      createdAt,
      modifiedAt,
      items: storedItems,
      version: SCENE_FILE_VERSION,
    }
    await save(`${sceneFolder}/scene.json`, JSON.stringify(storedScene, null, 2))

    // Clean up staging files (images/ and videos/ folders) after successful save
    if (stagingKeysToDelete.length > 0) {
      await Promise.all(
        stagingKeysToDelete.map(key =>
          del(key).catch(err =>
            console.error(`Failed to delete staging file ${key}:`, err)
          )
        )
      )
    }

    res.json({ success: true, id })
  } catch (error) {
    console.error('Error saving scene:', error)
    res.status(500).json({ error: 'Failed to save scene' })
  }
})

// Get raw scene.json (no transformation)
router.get('/:id/raw', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    const sceneJson = await load(`${sceneFolder}/scene.json`)
    if (!sceneJson) {
      return res.status(404).json({ error: 'Scene not found' })
    }

    res.type('application/json').send(sceneJson)
  } catch (error) {
    console.error('Error loading raw scene:', error)
    res.status(500).json({ error: 'Failed to load raw scene' })
  }
})

// Load a scene
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    // Load scene.json
    const sceneJson = await load(`${sceneFolder}/scene.json`)
    if (!sceneJson) {
      return res.status(404).json({ error: 'Scene not found' })
    }

    let storedScene: StoredScene
    try {
      storedScene = JSON.parse(sceneJson)
    } catch {
      return res.status(500).json({ error: 'Corrupted scene data' })
    }

    // Reconstruct items with full data
    const items = await Promise.all(
      storedScene.items.map(async (item) => {
        if (item.type === 'text') {
          return {
            id: item.id,
            type: 'text' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            text: item.text,
          }
        } else if (item.type === 'image') {
          // For images, return the public URL
          const imageUrl = getPublicUrl(`${sceneFolder}/${item.file}`)
          // Reconstruct cropSrc URL from filename if present
          const cropSrcUrl = item.cropSrc ? getPublicUrl(`${sceneFolder}/${item.cropSrc}`) : undefined
          return {
            id: item.id,
            type: 'image' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: imageUrl,
            name: item.name,
            originalWidth: item.originalWidth,
            originalHeight: item.originalHeight,
            fileSize: item.fileSize,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            cropRect: item.cropRect,
            cropSrc: cropSrcUrl,
          }
        } else if (item.type === 'video') {
          // For videos, return the public URL
          const videoUrl = getPublicUrl(`${sceneFolder}/${item.file}`)
          // Reconstruct cropSrc URL from filename if present
          const cropSrcUrl = item.cropSrc ? getPublicUrl(`${sceneFolder}/${item.cropSrc}`) : undefined
          return {
            id: item.id,
            type: 'video' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: videoUrl,
            name: item.name,
            originalWidth: item.originalWidth,
            originalHeight: item.originalHeight,
            fileSize: item.fileSize,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            loop: item.loop,
            muted: item.muted,
            playbackRate: item.playbackRate,
            speedFactor: item.speedFactor,
            removeAudio: item.removeAudio,
            cropRect: item.cropRect,
            cropSrc: cropSrcUrl,
            trim: item.trim,
            trimStart: item.trimStart,
            trimEnd: item.trimEnd,
          }
        } else if (item.type === 'prompt') {
          return {
            id: item.id,
            type: 'prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: item.label,
            text: item.text,
            model: item.model || 'claude-sonnet',
          }
        } else if (item.type === 'image-gen-prompt') {
          return {
            id: item.id,
            type: 'image-gen-prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: item.label,
            text: item.text,
            model: item.model || 'gemini-imagen',
          }
        } else if (item.type === 'html-gen-prompt') {
          return {
            id: item.id,
            type: 'html-gen-prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: item.label,
            text: item.text,
            model: item.model || 'claude-sonnet',
          }
        } else if (item.type === 'pdf') {
          const pdfUrl = getPublicUrl(`${sceneFolder}/${item.file}`)
          const thumbnailSrc = item.thumbFile ? getPublicUrl(`${sceneFolder}/${item.thumbFile}`) : undefined
          return {
            id: item.id,
            type: 'pdf' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: pdfUrl,
            name: item.name,
            fileSize: item.fileSize,
            minimized: item.minimized,
            thumbnailSrc,
          }
        } else if (item.type === 'text-file') {
          const textFileUrl = getPublicUrl(`${sceneFolder}/${item.file}`)
          return {
            id: item.id,
            type: 'text-file' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: textFileUrl,
            name: item.name,
            fileSize: item.fileSize,
            minimized: item.minimized,
            fileFormat: item.fileFormat,
            fontMono: item.fontMono,
            fontSize: item.fontSize,
          }
        } else {
          // For HTML items, load the HTML file
          const html = await load(`${sceneFolder}/${item.file}`)
          return {
            id: item.id,
            type: 'html' as const,
            label: item.label || 'HTML',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            html: html || '',
            zoom: item.zoom,
          }
        }
      })
    )

    res.json({
      id: storedScene.id,
      name: storedScene.name,
      createdAt: storedScene.createdAt,
      modifiedAt: storedScene.modifiedAt,
      items,
      version: storedScene.version,
    })
  } catch (error) {
    console.error('Error loading scene:', error)
    res.status(500).json({ error: 'Failed to load scene' })
  }
})

// List all scenes (returns metadata only)
router.get('/', async (req, res) => {
  try {
    // List all scene.json files
    const allKeys = await list(`${(req.params as Record<string, string>).workspace}/`)
    const sceneJsonKeys = allKeys.filter((key) => key.endsWith('/scene.json'))

    // Load metadata for each scene
    const scenes = await Promise.all(
      sceneJsonKeys.map(async (key) => {
        const sceneJson = await load(key)
        if (!sceneJson) return null
        let scene: StoredScene
        try {
          scene = JSON.parse(sceneJson)
        } catch {
          return null
        }
        return {
          id: scene.id,
          name: scene.name,
          createdAt: scene.createdAt,
          modifiedAt: scene.modifiedAt,
          itemCount: scene.items.length,
        }
      })
    )

    res.json(scenes.filter(Boolean))
  } catch (error) {
    console.error('Error listing scenes:', error)
    res.status(500).json({ error: 'Failed to list scenes' })
  }
})

// Delete a scene
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    // List all files in the scene folder
    const allKeys = await list(`${sceneFolder}/`)

    // Delete all files in the scene folder
    await Promise.all(allKeys.map((key) => del(key)))

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting scene:', error)
    res.status(500).json({ error: 'Failed to delete scene' })
  }
})

// Load history for a scene
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    const historyJson = await load(`${sceneFolder}/history.json`)
    if (!historyJson) {
      // No history yet, return empty
      return res.json({ records: [], currentIndex: -1 })
    }

    let history
    try {
      history = JSON.parse(historyJson)
    } catch {
      return res.status(500).json({ error: 'Corrupted history data' })
    }
    res.json(history)
  } catch (error) {
    console.error('Error loading history:', error)
    res.status(500).json({ error: 'Failed to load history' })
  }
})

// Save history for a scene
router.post('/:id/history', async (req, res) => {
  try {
    const { id } = req.params
    const { records, currentIndex } = req.body
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${id}`

    await save(
      `${sceneFolder}/history.json`,
      JSON.stringify({ records, currentIndex }, null, 2)
    )

    res.json({ success: true })
  } catch (error) {
    console.error('Error saving history:', error)
    res.status(500).json({ error: 'Failed to save history' })
  }
})

export default router
