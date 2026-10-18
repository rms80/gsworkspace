import { useEffect, useSyncExternalStore } from 'react'
import { ImageGenModel, LLMModel } from '../types'
import { IMAGE_GEN_MODELS, LLM_MODELS } from '../constants/canvas'
import { isOfflineMode } from './scenes'

/**
 * Which models can run now. Online, the server reports this (GET /api/config/llm): it depends on
 * which agent CLIs it has (Claude Code, Codex) and which API keys are set. Offline, the browser calls
 * the Anthropic and Gemini APIs itself, so those models are offered.
 */
export interface LlmCapabilities {
  textModels: LLMModel[]
  imageModels: ImageGenModel[]
  defaultTextModel: LLMModel
  defaultImageModel: ImageGenModel
}

const OFFLINE: LlmCapabilities = {
  textModels: LLM_MODELS.filter((m) => m.startsWith('claude-') || m.startsWith('gemini-')),
  imageModels: IMAGE_GEN_MODELS.filter((m) => m.startsWith('gemini-')),
  defaultTextModel: 'claude-sonnet',
  defaultImageModel: 'gemini-imagen',
}

// Until the server has answered: offer everything, and fail with the server's error if unavailable
const UNKNOWN: LlmCapabilities = {
  textModels: LLM_MODELS,
  imageModels: IMAGE_GEN_MODELS,
  defaultTextModel: 'claude-sonnet',
  defaultImageModel: 'gemini-imagen',
}

const MAX_AGE_MS = 60000

let server: LlmCapabilities | null = null
let fetchedAt = 0
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

interface ServerCapabilities {
  textModels: string[]
  imageModels: string[]
  defaultTextModel: string | null
  defaultImageModel: string | null
}

async function fetchServerCapabilities(): Promise<void> {
  try {
    const response = await fetch('/api/config/llm')
    if (!response.ok) return
    const data: ServerCapabilities = await response.json()
    // Only models this frontend knows, in its order
    const textModels = LLM_MODELS.filter((m) => data.textModels.includes(m))
    const imageModels = IMAGE_GEN_MODELS.filter((m) => data.imageModels.includes(m))
    server = {
      textModels,
      imageModels,
      defaultTextModel: (textModels.find((m) => m === data.defaultTextModel) ?? textModels[0] ?? 'claude-sonnet'),
      defaultImageModel: (imageModels.find((m) => m === data.defaultImageModel) ?? imageModels[0] ?? 'gemini-imagen'),
    }
    fetchedAt = Date.now()
    listeners.forEach((listener) => listener())
  } catch (err) {
    console.error('Failed to fetch LLM capabilities:', err)
  } finally {
    pending = null
  }
}

/** Re-fetches the server's capabilities if they're older than MAX_AGE_MS (no-op offline) */
export function refreshLlmCapabilities(): void {
  if (isOfflineMode() || pending || (server && Date.now() - fetchedAt < MAX_AGE_MS)) return
  pending = fetchServerCapabilities()
}

/** The current capabilities, for code outside React (e.g. defaults for new items) */
export function getLlmCapabilities(): LlmCapabilities {
  if (isOfflineMode()) return OFFLINE
  return server ?? UNKNOWN
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current capabilities; fetches them from the server on mount if stale */
export function useLlmCapabilities(): LlmCapabilities {
  useEffect(refreshLlmCapabilities, [])
  return useSyncExternalStore(subscribe, getLlmCapabilities)
}
