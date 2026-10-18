import { Router, Response } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getLlmCapabilities, resolveImageProvider, resolveTextProvider } from '../services/llmRegistry.js'
import { LLMRequestItem, resolveItems } from '../services/llmTypes.js'
import { ImageProvider, TextProvider, itemsToParts } from '../services/llmProvider.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = Router({ mergeParams: true })

const htmlGenSystemPromptPath = join(__dirname, '../../prompts/html-gen-system.txt')

function loadHtmlGenSystemPrompt(): string {
  return readFileSync(htmlGenSystemPromptPath, 'utf-8')
}

/** A signal that aborts if the client disconnects before the response is sent */
function abortOnDisconnect(res: Response): AbortSignal {
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  return controller.signal
}

/** Sends a provider error to the client, unless the client is gone */
function sendError(res: Response, label: string, error: unknown, provider: TextProvider | ImageProvider | null, signal: AbortSignal) {
  if (signal.aborted) {
    console.log(`${label} aborted: client disconnected`)
    return
  }
  console.error(`Error ${label}:`, error)
  if (res.writableEnded || res.destroyed) return
  const message = provider ? provider.errorMessage(error) : 'LLM request failed. Check the server logs for details.'
  res.status(500).json({ error: message })
}

router.post('/generate', async (req, res) => {
  const signal = abortOnDisconnect(res)
  let provider: TextProvider | null = null
  try {
    const { items, prompt, model } = req.body as { items: LLMRequestItem[]; prompt: string; model?: string }
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || (await getLlmCapabilities()).defaultTextModel || 'claude-sonnet'
    const resolvedProvider = await resolveTextProvider(selectedModel)
    if ('error' in resolvedProvider) {
      return res.status(resolvedProvider.status).json({ error: resolvedProvider.error })
    }
    provider = resolvedProvider.provider

    const resolved = await resolveItems((req.params as Record<string, string>).workspace, items)
    const result = await provider.generate({
      model: selectedModel,
      parts: [...itemsToParts(resolved), { type: 'text', text: `\n\nUser request: ${prompt}` }],
      maxTokens: 4096,
      signal,
      operation: 'generateText',
    })

    res.json({ result })
  } catch (error) {
    sendError(res, 'generating text', error, provider, signal)
  }
})

router.post('/generate-image', async (req, res) => {
  const signal = abortOnDisconnect(res)
  let provider: ImageProvider | null = null
  try {
    const { items, prompt, model } = req.body as { items: LLMRequestItem[]; prompt: string; model?: string }
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || (await getLlmCapabilities()).defaultImageModel || 'gemini-imagen'
    const resolvedProvider = await resolveImageProvider(selectedModel)
    if ('error' in resolvedProvider) {
      return res.status(resolvedProvider.status).json({ error: resolvedProvider.error })
    }
    provider = resolvedProvider.provider

    const resolved = await resolveItems((req.params as Record<string, string>).workspace, items)
    const images = await provider.generate({
      model: selectedModel,
      parts: [...itemsToParts(resolved), { type: 'text', text: `\n\nUser request: ${prompt}` }],
      signal,
      operation: 'generateImage',
    })

    // Return array of generated images as data URLs
    const imageDataUrls = images.map((img) => `data:${img.mimeType};base64,${img.data}`)

    res.json({ images: imageDataUrls })
  } catch (error) {
    sendError(res, 'generating image', error, provider, signal)
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
  const signal = abortOnDisconnect(res)
  let provider: TextProvider | null = null
  try {
    const { spatialData, userPrompt, model } = req.body as {
      spatialData: SpatialData
      userPrompt: string
      model?: string
    }
    if (!userPrompt) {
      return res.status(400).json({ error: 'User prompt is required' })
    }

    const selectedModel = model || (await getLlmCapabilities()).defaultTextModel || 'claude-sonnet'
    const resolvedProvider = await resolveTextProvider(selectedModel)
    if ('error' in resolvedProvider) {
      return res.status(resolvedProvider.status).json({ error: resolvedProvider.error })
    }
    provider = resolvedProvider.provider

    // Build the combined prompt with system instructions and spatial data
    const spatialDataJson = JSON.stringify(spatialData, null, 2)
    const combinedUserPrompt = `## Content Blocks (as spatial JSON):\n\`\`\`json\n${spatialDataJson}\n\`\`\`\n\n## User Request:\n${userPrompt}`

    const html = await provider.generate({
      model: selectedModel,
      system: loadHtmlGenSystemPrompt(),
      parts: [{ type: 'text', text: combinedUserPrompt }],
      maxTokens: 8192,
      signal,
      operation: 'generateHtml',
    })

    res.json({ html })
  } catch (error) {
    sendError(res, 'generating HTML', error, provider, signal)
  }
})

/**
 * Quick text-only query using the fastest available model: the preferred CLI's fast model, else
 * the other CLI's, else an API's.
 */
router.post('/quick-query', async (req, res) => {
  const signal = abortOnDisconnect(res)
  let provider: TextProvider | null = null
  try {
    const { prompt } = req.body as { prompt: string }
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const model = (await getLlmCapabilities()).quickModel
    if (!model) {
      return res.status(503).json({ error: 'No LLM available on the server. Install and log in to Claude Code or Codex, or set GSWS_API_KEY_ANTHROPIC or GSWS_API_KEY_GEMINI in .env.' })
    }
    const resolvedProvider = await resolveTextProvider(model)
    if ('error' in resolvedProvider) {
      return res.status(resolvedProvider.status).json({ error: resolvedProvider.error })
    }
    provider = resolvedProvider.provider

    const result = await provider.generate({
      model,
      parts: [{ type: 'text', text: `\n\nUser request: ${prompt}` }],
      maxTokens: 4096,
      signal,
      operation: 'quickQuery',
    })

    console.log(`[${new Date().toISOString().replace('T', ' ')}] [QuickQuery] [${model}] result: ${result}`)
    res.json({ result })
  } catch (error) {
    sendError(res, 'in quick query', error, provider, signal)
  }
})

export default router
