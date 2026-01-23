import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type ClaudeModel = 'claude-haiku' | 'claude-sonnet' | 'claude-opus'

const MODEL_IDS: Record<ClaudeModel, string> = {
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-opus': 'claude-opus-4-20250514',
}

interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
}

export async function generateText(
  items: ContentItem[],
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
      } else {
        // It's a URL, use URL source
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'url',
            url: item.src,
          },
        } as unknown as Anthropic.ImageBlockParam)
      }
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
