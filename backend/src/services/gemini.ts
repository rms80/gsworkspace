import { GoogleGenerativeAI } from '@google/generative-ai'

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

interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
}

export async function generateTextWithGemini(
  items: ContentItem[],
  prompt: string,
  model: GeminiModel = 'gemini-flash'
): Promise<string> {
  const genModel = genAI.getGenerativeModel({ model: MODEL_IDS[model] })

  // Build content parts from canvas items
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push({ text: `[Text block]: ${item.text}` })
    } else if (item.type === 'image' && item.src) {
      // If it's a data URL, extract the base64 part
      if (item.src.startsWith('data:')) {
        const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          const mimeType = matches[1]
          const base64Data = matches[2]
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          })
        }
      } else {
        // It's a URL - fetch the image and convert to base64
        try {
          const response = await fetch(item.src)
          const arrayBuffer = await response.arrayBuffer()
          const base64Data = Buffer.from(arrayBuffer).toString('base64')
          const contentType = response.headers.get('content-type') || 'image/png'
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: base64Data,
            },
          })
        } catch (err) {
          console.error('Failed to fetch image for Gemini:', err)
        }
      }
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
  items: ContentItem[],
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
    } else if (item.type === 'image' && item.src) {
      // If it's a data URL, extract the base64 part
      if (item.src.startsWith('data:')) {
        const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          const mimeType = matches[1]
          const base64Data = matches[2]
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          })
        }
      } else {
        // It's a URL - fetch the image and convert to base64
        try {
          const response = await fetch(item.src)
          const arrayBuffer = await response.arrayBuffer()
          const base64Data = Buffer.from(arrayBuffer).toString('base64')
          const contentType = response.headers.get('content-type') || 'image/png'
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: base64Data,
            },
          })
        } catch (err) {
          console.error('Failed to fetch image for Gemini:', err)
        }
      }
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
