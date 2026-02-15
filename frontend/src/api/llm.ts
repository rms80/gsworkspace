import { LLMModel, ImageGenModel } from '../types'
import type { SpatialData } from '../utils/spatialJson'
import { isOfflineMode } from './scenes'
import { getAnthropicApiKey, getGoogleApiKey, hasAnthropicApiKey, hasGoogleApiKey } from '../utils/apiKeyStorage'
import { generateTextWithAnthropic, generateHtmlWithAnthropic } from './anthropicClient'
import { generateTextWithGemini, generateHtmlWithGemini, generateImageWithGemini } from './googleClient'

import { ACTIVE_WORKSPACE } from './workspace'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/llm`

function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-')
}

function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-')
}

/** Used by offline-mode clients (anthropicClient, googleClient) which handle data URLs directly */
export interface ContentItem {
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  src?: string
  // Online-mode fields: image/pdf/text-file items send IDs so the backend resolves them from storage
  id?: string
  sceneId?: string
  useEdited?: boolean
  fileFormat?: string
}

/** Shape sent to backend in online mode (only id/sceneId/useEdited, no src) */
interface BackendItem {
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  id?: string
  sceneId?: string
  useEdited?: boolean
  fileFormat?: string
}

/** Strip src from items before sending to backend (prevents sending URLs/data to backend) */
function toBackendItems(items: ContentItem[]): BackendItem[] {
  return items.map((item) => {
    if (item.type === 'image') {
      return { type: item.type, id: item.id, sceneId: item.sceneId, useEdited: item.useEdited }
    }
    if (item.type === 'pdf') {
      return { type: item.type, id: item.id, sceneId: item.sceneId }
    }
    if (item.type === 'text-file') {
      return { type: item.type, id: item.id, sceneId: item.sceneId, fileFormat: item.fileFormat }
    }
    return { type: item.type, text: item.text }
  })
}

export interface GenerateResponse {
  result: string
}

export interface GenerateImageResponse {
  images: string[] // data URLs
}

export async function generateFromPrompt(
  items: ContentItem[],
  prompt: string,
  model: LLMModel = 'claude-sonnet'
): Promise<string> {
  // Check if we're in offline mode
  if (isOfflineMode()) {
    // Route to appropriate client-side API based on model
    if (isClaudeModel(model)) {
      if (!getAnthropicApiKey()) {
        throw new Error('Anthropic API key not configured. Please add your API key in Edit > Settings.')
      }
      return generateTextWithAnthropic(items, prompt, model as 'claude-haiku' | 'claude-sonnet' | 'claude-opus')
    } else if (isGeminiModel(model)) {
      if (!getGoogleApiKey()) {
        throw new Error('Google API key not configured. Please add your API key in Edit > Settings.')
      }
      return generateTextWithGemini(items, prompt, model as 'gemini-flash' | 'gemini-pro')
    } else {
      throw new Error(`Unknown model: ${model}`)
    }
  }

  // Online mode: use backend (send IDs, not URLs)
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: toBackendItems(items), prompt, model }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to generate: ${response.statusText}`)
  }

  const data: GenerateResponse = await response.json()
  return data.result
}

export async function generateImage(
  items: ContentItem[],
  prompt: string,
  model: ImageGenModel = 'gemini-imagen'
): Promise<string[]> {
  // Check if we're in offline mode
  if (isOfflineMode()) {
    if (!getGoogleApiKey()) {
      throw new Error('Google API key not configured. Please add your API key in Edit > Settings.')
    }
    const images = await generateImageWithGemini(items, prompt, model)
    // Convert to data URLs
    return images.map((img) => `data:${img.mimeType};base64,${img.data}`)
  }

  // Online mode: use backend (send IDs, not URLs)
  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: toBackendItems(items), prompt, model }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to generate image: ${response.statusText}`)
  }

  const data: GenerateImageResponse = await response.json()
  return data.images
}

export interface GenerateHtmlResponse {
  html: string
}

export async function generateHtml(
  spatialData: SpatialData,
  userPrompt: string,
  model: LLMModel = 'claude-sonnet'
): Promise<string> {
  // Check if we're in offline mode
  if (isOfflineMode()) {
    // Route to appropriate client-side API based on model
    if (isClaudeModel(model)) {
      if (!getAnthropicApiKey()) {
        throw new Error('Anthropic API key not configured. Please add your API key in Edit > Settings.')
      }
      return generateHtmlWithAnthropic(spatialData, userPrompt, model as 'claude-haiku' | 'claude-sonnet' | 'claude-opus')
    } else if (isGeminiModel(model)) {
      if (!getGoogleApiKey()) {
        throw new Error('Google API key not configured. Please add your API key in Edit > Settings.')
      }
      return generateHtmlWithGemini(spatialData, userPrompt, model as 'gemini-flash' | 'gemini-pro')
    } else {
      throw new Error(`Unknown model: ${model}`)
    }
  }

  // Online mode: use backend
  const response = await fetch(`${API_BASE}/generate-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spatialData, userPrompt, model }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to generate HTML: ${response.statusText}`)
  }

  const data: GenerateHtmlResponse = await response.json()
  return data.html
}

export interface ClaudeCodeResponse {
  result: string
  sessionId: string | null
}

export interface ClaudeCodeActivityEvent {
  id: string
  type: 'tool_use' | 'assistant_text' | 'status' | 'error'
  content: string
  timestamp: string
}

export async function generateWithClaudeCode(
  items: ContentItem[],
  prompt: string,
  sessionId?: string | null,
  onActivity?: (event: ClaudeCodeActivityEvent) => void,
  requestId?: string
): Promise<ClaudeCodeResponse> {
  // Always goes through backend (no offline mode for Claude Code)
  const response = await fetch(`${API_BASE}/generate-claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: toBackendItems(items), prompt, sessionId, requestId }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to generate with Claude Code: ${response.statusText}`)
  }

  const contentType = response.headers.get('Content-Type') || ''

  // Backward compat: if not SSE, parse as JSON
  if (!contentType.includes('text/event-stream')) {
    const data = await response.json() as { result: string; sessionId: string | null }
    return { result: data.result, sessionId: data.sessionId }
  }

  // Parse SSE stream
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: ClaudeCodeResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE messages (terminated by double newline)
    const parts = buffer.split('\n\n')
    buffer = parts.pop()! // keep incomplete part

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      // Extract data from "data: {...}" lines
      for (const line of trimmed.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.event === 'activity') {
              onActivity?.({
                id: parsed.id,
                type: parsed.type,
                content: parsed.content,
                timestamp: parsed.timestamp,
              })
            } else if (parsed.event === 'result') {
              finalResult = { result: parsed.result, sessionId: parsed.sessionId }
            } else if (parsed.event === 'error') {
              throw new Error(parsed.error)
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e
            }
          }
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream ended without a result')
  }

  return finalResult
}

/**
 * Pick the fastest available model for offline mode: claude-haiku if Anthropic
 * key is available, otherwise gemini-flash.
 */
function getFastModel(): LLMModel {
  if (hasAnthropicApiKey()) return 'claude-haiku'
  if (hasGoogleApiKey()) return 'gemini-flash'
  return 'claude-haiku' // will fail with a clear error from generateFromPrompt
}

/**
 * Quick text-only LLM query using the fastest available model.
 * Use for lightweight tasks like generating labels, filenames, summaries, etc.
 * In online mode, the server picks the model. In offline mode, the client picks.
 */
export async function quickLlmQuery(prompt: string): Promise<string> {
  if (isOfflineMode()) {
    return generateFromPrompt([], prompt, getFastModel())
  }

  const response = await fetch(`${API_BASE}/quick-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Quick query failed: ${response.statusText}`)
  }

  const data: GenerateResponse = await response.json()
  return data.result
}

/**
 * Interrupt a running Claude Code query by its requestId.
 */
export async function interruptClaudeCodeRequest(requestId: string): Promise<boolean> {
  const response = await fetch(
    `${API_BASE}/generate-claude-code/interrupt/${encodeURIComponent(requestId)}`,
    { method: 'POST' }
  )
  if (!response.ok) return false
  const data = await response.json() as { interrupted: boolean }
  return data.interrupted
}

export interface ClaudeCodePollResponse {
  status: 'running' | 'completed' | 'error'
  events: ClaudeCodeActivityEvent[]
  result?: { result: string; sessionId: string | null }
  error?: string
}

/**
 * Poll for buffered request state after SSE reconnection (e.g., after HMR).
 * Returns events starting from index `after` (0-based).
 * Returns null if request not found (404).
 */
export async function pollClaudeCodeRequest(
  requestId: string,
  after: number = 0
): Promise<ClaudeCodePollResponse | null> {
  const response = await fetch(
    `${API_BASE}/generate-claude-code/poll/${encodeURIComponent(requestId)}?after=${after}`
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Poll failed: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Generate a short PascalCase title (1-3 words) for HTML content.
 * This is a fire-and-forget operation - errors are caught and a default is returned.
 */
export async function generateHtmlTitle(htmlContent: string): Promise<string> {
  try {
    // Take first 2000 chars of HTML to keep the request small
    const truncatedHtml = htmlContent.slice(0, 2000)

    const prompt = `Based on this HTML content, generate a very short descriptive title (1-3 words) in PascalCase format with no spaces. Examples: "UserProfile", "LoginForm", "DashboardChart", "ProductCard". Just output the PascalCase title, nothing else.

HTML:
${truncatedHtml}`

    const result = await quickLlmQuery(prompt)

    // Clean up the result - remove any whitespace, quotes, or extra text
    const cleaned = result.trim().replace(/[^a-zA-Z0-9]/g, '')

    // Ensure it starts with uppercase
    if (cleaned.length > 0) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }

    return 'HtmlContent'
  } catch (error) {
    console.warn('Failed to generate HTML title:', error)
    return 'HtmlContent'
  }
}
