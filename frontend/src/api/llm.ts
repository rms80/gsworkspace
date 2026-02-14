import { LLMModel, ImageGenModel } from '../types'
import type { SpatialData } from '../utils/spatialJson'
import { isOfflineMode } from './scenes'
import { getAnthropicApiKey, getGoogleApiKey } from '../utils/apiKeyStorage'
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

export async function generateWithClaudeCode(
  items: ContentItem[],
  prompt: string,
  sessionId?: string | null
): Promise<ClaudeCodeResponse> {
  // Always goes through backend (no offline mode for Claude Code)
  const response = await fetch(`${API_BASE}/generate-claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: toBackendItems(items), prompt, sessionId }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to generate with Claude Code: ${response.statusText}`)
  }

  const data = await response.json() as { result: string; sessionId: string | null }
  return { result: data.result, sessionId: data.sessionId }
}

/**
 * Generate a short PascalCase title (1-3 words) for HTML content using Claude Haiku.
 * This is a fire-and-forget operation - errors are caught and a default is returned.
 */
export async function generateHtmlTitle(htmlContent: string): Promise<string> {
  try {
    // Take first 2000 chars of HTML to keep the request small
    const truncatedHtml = htmlContent.slice(0, 2000)

    const prompt = `Based on this HTML content, generate a very short descriptive title (1-3 words) in PascalCase format with no spaces. Examples: "UserProfile", "LoginForm", "DashboardChart", "ProductCard". Just output the PascalCase title, nothing else.

HTML:
${truncatedHtml}`

    const result = await generateFromPrompt([], prompt, 'claude-haiku')

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
