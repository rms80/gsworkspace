import { GoogleGenerativeAI } from '@google/generative-ai'
import { ResolvedContentItem } from './llmTypes.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

function truncatePrompt(text: string, maxWords = 50): string {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '...'
}

function logRequest(fn: string, model: string, modelId: string, prompt: string) {
  console.log(`[${new Date().toISOString().replace('T', ' ')}] [Gemini] [request] ${fn} | model=${model} (${modelId}) | prompt: ${truncatePrompt(prompt)}`)
}

function logResponse(fn: string, response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }, resultLen: number) {
  const meta = response.usageMetadata
  const tokens = meta ? `${meta.promptTokenCount ?? '?'} in / ${meta.candidatesTokenCount ?? '?'} out (${meta.totalTokenCount ?? '?'} total)` : 'no usage data'
  console.log(`[${new Date().toISOString().replace('T', ' ')}] [Gemini] [response] ${fn} | tokens: ${tokens} | result: ${resultLen} chars`)
}

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
  logRequest('generateHtml', model, MODEL_IDS[model], userPrompt)

  const genModel = genAI.getGenerativeModel({
    model: MODEL_IDS[model],
    systemInstruction: systemPrompt,
  })

  const result = await genModel.generateContent(userPrompt)
  const response = await result.response
  const text = response.text()
  logResponse('generateHtml', response, text.length)
  return text
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
    } else if (item.type === 'text-file' && item.textFileData) {
      parts.push({ text: `[Text file content]:\n${item.textFileData.text}` })
    }
  }

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  logRequest('generateText', model, MODEL_IDS[model], prompt)

  const result = await genModel.generateContent(parts)
  const response = await result.response
  const text = response.text()
  logResponse('generateText', response, text.length)
  return text
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
    } else if (item.type === 'text-file' && item.textFileData) {
      parts.push({ text: `[Text file content]:\n${item.textFileData.text}` })
    }
  }

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  logRequest('generateImage', model, IMAGE_GEN_MODEL_IDS[model], prompt)

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

  const meta = response.usageMetadata
  const tokens = meta ? `${meta.promptTokenCount ?? '?'} in / ${meta.candidatesTokenCount ?? '?'} out (${meta.totalTokenCount ?? '?'} total)` : 'no usage data'
  console.log(`[${new Date().toISOString().replace('T', ' ')}] [Gemini] [response] generateImage | tokens: ${tokens} | result: ${images.length} images`)
  return images
}
