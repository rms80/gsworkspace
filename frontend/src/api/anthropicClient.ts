/**
 * Client-side Anthropic API wrapper for offline mode
 * Makes direct API calls from the browser using user-provided API key
 */

import { getAnthropicApiKey } from '../utils/apiKeyStorage'
import type { SpatialData } from '../utils/spatialJson'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Model mappings (same as backend)
type ClaudeModel = 'claude-haiku' | 'claude-sonnet' | 'claude-opus'

const MODEL_IDS: Record<ClaudeModel, string> = {
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-opus': 'claude-opus-4-20250514',
}

export interface ContentItem {
  type: 'text' | 'image' | 'pdf' | 'text-file'
  text?: string
  src?: string
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }
}

interface AnthropicDocumentBlock {
  type: 'document'
  source: {
    type: 'base64'
    media_type: 'application/pdf'
    data: string
  }
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: string
  messages: AnthropicMessage[]
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
  error?: { message: string }
}

async function callAnthropic(request: AnthropicRequest): Promise<string> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Please add your API key in Settings.')
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let errorMessage = `Anthropic API error: ${response.status}`
    try {
      const errorJson = JSON.parse(errorBody)
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message
      }
    } catch {
      // Use status text if we can't parse error
      errorMessage = `Anthropic API error: ${response.status} ${response.statusText}`
    }
    throw new Error(errorMessage)
  }

  const data: AnthropicResponse = await response.json()

  // Extract text from response
  const textContent = data.content.find((block) => block.type === 'text')
  return textContent?.text ?? ''
}

async function buildContentBlocks(items: ContentItem[]): Promise<AnthropicContentBlock[]> {
  const contentBlocks: AnthropicContentBlock[] = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      contentBlocks.push({
        type: 'text',
        text: `[Text block]: ${item.text}`,
      })
    } else if (item.type === 'image' && item.src) {
      // If it's a data URL, extract the base64 part
      if (item.src.startsWith('data:')) {
        const matches = item.src.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          const mediaType = matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
          const base64Data = matches[2]
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          })
        }
      }
      // Note: For URLs, we'd need to fetch and convert to base64, which is complex in the browser
      // For now, we skip URL images in offline mode (most user images will be data URLs anyway)
    } else if (item.type === 'pdf' && item.src) {
      try {
        const response = await fetch(item.src)
        const arrayBuffer = await response.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
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
        contentBlocks.push({
          type: 'text',
          text: `[Text file content]:\n${text}`,
        })
      } catch (err) {
        console.warn('Failed to fetch text file for LLM context:', err)
      }
    }
  }

  return contentBlocks
}

export async function generateTextWithAnthropic(
  items: ContentItem[],
  prompt: string,
  model: ClaudeModel = 'claude-sonnet'
): Promise<string> {
  const contentBlocks = await buildContentBlocks(items)

  // Add the user's prompt
  contentBlocks.push({
    type: 'text',
    text: `\n\nUser request: ${prompt}`,
  })

  return callAnthropic({
    model: MODEL_IDS[model],
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  })
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

export async function generateHtmlWithAnthropic(
  spatialData: SpatialData,
  userPrompt: string,
  model: ClaudeModel = 'claude-sonnet'
): Promise<string> {
  // Build the combined prompt with spatial data
  const spatialDataJson = JSON.stringify(spatialData, null, 2)
  const combinedUserPrompt = `## Content Blocks (as spatial JSON):\n\`\`\`json\n${spatialDataJson}\n\`\`\`\n\n## User Request:\n${userPrompt}`

  return callAnthropic({
    model: MODEL_IDS[model],
    max_tokens: 8192,
    system: HTML_GEN_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: combinedUserPrompt }],
      },
    ],
  })
}
