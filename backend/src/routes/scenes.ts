import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3, getPublicUrl, deleteFromS3 } from '../services/s3.js'

const router = Router()

// User folder - hardcoded for now, will be per-user later
const USER_FOLDER = 'version0'

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

type StoredItem = StoredTextItem | StoredImageItem | StoredPromptItem | StoredImageGenPromptItem | StoredHtmlItem | StoredHtmlGenPromptItem

interface StoredScene {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  items: StoredItem[]
}

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
        const imageFile = `${item.id}.png`
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
          scaleX: item.scaleX,
          scaleY: item.scaleY,
          rotation: item.rotation,
          cropRect: item.cropRect,
          cropSrc: item.cropSrc,
        })
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
