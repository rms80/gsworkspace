import { ResolvedContentItem } from './llmTypes.js'

/**
 * Text and image generation are done by providers: one per way of reaching a model family (the
 * Anthropic API, the Claude Code CLI, Codex, the Gemini API, ...). Routes build a provider-neutral
 * request and the registry (llmRegistry.ts) picks an available provider for the requested model.
 */

/** A piece of a prompt, in a form every provider can encode */
export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mimeType: string }
  | { type: 'pdf'; base64: string }

export interface TextRequest {
  /** App model name, e.g. 'claude-sonnet'; each provider maps it to its own model id */
  model: string
  system?: string
  /** The user message */
  parts: PromptPart[]
  /** Output limit, for providers that take one */
  maxTokens: number
  /** Aborts the request, e.g. when the client disconnects */
  signal?: AbortSignal
  /** Name of the calling operation, for logs */
  operation: string
}

export interface ImageRequest {
  model: string
  /** Reference content and the user's request */
  parts: PromptPart[]
  signal?: AbortSignal
  operation: string
}

export interface GeneratedImage {
  mimeType: string
  data: string // base64
}

interface Provider {
  /** Used in logs and error messages, e.g. 'Claude Code' */
  name: string
  /** App model names this provider serves */
  models: readonly string[]
  /** Whether the provider can run now (an API key is set, a CLI is installed and logged in, ...) */
  isAvailable(): boolean
  /** Why it isn't available, for error messages */
  unavailableReason(): string
  /** Turns an error thrown by generate() into a message for the user */
  errorMessage(error: unknown): string
}

export interface TextProvider extends Provider {
  generate(request: TextRequest): Promise<string>
}

export interface ImageProvider extends Provider {
  generate(request: ImageRequest): Promise<GeneratedImage[]>
}

/** Converts resolved canvas items into prompt parts, labelling text so the model knows its source */
export function itemsToParts(items: ResolvedContentItem[]): PromptPart[] {
  const parts: PromptPart[] = []
  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push({ type: 'text', text: `[Text block]: ${item.text}` })
    } else if (item.type === 'image' && item.imageData) {
      parts.push({ type: 'image', base64: item.imageData.base64, mimeType: item.imageData.mimeType })
    } else if (item.type === 'pdf' && item.pdfData) {
      parts.push({ type: 'pdf', base64: item.pdfData.base64 })
    } else if (item.type === 'text-file' && item.textFileData) {
      parts.push({ type: 'text', text: `[Text file content]:\n${item.textFileData.text}` })
    }
  }
  return parts
}

function truncatePrompt(text: string, maxWords = 50): string {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '...'
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ')
}

/** Logs an outgoing request, previewing its last text part (the user's prompt) */
export function logRequest(provider: string, request: TextRequest | ImageRequest, modelId: string) {
  const lastText = [...request.parts].reverse().find((p) => p.type === 'text')
  const prompt = lastText?.type === 'text' ? lastText.text.trim() : ''
  console.log(`[${timestamp()}] [${provider}] [request] ${request.operation} | model=${request.model} (${modelId}) | prompt: ${truncatePrompt(prompt)}`)
}

export function logResponse(provider: string, operation: string, details: string) {
  console.log(`[${timestamp()}] [${provider}] [response] ${operation} | ${details}`)
}

/** User-facing message for an error from a hosted API (Anthropic, Gemini, ...) authenticated by an API key */
export function apiErrorMessage(error: unknown, service: string, keyEnvVar: string): string {
  if (error instanceof Error) {
    const message = error.message
    const status = 'status' in error ? (error as { status: number }).status : undefined

    if (status === 401) {
      return `${service} API key is missing or invalid. Please check your ${keyEnvVar} in the backend .env file.`
    }
    if (status === 429) {
      return `${service} API rate limit exceeded. Please try again later.`
    }
    if (message.includes('invalid x-api-key') || message.includes('invalid api key') || message.includes('API_KEY_INVALID')) {
      return `${service} API key is invalid. Please check your ${keyEnvVar} in the backend .env file.`
    }
    if (message.includes('API key') && (message.includes('missing') || message.includes('not provided') || message.includes('required'))) {
      return `${service} API key is not configured. Please set ${keyEnvVar} in the backend .env file.`
    }
    // Return the original message if it's descriptive enough
    if (message.length > 10 && message.length < 200) {
      return message
    }
  }
  return `${service} API request failed. Check the server logs for details.`
}
