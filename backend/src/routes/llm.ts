import { Router } from 'express'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateText, generateHtmlWithClaude, ClaudeModel } from '../services/claude.js'
import { generateTextWithGemini, generateHtmlWithGemini, generateImageWithGemini, GeminiModel, ImageGenModel } from '../services/gemini.js'
import { generateWithClaudeCode, interruptQuery } from '../services/claudeCode.js'
import { LLMRequestItem, ResolvedContentItem, resolveImageData, resolvePdfData, resolveTextFileData } from '../services/llmTypes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = Router({ mergeParams: true })

// ── In-memory request buffer for SSE reconnection after HMR ──

interface BufferedEvent {
  event: string
  [key: string]: unknown
}

interface RequestState {
  events: BufferedEvent[]
  result?: { result: string; sessionId: string | null }
  error?: string
  status: 'running' | 'completed' | 'error'
  createdAt: number
}

const activeRequests = new Map<string, RequestState>()

const REQUEST_TTL_MS = 10 * 60 * 1000 // 10 minutes

/** Remove entries older than REQUEST_TTL_MS */
function cleanupOldRequests() {
  const now = Date.now()
  for (const [id, state] of activeRequests) {
    if (now - state.createdAt > REQUEST_TTL_MS) {
      activeRequests.delete(id)
    }
  }
}

/**
 * Extract a user-friendly error message from various error types
 */
function getErrorMessage(error: unknown, provider: 'anthropic' | 'gemini'): string {
  if (error instanceof Error) {
    const message = error.message

    // Check for authentication errors
    if ('status' in error && (error as { status: number }).status === 401) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is missing or invalid. Please check your GSWS_API_KEY_ANTHROPIC in the backend .env file.'
      } else {
        return 'Google API key is missing or invalid. Please check your GSWS_API_KEY_GEMINI in the backend .env file.'
      }
    }

    // Check for rate limiting
    if ('status' in error && (error as { status: number }).status === 429) {
      return `${provider === 'anthropic' ? 'Anthropic' : 'Google'} API rate limit exceeded. Please try again later.`
    }

    // Check for invalid API key in message
    if (message.includes('invalid x-api-key') || message.includes('invalid api key') || message.includes('API_KEY_INVALID')) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is invalid. Please check your GSWS_API_KEY_ANTHROPIC in the backend .env file.'
      } else {
        return 'Google API key is invalid. Please check your GSWS_API_KEY_GEMINI in the backend .env file.'
      }
    }

    // Check for missing API key
    if (message.includes('API key') && (message.includes('missing') || message.includes('not provided') || message.includes('required'))) {
      if (provider === 'anthropic') {
        return 'Anthropic API key is not configured. Please set GSWS_API_KEY_ANTHROPIC in the backend .env file.'
      } else {
        return 'Google API key is not configured. Please set GSWS_API_KEY_GEMINI in the backend .env file.'
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
    } else if (item.type === 'text-file' && item.id && item.sceneId) {
      const textFileData = await resolveTextFileData(workspace, item.sceneId, item.id, item.fileFormat || 'txt')
      if (textFileData) {
        resolved.push({ type: 'text-file', textFileData })
      } else {
        throw new Error(`Could not resolve text file ${item.id} in scene ${item.sceneId}`)
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

// Claude Code endpoints require both server and client to be on localhost
import type { Request, Response, NextFunction } from 'express'
function requireLocalhost(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || ''
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  if (!isLocal) {
    return res.status(403).json({ error: 'Claude Code endpoints are only available from localhost' })
  }
  next()
}

router.post('/generate-claude-code', requireLocalhost, async (req, res) => {
  try {
    const { items, prompt, sessionId, requestId, rootDirectory } = req.body as {
      items: LLMRequestItem[]; prompt: string; sessionId?: string | null; requestId?: string; rootDirectory?: string
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    // Validate rootDirectory
    if (rootDirectory) {
      if (!existsSync(rootDirectory)) {
        return res.status(400).json({ error: `Directory does not exist: ${rootDirectory}` })
      }
      if (!existsSync(join(rootDirectory, '.claude'))) {
        return res.status(400).json({ error: `Claude is not initialized for this directory. Run 'claude' in ${rootDirectory} from the CLI first.` })
      }
    }

    // Lazy cleanup of old requests
    cleanupOldRequests()

    // Initialize request buffer if requestId provided
    let reqState: RequestState | undefined
    if (requestId) {
      reqState = { events: [], status: 'running', createdAt: Date.now() }
      activeRequests.set(requestId, reqState)
    }

    const resolved = await resolveItems((req.params as Record<string, string>).workspace, items)

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    let activityCounter = 0
    let clientDisconnected = false

    res.on('close', () => {
      clientDisconnected = true
    })

    const { result, sessionId: newSessionId } = await generateWithClaudeCode(
      resolved,
      prompt,
      sessionId,
      (event) => {
        activityCounter++
        const eventData = {
          event: 'activity',
          id: `act-${activityCounter}`,
          type: event.type,
          content: event.content,
          timestamp: new Date().toISOString(),
        }

        // Always buffer if requestId was provided
        if (reqState) {
          reqState.events.push(eventData)
        }

        // Write to SSE stream if client is still connected
        if (!clientDisconnected) {
          try {
            res.write(`data: ${JSON.stringify(eventData)}\n\n`)
          } catch {
            clientDisconnected = true
          }
        }
      },
      requestId,
      rootDirectory
    )

    // Store result in buffer
    if (reqState) {
      reqState.result = { result, sessionId: newSessionId }
      reqState.status = 'completed'
    }

    // Send the final result if client is still connected
    if (!clientDisconnected) {
      const resultData = JSON.stringify({ event: 'result', result, sessionId: newSessionId })
      res.write(`data: ${resultData}\n\n`)
      res.end()
    }
  } catch (error) {
    console.error('Error generating with Claude Code:', error)
    const message = error instanceof Error ? error.message : 'Claude Code request failed.'

    // Update buffer state on error
    const requestId = req.body?.requestId
    if (requestId) {
      const reqState = activeRequests.get(requestId)
      if (reqState) {
        reqState.error = message
        reqState.status = 'error'
      }
    }

    // If headers already sent (SSE started), send error as SSE event
    if (res.headersSent) {
      const errorData = JSON.stringify({ event: 'error', error: message })
      try { res.write(`data: ${errorData}\n\n`) } catch { /* client gone */ }
      try { res.end() } catch { /* client gone */ }
    } else {
      res.status(500).json({ error: message })
    }
  }
})

// Poll for buffered request state (used after HMR reconnection)
router.get('/generate-claude-code/poll/:requestId', requireLocalhost, (req, res) => {
  const { requestId } = req.params
  const after = parseInt(req.query.after as string) || 0

  const state = activeRequests.get(requestId)
  if (!state) {
    return res.status(404).json({ error: 'Request not found or expired' })
  }

  const events = state.events.slice(after)

  res.json({
    status: state.status,
    events,
    result: state.result,
    error: state.error,
  })
})

// Interrupt a running Claude Code query
router.post('/generate-claude-code/interrupt/:requestId', requireLocalhost, (req, res) => {
  const { requestId } = req.params
  const interrupted = interruptQuery(requestId)
  res.json({ interrupted })
})

/**
 * Quick text-only query using the fastest available model.
 * Server picks claude-haiku if Anthropic key is configured, otherwise gemini-flash.
 */
router.post('/quick-query', async (req, res) => {
  try {
    const { prompt } = req.body as { prompt: string }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    let result: string
    let model: string
    if (process.env.GSWS_API_KEY_ANTHROPIC) {
      model = 'claude-haiku'
      result = await generateText([], prompt, 'claude-haiku')
    } else if (process.env.GSWS_API_KEY_GEMINI) {
      model = 'gemini-flash'
      result = await generateTextWithGemini([], prompt, 'gemini-flash')
    } else {
      return res.status(500).json({ error: 'No LLM API key configured on server. Set GSWS_API_KEY_ANTHROPIC or GSWS_API_KEY_GEMINI in .env.' })
    }

    console.log(`[${new Date().toISOString().replace('T', ' ')}] [QuickQuery] [${model}] result: ${result}`)
    res.json({ result })
  } catch (error) {
    console.error('Error in quick query:', error)
    const provider = process.env.GSWS_API_KEY_ANTHROPIC ? 'anthropic' : 'gemini'
    res.status(500).json({ error: getErrorMessage(error, provider) })
  }
})

export default router
