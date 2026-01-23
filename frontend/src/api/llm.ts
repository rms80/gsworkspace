import { LLMModel, ImageGenModel } from '../types'
import type { SpatialBlock } from '../utils/spatialJson'

const API_BASE = '/api/llm'

export interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
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
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, prompt, model }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate: ${response.statusText}`)
  }

  const data: GenerateResponse = await response.json()
  return data.result
}

export async function generateImage(
  items: ContentItem[],
  prompt: string,
  model: ImageGenModel = 'gemini-imagen'
): Promise<string[]> {
  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, prompt, model }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate image: ${response.statusText}`)
  }

  const data: GenerateImageResponse = await response.json()
  return data.images
}

export interface GenerateHtmlResponse {
  html: string
}

export async function generateHtml(
  spatialItems: SpatialBlock[],
  userPrompt: string,
  model: LLMModel = 'claude-sonnet'
): Promise<string> {
  const response = await fetch(`${API_BASE}/generate-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spatialItems, userPrompt, model }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate HTML: ${response.statusText}`)
  }

  const data: GenerateHtmlResponse = await response.json()
  return data.html
}
