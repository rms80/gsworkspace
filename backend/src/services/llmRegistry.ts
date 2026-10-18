import { CLAUDE_MODELS, anthropicApiProvider } from './claude.js'
import { claudeCodeProvider } from './claudeCode.js'
import { CLI_NAMES, CliName, CliStatus, detectClis } from './cliDetection.js'
import { CODEX_IMAGE_MODELS, CODEX_MODELS, codexImageProvider, codexProvider } from './codex.js'
import { GEMINI_IMAGE_MODELS, GEMINI_MODELS, geminiApiProvider, geminiImageProvider } from './gemini.js'
import { ImageProvider, TextProvider } from './llmProvider.js'

/**
 * Picks an available provider for each model. A model family can have several providers, tried in
 * order: agent CLIs first (they use the account they're logged in with), then the API.
 * To add a provider, implement TextProvider or ImageProvider and add it to a route here.
 *
 * GSWS_PREFERRED_CLI (claude-code or codex) sets the defaults: the model for new prompts, the
 * model for quick queries.
 */

interface Route<P> {
  /** Names the family in errors */
  family: string
  models: readonly string[]
  providers: P[]
}

const TEXT_ROUTES: Route<TextProvider>[] = [
  { family: 'Claude', models: CLAUDE_MODELS, providers: [claudeCodeProvider, anthropicApiProvider] },
  { family: 'GPT', models: CODEX_MODELS, providers: [codexProvider] },
  { family: 'Gemini', models: GEMINI_MODELS, providers: [geminiApiProvider] },
]

const IMAGE_ROUTES: Route<ImageProvider>[] = [
  { family: 'Codex image', models: CODEX_IMAGE_MODELS, providers: [codexImageProvider] },
  { family: 'Gemini image', models: GEMINI_IMAGE_MODELS, providers: [geminiImageProvider] },
]

// Each CLI's models, for picking defaults
const CLI_MODELS: Record<CliName, { balanced: string; fast: string }> = {
  'claude-code': { balanced: 'claude-sonnet', fast: 'claude-haiku' },
  codex: { balanced: 'gpt-sol', fast: 'gpt-luna' },
}

// After the CLIs' models, in order
const API_DEFAULTS = { balanced: ['claude-sonnet', 'gemini-flash'], fast: ['claude-haiku', 'gemini-flash'] }

// Image models in order of preference: Codex can generate images and Claude Code can't
const IMAGE_DEFAULTS = ['codex-imagen', 'gemini-imagen']

let warnedPreference = false

function preferredCli(): CliName {
  const setting = (process.env.GSWS_PREFERRED_CLI || 'claude-code').trim().toLowerCase()
  if (CLI_NAMES.includes(setting as CliName)) return setting as CliName
  if (!warnedPreference) {
    console.warn(`[LLM] Unknown GSWS_PREFERRED_CLI "${setting}" (expected ${CLI_NAMES.join(' or ')}); using claude-code`)
    warnedPreference = true
  }
  return 'claude-code'
}

/** CLIs in order of preference */
function cliOrder(): CliName[] {
  const preferred = preferredCli()
  return [preferred, ...CLI_NAMES.filter((name) => name !== preferred)]
}

type Resolved<P> = { provider: P } | { error: string; status: number }

function resolve<P extends TextProvider | ImageProvider>(routes: Route<P>[], model: string): Resolved<P> {
  const route = routes.find((r) => r.models.includes(model))
  if (!route) return { error: `Unknown model: ${model}`, status: 400 }
  const provider = route.providers.find((p) => p.isAvailable())
  if (provider) return { provider }
  const reasons = route.providers.map((p) => p.unavailableReason()).join('; ')
  return { error: `${route.family} models aren't available on this server (${reasons}).`, status: 503 }
}

function availableModels<P extends TextProvider | ImageProvider>(routes: Route<P>[]): string[] {
  return routes.filter((r) => r.providers.some((p) => p.isAvailable())).flatMap((r) => r.models)
}

/** The provider for a text model, or why there's none */
export async function resolveTextProvider(model: string): Promise<Resolved<TextProvider>> {
  await detectClis()
  return resolve(TEXT_ROUTES, model)
}

/** The provider for an image model, or why there's none */
export async function resolveImageProvider(model: string): Promise<Resolved<ImageProvider>> {
  await detectClis()
  return resolve(IMAGE_ROUTES, model)
}

export interface LlmCapabilities {
  textModels: string[]
  imageModels: string[]
  /** For new prompts: the preferred CLI's balanced model, if available */
  defaultTextModel: string | null
  defaultImageModel: string | null
  /** For quick queries: the preferred CLI's fast model, if available */
  quickModel: string | null
  preferredCli: CliName
  clis: Record<CliName, CliStatus>
  apis: { anthropic: boolean; gemini: boolean }
}

/** What the server can run now */
export async function getLlmCapabilities(): Promise<LlmCapabilities> {
  const clis = await detectClis()
  const textModels = availableModels(TEXT_ROUTES)
  const imageModels = availableModels(IMAGE_ROUTES)
  const order = cliOrder()
  const firstAvailable = (models: string[], available: string[]) => models.find((m) => available.includes(m)) ?? null
  return {
    textModels,
    imageModels,
    defaultTextModel: firstAvailable([...order.map((cli) => CLI_MODELS[cli].balanced), ...API_DEFAULTS.balanced], textModels),
    defaultImageModel: firstAvailable(IMAGE_DEFAULTS, imageModels),
    quickModel: firstAvailable([...order.map((cli) => CLI_MODELS[cli].fast), ...API_DEFAULTS.fast], textModels),
    preferredCli: preferredCli(),
    clis,
    apis: { anthropic: anthropicApiProvider.isAvailable(), gemini: geminiApiProvider.isAvailable() },
  }
}
