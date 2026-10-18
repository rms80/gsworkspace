import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import { GeneratedImage, ImageProvider, PromptPart, TextProvider, apiErrorMessage, logRequest, logResponse } from './llmProvider.js'

const genAI = new GoogleGenerativeAI(process.env.GSWS_API_KEY_GEMINI || '')

export type GeminiModel = 'gemini-flash' | 'gemini-pro'
export type GeminiImageModel = 'gemini-imagen' | 'gemini-flash-imagen'

export const GEMINI_MODELS: readonly GeminiModel[] = ['gemini-flash', 'gemini-pro']
export const GEMINI_IMAGE_MODELS: readonly GeminiImageModel[] = ['gemini-imagen', 'gemini-flash-imagen']

const MODEL_IDS: Record<GeminiModel, string> = {
  'gemini-flash': 'gemini-3-flash-preview',
  'gemini-pro': 'gemini-3-pro-preview',
}

const IMAGE_GEN_MODEL_IDS: Record<GeminiImageModel, string> = {
  'gemini-imagen': 'gemini-2.0-flash-exp-image-generation',
  'gemini-flash-imagen': 'gemini-2.0-flash-exp-image-generation',
}

function toGeminiParts(parts: PromptPart[]): Part[] {
  return parts.map((part): Part => {
    if (part.type === 'image') return { inlineData: { mimeType: part.mimeType, data: part.base64 } }
    if (part.type === 'pdf') return { inlineData: { mimeType: 'application/pdf', data: part.base64 } }
    return { text: part.text }
  })
}

function usageSummary(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }): string {
  const meta = response.usageMetadata
  return meta ? `${meta.promptTokenCount ?? '?'} in / ${meta.candidatesTokenCount ?? '?'} out (${meta.totalTokenCount ?? '?'} total)` : 'no usage data'
}

const isAvailable = () => !!process.env.GSWS_API_KEY_GEMINI
const unavailableReason = () => 'GSWS_API_KEY_GEMINI is not set'
const errorMessage = (error: unknown) => apiErrorMessage(error, 'Google', 'GSWS_API_KEY_GEMINI')

/** Gemini models through the Gemini API */
export const geminiApiProvider: TextProvider = {
  name: 'Gemini',
  models: GEMINI_MODELS,
  isAvailable,
  unavailableReason,
  errorMessage,

  async generate(request) {
    const modelId = MODEL_IDS[request.model as GeminiModel]
    logRequest(this.name, request, modelId)

    const genModel = genAI.getGenerativeModel({
      model: modelId,
      ...(request.system && { systemInstruction: request.system }),
    })
    const result = await genModel.generateContent(toGeminiParts(request.parts), { signal: request.signal })
    const response = await result.response
    const text = response.text()
    logResponse(this.name, request.operation, `tokens: ${usageSummary(response)} | result: ${text.length} chars`)
    return text
  },
}

/** Gemini image generation through the Gemini API */
export const geminiImageProvider: ImageProvider = {
  name: 'Gemini',
  models: GEMINI_IMAGE_MODELS,
  isAvailable,
  unavailableReason,
  errorMessage,

  async generate(request) {
    const modelId = IMAGE_GEN_MODEL_IDS[request.model as GeminiImageModel]
    logRequest(this.name, request, modelId)

    const genModel = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      } as Record<string, unknown>,
    })
    const result = await genModel.generateContent(toGeminiParts(request.parts), { signal: request.signal })
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

    logResponse(this.name, request.operation, `tokens: ${usageSummary(response)} | result: ${images.length} images`)
    return images
  },
}
