import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3, getPublicUrl, deleteFromS3 } from '../services/s3.js'

const router = Router()

// User folder - hardcoded for now, will be per-user later
const USER_FOLDER = 'version0'

// Check if a path is relative (already saved asset) vs absolute URL or data URL
function isRelativePath(src: string): boolean {
  return !(
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  )
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
  file: string // reference to .txt file
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
}

interface StoredPromptItem extends StoredItemBase {
  type: 'prompt'
  fontSize: number
  file: string // reference to .json file containing label and text
}

interface StoredImageGenPromptItem extends StoredItemBase {
  type: 'image-gen-prompt'
  fontSize: number
  file: string // reference to .json file containing label, text, and model
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
  file: string // reference to .json file containing label, text, and model
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

    // Process each item
    for (const item of items) {
      if (item.type === 'text') {
        const textFile = `${item.id}.txt`
        await saveToS3(`${sceneFolder}/${textFile}`, item.text, 'text/plain')
        storedItems.push({
          id: item.id,
          type: 'text',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          file: textFile,
        })
      } else if (item.type === 'image') {
        let imageFile = `${item.id}.png`
        let imageSaved = false

        // If src is a relative path, asset is already saved - use it directly
        if (isRelativePath(item.src)) {
          imageFile = item.src
          imageSaved = true
        } else if (item.src.startsWith('data:')) {
          // If src is a data URL, extract and save the image
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
          // If src is an external URL, fetch and save the image to the scene folder
          try {
            const response = await fetch(item.src)
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer()
              const contentType = response.headers.get('content-type') || 'image/png'
              await saveToS3(
                `${sceneFolder}/${imageFile}`,
                Buffer.from(arrayBuffer),
                contentType
              )
              imageSaved = true
            }
          } catch (err) {
            console.error(`Failed to fetch image from ${item.src}:`, err)
          }
        }

        // Handle cropSrc if present - save as separate file
        let cropFile: string | undefined = undefined
        if (item.cropSrc) {
          if (isRelativePath(item.cropSrc)) {
            // Already saved
            cropFile = item.cropSrc
          } else if (item.cropSrc.startsWith('data:')) {
            // Save data URL to S3
            const cropMatches = item.cropSrc.match(/^data:([^;]+);base64,(.+)$/)
            if (cropMatches) {
              cropFile = `${item.id}.crop.png`
              const contentType = cropMatches[1]
              const base64Data = cropMatches[2]
              await saveToS3(
                `${sceneFolder}/${cropFile}`,
                Buffer.from(base64Data, 'base64'),
                contentType
              )
            }
          } else if (item.cropSrc.startsWith('http')) {
            // Fetch and save external URL
            try {
              const response = await fetch(item.cropSrc)
              if (response.ok) {
                cropFile = `${item.id}.crop.png`
                const arrayBuffer = await response.arrayBuffer()
                const contentType = response.headers.get('content-type') || 'image/png'
                await saveToS3(
                  `${sceneFolder}/${cropFile}`,
                  Buffer.from(arrayBuffer),
                  contentType
                )
              }
            } catch (err) {
              console.error(`Failed to fetch cropSrc from ${item.cropSrc}:`, err)
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
        let videoFile = `${item.id}.${ext}`
        let videoSaved = false

        // If src is a relative path, asset is already saved - use it directly
        if (isRelativePath(item.src)) {
          videoFile = item.src
          videoSaved = true
        } else if (item.src.startsWith('data:')) {
          // If src is a data URL, extract and save the video
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
          // If src is an external URL, fetch and save the video to the scene folder
          try {
            const response = await fetch(item.src)
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer()
              const contentType = response.headers.get('content-type') || 'video/mp4'
              await saveToS3(
                `${sceneFolder}/${videoFile}`,
                Buffer.from(arrayBuffer),
                contentType
              )
              videoSaved = true
            }
          } catch (err) {
            console.error(`Failed to fetch video from ${item.src}:`, err)
          }
        }

        // Only add to stored items if the video was successfully saved
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
          })
        } else {
          console.error(`Failed to save video ${item.id}, skipping from scene`)
        }
      } else if (item.type === 'prompt') {
        const promptFile = `${item.id}.prompt.json`
        const promptData = JSON.stringify({ label: item.label, text: item.text, model: item.model || 'claude-sonnet' })
        await saveToS3(`${sceneFolder}/${promptFile}`, promptData, 'application/json')
        storedItems.push({
          id: item.id,
          type: 'prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          file: promptFile,
        })
      } else if (item.type === 'image-gen-prompt') {
        const promptFile = `${item.id}.imagegen.json`
        const promptData = JSON.stringify({ label: item.label, text: item.text, model: item.model || 'gemini-imagen' })
        await saveToS3(`${sceneFolder}/${promptFile}`, promptData, 'application/json')
        storedItems.push({
          id: item.id,
          type: 'image-gen-prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          file: promptFile,
        })
      } else if (item.type === 'html-gen-prompt') {
        const promptFile = `${item.id}.htmlgen.json`
        const promptData = JSON.stringify({ label: item.label, text: item.text, model: item.model || 'claude-sonnet' })
        await saveToS3(`${sceneFolder}/${promptFile}`, promptData, 'application/json')
        storedItems.push({
          id: item.id,
          type: 'html-gen-prompt',
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          file: promptFile,
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

    res.json({ success: true, id })
  } catch (error) {
    console.error('Error saving scene:', error)
    res.status(500).json({ error: 'Failed to save scene' })
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
          const text = await loadFromS3(`${sceneFolder}/${item.file}`)
          return {
            id: item.id,
            type: 'text' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            text: text || '',
          }
        } else if (item.type === 'image') {
          // For images, return relative path (filename only)
          return {
            id: item.id,
            type: 'image' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: item.file,
            scaleX: item.scaleX,
            scaleY: item.scaleY,
            rotation: item.rotation,
            cropRect: item.cropRect,
            cropSrc: item.cropSrc,
          }
        } else if (item.type === 'video') {
          // For videos, return relative path (filename only)
          return {
            id: item.id,
            type: 'video' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            src: item.file,
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
          }
        } else if (item.type === 'prompt') {
          // For prompts, load the JSON file
          const promptJson = await loadFromS3(`${sceneFolder}/${item.file}`)
          const promptData = promptJson ? JSON.parse(promptJson) : { label: 'Prompt', text: '', model: 'claude-sonnet' }
          return {
            id: item.id,
            type: 'prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: promptData.label,
            text: promptData.text,
            model: promptData.model || 'claude-sonnet',
          }
        } else if (item.type === 'image-gen-prompt') {
          // For image-gen-prompts, load the JSON file
          const promptJson = await loadFromS3(`${sceneFolder}/${item.file}`)
          const promptData = promptJson ? JSON.parse(promptJson) : { label: 'Image Gen', text: '', model: 'gemini-imagen' }
          return {
            id: item.id,
            type: 'image-gen-prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: promptData.label,
            text: promptData.text,
            model: promptData.model || 'gemini-imagen',
          }
        } else if (item.type === 'html-gen-prompt') {
          // For html-gen-prompts, load the JSON file
          const promptJson = await loadFromS3(`${sceneFolder}/${item.file}`)
          const promptData = promptJson ? JSON.parse(promptJson) : { label: 'HTML Gen', text: '', model: 'claude-sonnet' }
          return {
            id: item.id,
            type: 'html-gen-prompt' as const,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            label: promptData.label,
            text: promptData.text,
            model: promptData.model || 'claude-sonnet',
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

    // Construct asset base URL for this scene's folder
    const assetBaseUrl = getPublicUrl(`${sceneFolder}/`)

    res.json({
      id: storedScene.id,
      name: storedScene.name,
      createdAt: storedScene.createdAt,
      modifiedAt: storedScene.modifiedAt,
      assetBaseUrl,
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
