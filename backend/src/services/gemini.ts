import { GoogleGenerativeAI } from '@google/generative-ai'
import { ResolvedContentItem } from './llmTypes.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export type GeminiModel = 'gemini-flash' | 'gemini-pro'
export type ImageGenModel = 'gemini-imagen' | 'gemini-flash-imagen'

const MODEL_IDS: Record<GeminiModel, string> = {
  'gemini-flash': 'gemini-3-flash-preview',
  'gemini-pro': 'gemini-3-pro-preview',
}

const IMAGE_GEN_MODEL_IDS: Record<ImageGenModel, string> = {
  'gemini-imagen': 'gemini-2.0-flash-exp-image-generation',
  'gemini-flash-imagen': 'gemini-2.0-flash-exp-image-generation',
}

export async function generateHtmlWithGemini(
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel = 'gemini-flash'
): Promise<string> {
  const genModel = genAI.getGenerativeModel({
    model: MODEL_IDS[model],
    systemInstruction: systemPrompt,
  })

  const result = await genModel.generateContent(userPrompt)
  const response = await result.response
  return response.text()
}

export async function generateTextWithGemini(
  items: ResolvedContentItem[],
  prompt: string,
  model: GeminiModel = 'gemini-flash'
): Promise<string> {
  const genModel = genAI.getGenerativeModel({ model: MODEL_IDS[model] })

  // Build content parts from canvas items
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push({ text: `[Text block]: ${item.text}` })
    } else if (item.type === 'image' && item.imageData) {
      parts.push({
        inlineData: {
          mimeType: item.imageData.mimeType,
          data: item.imageData.base64,
        },
      })
    } else if (item.type === 'pdf' && item.pdfData) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: item.pdfData.base64,
        },
      })
    }
  }

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  const result = await genModel.generateContent(parts)
  const response = await result.response
  return response.text()
}

export interface GeneratedImage {
  mimeType: string
  data: string // base64
}

export async function generateImageWithGemini(
  items: ResolvedContentItem[],
  prompt: string,
  model: ImageGenModel = 'gemini-imagen'
): Promise<GeneratedImage[]> {
  const genModel = genAI.getGenerativeModel({
    model: IMAGE_GEN_MODEL_IDS[model],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    } as Record<string, unknown>,
  })

  // Build content parts from canvas items
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push({ text: `[Text block]: ${item.text}` })
    } else if (item.type === 'image' && item.imageData) {
      parts.push({
        inlineData: {
          mimeType: item.imageData.mimeType,
          data: item.imageData.base64,
        },
      })
    } else if (item.type === 'pdf' && item.pdfData) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: item.pdfData.base64,
        },
      })
    }
  }

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  const result = await genModel.generateContent(parts)
  const response = await result.response

  // Extract images from response
  const images: GeneratedImage[] = []
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if ('inlineData' in part && part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data || '',
        })
      }
    }
  }

  return images
}
