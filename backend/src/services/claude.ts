import Anthropic from '@anthropic-ai/sdk'
import { PromptPart, TextProvider, apiErrorMessage, logRequest, logResponse } from './llmProvider.js'

const anthropic = new Anthropic({
  apiKey: process.env.GSWS_API_KEY_ANTHROPIC,
})

export type ClaudeModel = 'claude-haiku' | 'claude-sonnet' | 'claude-opus'

export const CLAUDE_MODELS: readonly ClaudeModel[] = ['claude-haiku', 'claude-sonnet', 'claude-opus']

const MODEL_IDS: Record<ClaudeModel, string> = {
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-opus': 'claude-opus-4-20250514',
}

type ContentBlock = Exclude<Anthropic.MessageParam['content'], string>[number]

/** Encodes prompt parts as Anthropic message content blocks (also what Claude Code's stream-json input takes) */
export function toAnthropicContent(parts: PromptPart[]): ContentBlock[] {
  return parts.map((part): ContentBlock => {
    if (part.type === 'image') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: part.base64,
        },
      }
    }
    if (part.type === 'pdf') {
      // The Anthropic API supports document blocks but the SDK types may not include them yet
      return {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: part.base64 },
      } as unknown as Anthropic.ImageBlockParam
    }
    return { type: 'text', text: part.text }
  })
}

function usageSummary(message: Anthropic.Message): string {
  const usage = message.usage as unknown as Record<string, number>
  const parts = [`${usage.input_tokens} in`, `${usage.output_tokens} out`]
  if (usage.cache_read_input_tokens) parts.push(`${usage.cache_read_input_tokens} cache-read`)
  if (usage.cache_creation_input_tokens) parts.push(`${usage.cache_creation_input_tokens} cache-write`)
  return parts.join(' / ')
}

/** Claude models through the Anthropic API */
export const anthropicApiProvider: TextProvider = {
  name: 'Claude',
  models: CLAUDE_MODELS,

  isAvailable: () => !!process.env.GSWS_API_KEY_ANTHROPIC,

  unavailableReason: () => 'GSWS_API_KEY_ANTHROPIC is not set',

  async generate(request) {
    const modelId = MODEL_IDS[request.model as ClaudeModel]
    logRequest(this.name, request, modelId)

    const message = await anthropic.messages.create(
      {
        model: modelId,
        max_tokens: request.maxTokens,
        ...(request.system && { system: request.system }),
        messages: [{ role: 'user', content: toAnthropicContent(request.parts) }],
      },
      { signal: request.signal },
    )

    const textContent = message.content.find((block) => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : ''
    logResponse(this.name, request.operation, `stop=${message.stop_reason} | tokens: ${usageSummary(message)} | result: ${text.length} chars`)
    return text
  },

  errorMessage: (error) => apiErrorMessage(error, 'Anthropic', 'GSWS_API_KEY_ANTHROPIC'),
}
