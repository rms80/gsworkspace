import { Router } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateText, generateHtmlWithClaude, ClaudeModel } from '../services/claude.js'
import { generateTextWithGemini, generateHtmlWithGemini, generateImageWithGemini, GeminiModel, ImageGenModel } from '../services/gemini.js'
import { LLMRequestItem, ResolvedContentItem, resolveImageData, resolvePdfData } from '../services/llmTypes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = Router({ mergeParams: true })

/**
 * Extract a user-friendly error message from various error types
 */
function getErrorMessage(error: unknown, provider: 'anthropic' | 'gemini'): string {
  if (error instanceof Error) {
    const message = error.message

    // Check for authentication errors
    if ('status' in error && (error as { status: number }).status === 401) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is missing or invalid. Please check your ANTHROPIC_API_KEY in the backend .env file.'
      } else {
        return 'Google API key is missing or invalid. Please check your GEMINI_API_KEY in the backend .env file.'
      }
    }

    // Check for rate limiting
    if ('status' in error && (error as { status: number }).status === 429) {
      return `${provider === 'anthropic' ? 'Anthropic' : 'Google'} API rate limit exceeded. Please try again later.`
    }

    // Check for invalid API key in message
    if (message.includes('invalid x-api-key') || message.includes('invalid api key') || message.includes('API_KEY_INVALID')) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is invalid. Please check your ANTHROPIC_API_KEY in the backend .env file.'
      } else {
        return 'Google API key is invalid. Please check your GEMINI_API_KEY in the backend .env file.'
      }
    }

    // Check for missing API key
    if (message.includes('API key') && (message.includes('missing') || message.includes('not provided') || message.includes('required'))) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY in the backend .env file.'
      } else {
        return 'Google API key is not configured. Please set GEMINI_API_KEY in the backend .env file.'
      }
    }

    // Return the original message if it's descriptive enough
    if (message.length > 10 && message.length < 200) {
      return message
    }
  }

  // Generic fallback
  return `${provider === 'anthropic' ? 'Anthropic' : 'Google'} API request failed. Check the server logs for details.`
}

const htmlGenSystemPromptPath = join(__dirname, '../../prompts/html-gen-system.txt')

function loadHtmlGenSystemPrompt(): string {
  return readFileSync(htmlGenSystemPromptPath, 'utf-8')
}

type LLMModel = ClaudeModel | GeminiModel

/**
 * Resolve LLMRequestItems into ResolvedContentItems by loading image data from storage.
 */
async function resolveItems(workspace: string, items: LLMRequestItem[]): Promise<ResolvedContentItem[]> {
  const resolved: ResolvedContentItem[] = []
  for (const item of items) {
    if (item.type === 'text') {
      resolved.push({ type: 'text', text: item.text })
    } else if (item.type === 'image' && item.id && item.sceneId) {
      const imageData = await resolveImageData(workspace, item.sceneId, item.id, !!item.useEdited)
      if (imageData) {
        resolved.push({ type: 'image', imageData })
      } else {
        throw new Error(`Could not resolve image ${item.id} in scene ${item.sceneId}`)
      }
    } else if (item.type === 'pdf' && item.id && item.sceneId) {
      const pdfData = await resolvePdfData(workspace, item.sceneId, item.id)
      if (pdfData) {
        resolved.push({ type: 'pdf', pdfData })
      } else {
        throw new Error(`Could not resolve PDF ${item.id} in scene ${item.sceneId}`)
      }
    }
  }
  return resolved
}

function isClaudeModel(model: string): model is ClaudeModel {
  return model.startsWith('claude-')
}

function isGeminiModel(model: string): model is GeminiModel {
  return model.startsWith('gemini-')
}

router.post('/generate', async (req, res) => {
  try {
    const { items, prompt, model } = req.body as { items: LLMRequestItem[]; prompt: string; model?: LLMModel }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || 'claude-sonnet'
    const resolved = await resolveItems((req.params as Record<string, string>).workspace, items)
    let result: string

    if (isGeminiModel(selectedModel)) {
      result = await generateTextWithGemini(resolved, prompt, selectedModel)
    } else if (isClaudeModel(selectedModel)) {
      result = await generateText(resolved, prompt, selectedModel)
    } else {
      return res.status(400).json({ error: `Unknown model: ${selectedModel}` })
    }

    res.json({ result })
  } catch (error) {
    console.error('Error generating text:', error)
    const provider = isGeminiModel(req.body.model || 'claude-sonnet') ? 'gemini' : 'anthropic'
    res.status(500).json({ error: getErrorMessage(error, provider) })
  }
})

router.post('/generate-image', async (req, res) => {
  try {
    const { items, prompt, model } = req.body as { items: LLMRequestItem[]; prompt: string; model?: ImageGenModel }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || 'gemini-imagen'
    const resolved = await resolveItems((req.params as Record<string, string>).workspace, items)
    const images = await generateImageWithGemini(resolved, prompt, selectedModel)

    // Return array of generated images as data URLs
    const imageDataUrls = images.map((img) => `data:${img.mimeType};base64,${img.data}`)

    res.json({ images: imageDataUrls })
  } catch (error) {
    console.error('Error generating image:', error)
    res.status(500).json({ error: getErrorMessage(error, 'gemini') })
  }
})

interface SpatialBounds {
  x: number; y: number; width: number; height: number
}

interface SpatialBlock {
  type: 'text' | 'image'
  content?: string
  imageId?: string
  bounds: SpatialBounds
}

interface SpatialData {
  page: { bounds: SpatialBounds }
  items: SpatialBlock[]
}

router.post('/generate-html', async (req, res) => {
  try {
    const { spatialData, userPrompt, model } = req.body as {
      spatialData: SpatialData
      userPrompt: string
      model?: LLMModel
    }

    if (!userPrompt) {
      return res.status(400).json({ error: 'User prompt is required' })
    }

    const selectedModel = model || 'claude-sonnet'

    // Build the combined prompt with system instructions and spatial data
    const spatialDataJson = JSON.stringify(spatialData, null, 2)
    const combinedUserPrompt = `## Content Blocks (as spatial JSON):\n\`\`\`json\n${spatialDataJson}\n\`\`\`\n\n## User Request:\n${userPrompt}`

    let html: string

    if (isGeminiModel(selectedModel)) {
      html = await generateHtmlWithGemini(loadHtmlGenSystemPrompt(), combinedUserPrompt, selectedModel)
    } else if (isClaudeModel(selectedModel)) {
      html = await generateHtmlWithClaude(loadHtmlGenSystemPrompt(), combinedUserPrompt, selectedModel)
    } else {
      return res.status(400).json({ error: `Unknown model: ${selectedModel}` })
    }

    res.json({ html })
  } catch (error) {
    console.error('Error generating HTML:', error)
    const provider = isGeminiModel(req.body.model || 'claude-sonnet') ? 'gemini' : 'anthropic'
    res.status(500).json({ error: getErrorMessage(error, provider) })
  }
})

export default router
