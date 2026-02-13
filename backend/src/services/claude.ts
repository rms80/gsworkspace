import Anthropic from '@anthropic-ai/sdk'
import { ResolvedContentItem } from './llmTypes.js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type ClaudeModel = 'claude-haiku' | 'claude-sonnet' | 'claude-opus'

const MODEL_IDS: Record<ClaudeModel, string> = {
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-opus': 'claude-opus-4-20250514',
}

export async function generateText(
  items: ResolvedContentItem[],
  prompt: string,
  model: ClaudeModel = 'claude-sonnet'
): Promise<string> {
  // Build message content from canvas items
  const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      contentBlocks.push({
        type: 'text',
        text: `[Text block]: ${item.text}`,
      })
    } else if (item.type === 'image' && item.imageData) {
      const mediaType = item.imageData.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: item.imageData.base64,
        },
      })
    } else if (item.type === 'pdf' && item.pdfData) {
      // The Anthropic API supports document blocks but the SDK types may not include them yet
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: item.pdfData.base64,
        },
      } as unknown as Anthropic.ImageBlockParam)
    } else if (item.type === 'text-file' && item.textFileData) {
      contentBlocks.push({
        type: 'text',
        text: `[Text file content]:\n${item.textFileData.text}`,
      })
    }
  }

  // Add the user's prompt
  contentBlocks.push({
    type: 'text',
    text: `\n\nUser request: ${prompt}`,
  })

  const message = await anthropic.messages.create({
    model: MODEL_IDS[model],
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  })

  // Extract text from response
  const textContent = message.content.find((block) => block.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}

export async function generateHtmlWithClaude(
  systemPrompt: string,
  userPrompt: string,
  model: ClaudeModel = 'claude-sonnet'
): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL_IDS[model],
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  // Extract text from response
  const textContent = message.content.find((block) => block.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}
