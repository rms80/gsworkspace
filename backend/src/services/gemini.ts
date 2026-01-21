import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export type GeminiModel = 'gemini-flash' | 'gemini-pro'

const MODEL_IDS: Record<GeminiModel, string> = {
  'gemini-flash': 'gemini-3-flash-preview',
  'gemini-pro': 'gemini-3-pro-preview',
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
      }
      // URL-based images would need to be fetched first - skip for now
    }
  }

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  const result = await genModel.generateContent(parts)
  const response = await result.response
  return response.text()
}
