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

  console.log('[ClaudeCode] Starting query with prompt length:', fullPrompt.length)

  const conversation = query({
    prompt: fullPrompt,
    options: {
      maxTurns: 50,
      systemPrompt: 'You are a coding assistant integrated into an infinite canvas application. The user sends you text and image content from their canvas along with a request. Respond with helpful, concise results. If the user asks you to create or modify files, do so. Return your final answer as plain text.',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task', 'WebSearch', 'WebFetch'],
      stderr: (data: string) => {
        console.error('[ClaudeCode stderr]', data.trim())
      },
    },
  })

  let resultText = ''

  for await (const message of conversation) {
    console.log('[ClaudeCode] Message type:', message.type, 'subtype' in message ? message.subtype : '')

    if (message.type === 'result') {
      if (message.subtype === 'success') {
        resultText = message.result
      } else {
        console.error('[ClaudeCode] Error result:', JSON.stringify(message, null, 2))
        // For max_turns, there may still be useful partial output in the last assistant message
        if (message.subtype === 'error_max_turns') {
          console.log('[ClaudeCode] Hit max turns — returning whatever result text we have')
          // resultText may have been set by an earlier assistant message; if so use it
          if (resultText) break
          throw new Error('Claude Code hit the maximum turn limit before completing. Try a simpler prompt.')
        }
        const errors = message.errors?.join(', ') || `${message.subtype}: ${message.stop_reason || 'no details'}`
        throw new Error(`Claude Code error: ${errors}`)
      }
    } else if (message.type === 'assistant') {
      // Capture the latest assistant text as a fallback
      const textBlocks = message.message.content.filter((b: { type: string }) => b.type === 'text')
      if (textBlocks.length > 0) {
        resultText = textBlocks.map((b: { type: 'text'; text: string }) => b.text).join('\n')
      }
    }
  }

  console.log('[ClaudeCode] Result length:', resultText.length)
  return resultText
}
