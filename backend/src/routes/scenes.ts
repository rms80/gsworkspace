import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3, getPublicUrl, deleteFromS3, existsInS3 } from '../services/s3.js'

const router = Router()

// User folder - hardcoded for now, will be per-user later
const USER_FOLDER = 'version0'

// Helper to extract S3 key from a full S3 URL
function getS3KeyFromUrl(url: string): string | null {
  const bucketName = process.env.S3_BUCKET_NAME
  const region = process.env.AWS_REGION || 'us-east-1'
  const prefix = `https://${bucketName}.s3.${region}.amazonaws.com/`
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length)
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

type StoredItem = StoredTextItem | StoredImageItem | StoredVideoItem | StoredPromptItem | StoredImageGenPromptItem | StoredHtmlItem | StoredHtmlGenPromptItem

interface StoredScene {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  items: StoredItem[]
}

// Get scene timestamp only (lightweight check for conflict detection)
router.get('/:id/timestamp', async (req, res) => {
  try {
    const { id } = req.params
    const sceneFolder = `${USER_FOLDER}/${id}`

    // Load scene.json to get modifiedAt
    const sceneJson = await loadFromS3(`${sceneFolder}/scene.json`)
    if (!sceneJson) {
      return res.status(404).json({ error: 'Scene not found' })
    }

    const storedScene: StoredScene = JSON.parse(sceneJson)
    res.json({
      id: storedScene.id,
      modifiedAt: storedScene.modifiedAt,
    })
  } catch (error) {
    console.error('Error getting scene timestamp:', error)
    res.status(500).json({ error: 'Failed to get scene timestamp' })
  }
})

// Save a scene
router.post('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, createdAt, modifiedAt, items } = req.body

    const sceneFolder = `${USER_FOLDER}/${id}`
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
        const imageFile = `${item.id}.png`
        let imageSaved = false

        // If src is a data URL, extract and save the image
        if (item.src.startsWith('data:')) {
          const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
          if (matches) {
            const contentType = matches[1]
            const base64Data = matches[2]
            await saveToS3(
              `${sceneFolder}/${imageFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            imageSaved = true
          }
        } else if (item.src.startsWith('http')) {
          // Check if the image is already in this scene folder (skip re-upload)
          if (item.src.includes(`/${sceneFolder}/`)) {
            imageSaved = true
          } else {
            // Check if the image file already exists in the scene folder (from a previous save)
            const imageKey = `${sceneFolder}/${imageFile}`
            const alreadyExists = await existsInS3(imageKey)
            if (alreadyExists) {
              imageSaved = true
            } else {
              // If src is a URL, fetch and save the image to the scene folder
              try {
                const response = await fetch(item.src)
                if (response.ok) {
                  const arrayBuffer = await response.arrayBuffer()
                  const contentType = response.headers.get('content-type') || 'image/png'
                  await saveToS3(
                    imageKey,
                    Buffer.from(arrayBuffer),
                    contentType
                  )
                  imageSaved = true
                  // Track staging file for cleanup if it's from /temp/images/ folder
                  const stagingKey = getS3KeyFromUrl(item.src)
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

        // Only add to stored items if the image was successfully saved
        if (imageSaved) {
          storedItems.push({
            id: item.id,
            type: 'image',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            file: imageFile,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            cropRect: item.cropRect,
            cropSrc: item.cropSrc,
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
            await saveToS3(
              `${sceneFolder}/${videoFile}`,
              Buffer.from(base64Data, 'base64'),
              contentType
            )
            videoSaved = true
          }
        } else if (item.src.startsWith('http')) {
          // Check if the video is already in this scene folder (skip re-upload)
          if (item.src.includes(`/${sceneFolder}/`)) {
            videoSaved = true
          } else {
            // Check if the video file already exists in the scene folder (from a previous save)
            const videoKey = `${sceneFolder}/${videoFile}`
            const alreadyExists = await existsInS3(videoKey)
            if (alreadyExists) {
              videoSaved = true
            } else {
              // If src is a URL, fetch and save the video to the scene folder
              try {
                const response = await fetch(item.src)
                if (response.ok) {
                  const arrayBuffer = await response.arrayBuffer()
                  const contentType = response.headers.get('content-type') || 'video/mp4'
                  await saveToS3(
                    videoKey,
                    Buffer.from(arrayBuffer),
                    contentType
                  )
                  videoSaved = true
                  // Track staging file for cleanup if it's from /temp/videos/ folder
                  const stagingKey = getS3KeyFromUrl(item.src)
                  if (stagingKey && stagingKey.startsWith('temp/videos/')) {
                    stagingKeysToDelete.push(stagingKey)
                  }
                } else {
                  console.error(`Failed to fetch video ${item.id}: HTTP ${response.status} ${response.statusText}`)
                }
              } catch (err) {
                console.error(`Failed to fetch video from ${item.src}:`, err)
              }
            }
          }
        }

        // Only add to stored items if the video was successfully saved
        if (!videoSaved) {
          console.error(`Video ${item.id} not saved. Full src:`, item.src)
        }
        if (videoSaved) {
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
        await saveToS3(`${sceneFolder}/${htmlFile}`, item.html, 'text/html')
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
      }
    }

    // Save scene.json
    const storedScene: StoredScene = {
      id,
      name,
      createdAt,
      modifiedAt,
      items: storedItems,
    }
    await saveToS3(`${sceneFolder}/scene.json`, JSON.stringify(storedScene, null, 2))

    // Clean up staging files (images/ and videos/ folders) after successful save
    if (stagingKeysToDelete.length > 0) {
      await Promise.all(
        stagingKeysToDelete.map(key =>
          deleteFromS3(key).catch(err =>
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
    const sceneFolder = `${USER_FOLDER}/${id}`

    const sceneJson = await loadFromS3(`${sceneFolder}/scene.json`)
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
    const sceneFolder = `${USER_FOLDER}/${id}`

    // Load scene.json
    const sceneJson = await loadFromS3(`${sceneFolder}/scene.json`)
    if (!sceneJson) {
      return res.status(404).json({ error: 'Scene not found' })
    }

    const storedScene: StoredScene = JSON.parse(sceneJson)

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
          return {
            id: item.id,
            type: 'image' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: imageUrl,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            cropRect: item.cropRect,
            cropSrc: item.cropSrc,
          }
        } else if (item.type === 'video') {
          // For videos, return the public URL
          const videoUrl = getPublicUrl(`${sceneFolder}/${item.file}`)
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
        } else {
          // For HTML items, load the HTML file
          const html = await loadFromS3(`${sceneFolder}/${item.file}`)
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
    })
  } catch (error) {
    console.error('Error loading scene:', error)
    res.status(500).json({ error: 'Failed to load scene' })
  }
})

// List all scenes (returns metadata only)
router.get('/', async (_req, res) => {
  try {
    // List all scene.json files
    const allKeys = await listFromS3(`${USER_FOLDER}/`)
    const sceneJsonKeys = allKeys.filter((key) => key.endsWith('/scene.json'))

    // Load metadata for each scene
    const scenes = await Promise.all(
      sceneJsonKeys.map(async (key) => {
        const sceneJson = await loadFromS3(key)
        if (!sceneJson) return null
        const scene: StoredScene = JSON.parse(sceneJson)
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
    const sceneFolder = `${USER_FOLDER}/${id}`

    // List all files in the scene folder
    const allKeys = await listFromS3(`${sceneFolder}/`)

    // Delete all files in the scene folder
    await Promise.all(allKeys.map((key) => deleteFromS3(key)))

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
    const sceneFolder = `${USER_FOLDER}/${id}`

    const historyJson = await loadFromS3(`${sceneFolder}/history.json`)
    if (!historyJson) {
      // No history yet, return empty
      return res.json({ records: [], currentIndex: -1 })
    }

    res.json(JSON.parse(historyJson))
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
    const sceneFolder = `${USER_FOLDER}/${id}`

    await saveToS3(
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
