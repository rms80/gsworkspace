import { LLMModel, ImageGenModel } from '../types'

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
