import { Router } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateText, generateHtmlWithClaude, ClaudeModel } from '../services/claude.js'
import { generateTextWithGemini, generateHtmlWithGemini, generateImageWithGemini, GeminiModel, ImageGenModel } from '../services/gemini.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = Router()

// Load HTML generation system prompt
const htmlGenSystemPrompt = readFileSync(
  join(__dirname, '../../prompts/html-gen-system.txt'),
  'utf-8'
)

type LLMModel = ClaudeModel | GeminiModel

interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
}

function isClaudeModel(model: string): model is ClaudeModel {
  return model.startsWith('claude-')
}

function isGeminiModel(model: string): model is GeminiModel {
  return model.startsWith('gemini-')
}

router.post('/generate', async (req, res) => {
  try {
    const { items, prompt, model } = req.body as { items: ContentItem[]; prompt: string; model?: LLMModel }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || 'claude-sonnet'
    let result: string

    if (isGeminiModel(selectedModel)) {
      result = await generateTextWithGemini(items, prompt, selectedModel)
    } else if (isClaudeModel(selectedModel)) {
      result = await generateText(items, prompt, selectedModel)
    } else {
      return res.status(400).json({ error: `Unknown model: ${selectedModel}` })
    }

    res.json({ result })
  } catch (error) {
    console.error('Error generating text:', error)
    res.status(500).json({ error: 'Failed to generate text' })
  }
})

router.post('/generate-image', async (req, res) => {
  try {
    const { items, prompt, model } = req.body as { items: ContentItem[]; prompt: string; model?: ImageGenModel }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || 'gemini-imagen'
    const images = await generateImageWithGemini(items, prompt, selectedModel)

    // Return array of generated images as data URLs
    const imageDataUrls = images.map((img) => `data:${img.mimeType};base64,${img.data}`)

    res.json({ images: imageDataUrls })
  } catch (error) {
    console.error('Error generating image:', error)
    res.status(500).json({ error: 'Failed to generate image' })
  }
})

interface SpatialBlock {
  type: 'text' | 'image'
  content?: string
  src?: string
  position: { x: number; y: number }
  size: { width: number; height: number; scaleX?: number; scaleY?: number }
}

router.post('/generate-html', async (req, res) => {
  try {
    const { spatialItems, userPrompt, model } = req.body as {
      spatialItems: SpatialBlock[]
      userPrompt: string
      model?: LLMModel
    }

    if (!userPrompt) {
      return res.status(400).json({ error: 'User prompt is required' })
    }

    const selectedModel = model || 'claude-sonnet'

    // Build the combined prompt with system instructions and spatial data
    const spatialDataJson = JSON.stringify(spatialItems, null, 2)
    const combinedUserPrompt = `## Content Blocks (as spatial JSON):\n\`\`\`json\n${spatialDataJson}\n\`\`\`\n\n## User Request:\n${userPrompt}`

    let html: string

    if (isGeminiModel(selectedModel)) {
      html = await generateHtmlWithGemini(htmlGenSystemPrompt, combinedUserPrompt, selectedModel)
    } else if (isClaudeModel(selectedModel)) {
      html = await generateHtmlWithClaude(htmlGenSystemPrompt, combinedUserPrompt, selectedModel)
    } else {
      return res.status(400).json({ error: `Unknown model: ${selectedModel}` })
    }

    res.json({ html })
  } catch (error) {
    console.error('Error generating HTML:', error)
    res.status(500).json({ error: 'Failed to generate HTML' })
  }
})

export default router
