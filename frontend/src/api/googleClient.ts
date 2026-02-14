/**
 * Client-side Google Generative AI API wrapper for offline mode
 * Makes direct API calls from the browser using user-provided API key
 */

import { getGoogleApiKey } from '../utils/apiKeyStorage'
import type { SpatialData } from '../utils/spatialJson'

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Model mappings (same as backend)
type GeminiModel = 'gemini-flash' | 'gemini-pro'
type ImageGenModel = 'gemini-imagen' | 'gemini-flash-imagen'

const MODEL_IDS: Record<GeminiModel, string> = {
  'gemini-flash': 'gemini-3-flash-preview',
  'gemini-pro': 'gemini-3-pro-preview',
}

const IMAGE_GEN_MODEL_IDS: Record<ImageGenModel, string> = {
  'gemini-imagen': 'gemini-2.0-flash-exp-image-generation',
  'gemini-flash-imagen': 'gemini-2.0-flash-exp-image-generation',
}

export interface ContentItem {
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  src?: string
}

interface GeminiTextPart {
  text: string
}

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string
    data: string
  }
}

type GeminiPart = GeminiTextPart | GeminiInlineDataPart

interface GeminiRequest {
  contents: Array<{
    parts: GeminiPart[]
  }>
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  generationConfig?: Record<string, unknown>
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }>
  error?: {
    message: string
    code: number
  }
}

async function callGemini(modelId: string, request: GeminiRequest): Promise<GeminiResponse> {
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    throw new Error('Google API key not configured. Please add your API key in Settings.')
  }

  const url = `${GOOGLE_API_BASE}/${modelId}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let errorMessage = `Google API error: ${response.status}`
    try {
      const errorJson = JSON.parse(errorBody)
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message
      }
    } catch {
      errorMessage = `Google API error: ${response.status} ${response.statusText}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

async function buildContentParts(items: ContentItem[]): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = []

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
      // Note: For URLs, we'd need to fetch and convert to base64
      // Skipping URL images in offline mode for simplicity
    } else if (item.type === 'pdf' && item.src) {
      try {
        const response = await fetch(item.src)
        const arrayBuffer = await response.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: base64,
          },
        })
      } catch (err) {
        console.warn('Failed to fetch PDF for LLM context:', err)
      }
    } else if (item.type === 'text-file' && item.src) {
      try {
        const response = await fetch(item.src)
        const text = await response.text()
        parts.push({ text: `[Text file content]:\n${text}` })
      } catch (err) {
        console.warn('Failed to fetch text file for LLM context:', err)
      }
    }
  }

  return parts
}

export async function generateTextWithGemini(
  items: ContentItem[],
  prompt: string,
  model: GeminiModel = 'gemini-flash'
): Promise<string> {
  const parts = await buildContentParts(items)

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  const response = await callGemini(MODEL_IDS[model], {
    contents: [{ parts }],
  })

  // Extract text from response
  const textContent = response.candidates?.[0]?.content?.parts?.find((p) => p.text)
  return textContent?.text ?? ''
}

// HTML generation system prompt (same as backend)
const HTML_GEN_SYSTEM_PROMPT = `You are an expert web designer and HTML developer. Your task is to generate clean, well-structured HTML webpages based on the content provided.

## Guidelines

1. **Output Format**: Generate a complete HTML document with inline CSS styles. Do not use external stylesheets or JavaScript unless specifically requested.

2. **Image Handling**: Images are provided with placeholder IDs (like \`IMAGE_1\`, \`IMAGE_2\`, etc.). Use these IDs directly as the \`src\` attribute value in \`<img>\` tags. The system will automatically replace them with the actual image URLs. Example: \`<img src="IMAGE_1" alt="description">\`

3. **Layout**: The content items are provided with spatial position data (x, y coordinates) and are sorted from top to bottom. Use this information to create a layout that respects the general visual hierarchy:
   - Items with smaller y values should appear higher on the page
   - Items with similar y values may be side-by-side
   - Use appropriate CSS for positioning (flexbox, grid, or flow layout)

4. **Styling**:
   - Use modern, clean CSS with inline styles or a <style> block in the <head>
   - Ensure good typography with appropriate font sizes and line heights
   - Use a pleasant color scheme unless the user specifies otherwise
   - Make the design responsive where reasonable

5. **Semantic HTML**: Use appropriate semantic elements (header, main, section, article, figure, etc.) for better accessibility and structure.

6. **Output Only HTML**: Return ONLY the HTML code. Do not include markdown code fences, explanations, or any other text outside the HTML document.

## Input Format

You will receive:
1. A JSON object with:
   - \`page\`: contains \`bounds\` ({ x, y, width, height }) — the total bounding box of all content, with top-left at (0,0)
   - \`items\`: an array of content blocks, each with:
     - \`type\`: "text" or "image"
     - \`content\` (for text) or \`imageId\` (for image): The text content or image placeholder ID
     - \`bounds\`: { x, y, width, height } — top-left corner position and dimensions, relative to the page origin

2. A user prompt describing what kind of webpage to create

Use the content blocks as source material and follow the user's prompt to create the webpage.`

export async function generateHtmlWithGemini(
  spatialData: SpatialData,
  userPrompt: string,
  model: GeminiModel = 'gemini-flash'
): Promise<string> {
  // Build the combined prompt with spatial data
  const spatialDataJson = JSON.stringify(spatialData, null, 2)
  const combinedUserPrompt = `## Content Blocks (as spatial JSON):\n\`\`\`json\n${spatialDataJson}\n\`\`\`\n\n## User Request:\n${userPrompt}`

  const response = await callGemini(MODEL_IDS[model], {
    contents: [
      {
        parts: [{ text: combinedUserPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: HTML_GEN_SYSTEM_PROMPT }],
    },
  })

  // Extract text from response
  const textContent = response.candidates?.[0]?.content?.parts?.find((p) => p.text)
  return textContent?.text ?? ''
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
  const parts = await buildContentParts(items)

  // Add the user's prompt
  parts.push({ text: `\n\nUser request: ${prompt}` })

  const response = await callGemini(IMAGE_GEN_MODEL_IDS[model], {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  })

  // Extract images from response
  const images: GeneratedImage[] = []
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data || '',
        })
      }
    }
  }

  return images
}
