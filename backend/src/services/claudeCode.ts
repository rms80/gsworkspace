import { query } from '@anthropic-ai/claude-agent-sdk'
import { ResolvedContentItem } from './llmTypes.js'

export async function generateWithClaudeCode(
  items: ResolvedContentItem[],
  prompt: string
): Promise<string> {
  // Build a text prompt with content blocks described inline
  const parts: string[] = []

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push(`[Text block]: ${item.text}`)
    } else if (item.type === 'image' && item.imageData) {
      parts.push(`[Image: ${item.imageData.mimeType}, ${Math.round(item.imageData.base64.length * 3 / 4 / 1024)}KB]`)
    }
  }

  parts.push(`\nUser request: ${prompt}`)

  const fullPrompt = parts.join('\n\n')

  const conversation = query({
    prompt: fullPrompt,
    options: {
      maxTurns: 10,
      systemPrompt: 'You are a coding assistant integrated into an infinite canvas application. The user sends you text and image content from their canvas along with a request. Respond with helpful, concise results. If the user asks you to create or modify files, do so. Return your final answer as plain text.',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task', 'WebSearch', 'WebFetch'],
    },
  })

  let resultText = ''

  for await (const message of conversation) {
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        resultText = message.result
      } else {
        const errors = message.errors?.join(', ') || 'Unknown error'
        throw new Error(`Claude Code error: ${errors}`)
      }
    }
  }

  return resultText
}
