import Anthropic from '@anthropic-ai/sdk'
import { ResolvedContentItem } from './llmTypes.js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

function truncatePrompt(text: string, maxWords = 50): string {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '...'
}

function logRequest(fn: string, model: string, modelId: string, prompt: string) {
  console.log(`[${new Date().toISOString().replace('T', ' ')}] [Claude] ${fn} | model=${model} (${modelId}) | prompt: ${truncatePrompt(prompt)}`)
}

function logResponse(fn: string, message: Anthropic.Message) {
  const usage = message.usage as unknown as Record<string, number>
  const parts = [`${usage.input_tokens} in`, `${usage.output_tokens} out`]
  if (usage.cache_read_input_tokens) parts.push(`${usage.cache_read_input_tokens} cache-read`)
  if (usage.cache_creation_input_tokens) parts.push(`${usage.cache_creation_input_tokens} cache-write`)
  const resultLen = message.content.find((b) => b.type === 'text')?.text?.length ?? 0
  console.log(`[${new Date().toISOString().replace('T', ' ')}] [Claude] ${fn} | stop=${message.stop_reason} | tokens: ${parts.join(' / ')} | result: ${resultLen} chars`)
}

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

  logRequest('generateText', model, MODEL_IDS[model], prompt)

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

  logResponse('generateText', message)

  // Extract text from response
  const textContent = message.content.find((block) => block.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}

export async function generateHtmlWithClaude(
  systemPrompt: string,
  userPrompt: string,
  model: ClaudeModel = 'claude-sonnet'
): Promise<string> {
  logRequest('generateHtml', model, MODEL_IDS[model], userPrompt)

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

  logResponse('generateHtml', message)

  // Extract text from response
  const textContent = message.content.find((block) => block.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}
