import { readdir, readFile, rm } from 'fs/promises'
import { homedir } from 'os'
import { extname, join } from 'path'
import { cliCommand, cliCommandEnvVar, cliStatus, cliUnavailableReason } from './cliDetection.js'
import { CliError, runCli } from './cliRunner.js'
import { GeneratedImage, ImageProvider, PromptPart, TextProvider, logRequest, logResponse } from './llmProvider.js'

/**
 * GPT models and image generation through the Codex CLI in headless mode (`codex exec`), using
 * whatever account the CLI on the server is logged in with.
 *
 * Each request is a single-shot query: an ephemeral session (nothing saved) in an empty temp
 * directory with a read-only sandbox. Codex takes images as files (-i), so attachments are written
 * to the temp directory and referenced from the prompt; PDFs are written there too, for Codex to
 * read with its shell tool, as it has no other way to take them.
 */

export type CodexModel = 'gpt-luna' | 'gpt-sol' | 'gpt-astra'
export type CodexImageModel = 'codex-imagen'

export const CODEX_MODELS: readonly CodexModel[] = ['gpt-luna', 'gpt-sol', 'gpt-astra']
export const CODEX_IMAGE_MODELS: readonly CodexImageModel[] = ['codex-imagen']

export const MODEL_IDS: Record<CodexModel, string> = {
  'gpt-luna': 'gpt-6-luna',
  'gpt-sol': 'gpt-6.1-sol',
  'gpt-astra': 'gpt-6-astra',
}

// Drives the image generation tool
const IMAGE_MODEL_ID = MODEL_IDS['gpt-sol']

// Replaces Codex's own coding-agent instructions for text requests when the request has none
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'

const INSTRUCTIONS_FILE = 'instructions.md'
const LAST_MESSAGE_FILE = 'last-message.txt'

// Tools a single-shot query doesn't need. Set with -c rather than --disable, which rejects names an
// older or newer Codex doesn't know.
const AGENT_FEATURES = ['multi_agent', 'apps', 'plugins', 'browser_use', 'computer_use']
const TEXT_FEATURES = [...AGENT_FEATURES, 'image_generation']
const SHELL_FEATURES = ['shell_tool', 'unified_exec']

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

interface CodexInput {
  prompt: string
  files: Record<string, Buffer>
  images: string[]
  hasPdf: boolean
}

/** Writes images and PDFs out as files, referenced by name from the prompt text */
function buildInput(parts: PromptPart[]): CodexInput {
  const files: Record<string, Buffer> = {}
  const images: string[] = []
  const texts: string[] = []
  let pdfs = 0
  for (const part of parts) {
    if (part.type === 'image') {
      const file = `image-${images.length + 1}.${IMAGE_EXTENSIONS[part.mimeType] ?? 'png'}`
      files[file] = Buffer.from(part.base64, 'base64')
      images.push(file)
      texts.push(`[Attached image ${images.length}]`)
    } else if (part.type === 'pdf') {
      const file = `document-${++pdfs}.pdf`
      files[file] = Buffer.from(part.base64, 'base64')
      texts.push(`[PDF document: ${file}, in the working directory]`)
    } else {
      texts.push(part.text)
    }
  }
  return { prompt: texts.join('\n\n'), files, images, hasPdf: pdfs > 0 }
}

interface CodexEvent {
  type: string
  thread_id?: string
  item?: { type: string; text?: string }
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number }
  error?: { message?: string }
  message?: string
}

interface CodexOutput {
  threadId?: string
  /** The final agent message */
  text: string
  usage?: CodexEvent['usage']
  error?: string
}

/** Codex wraps API errors as JSON in the message; pull out the readable part */
function readableError(message: string): string {
  try {
    const parsed = JSON.parse(message)
    return parsed?.error?.message ?? parsed?.message ?? message
  } catch {
    return message
  }
}

function parseOutput(stdout: string, lastMessage: string | undefined): CodexOutput {
  const output: CodexOutput = { text: lastMessage?.trim() ?? '' }
  let lastAgentMessage = ''
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    let event: CodexEvent
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === 'thread.started') output.threadId = event.thread_id
    else if (event.type === 'turn.completed') output.usage = event.usage
    else if (event.type === 'turn.failed') output.error = readableError(event.error?.message ?? 'turn failed')
    else if (event.type === 'error' && !output.error) output.error = readableError(event.message ?? 'error')
    else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text?.trim()) {
      lastAgentMessage = event.item.text.trim()
    }
  }
  output.text ||= lastAgentMessage
  return output
}

function usageSummary(usage: CodexEvent['usage']): string {
  if (!usage) return 'no usage data'
  const parts = [`${usage.input_tokens ?? '?'} in`, `${usage.output_tokens ?? '?'} out`]
  if (usage.cached_input_tokens) parts.push(`${usage.cached_input_tokens} cached`)
  if (usage.reasoning_output_tokens) parts.push(`${usage.reasoning_output_tokens} reasoning`)
  return `tokens: ${parts.join(' / ')}`
}

async function runCodex(options: {
  modelId: string
  input: CodexInput
  /** Replaces Codex's agent instructions */
  instructions?: string
  disabledFeatures: string[]
  signal?: AbortSignal
}): Promise<CodexOutput> {
  const { input } = options
  const files: Record<string, string | Buffer> = { ...input.files }
  if (options.instructions) files[INSTRUCTIONS_FILE] = options.instructions

  const { stdout, stderr, exitCode, outputFiles } = await runCli({
    name: 'Codex',
    command: cliCommand('codex'),
    commandEnvVar: cliCommandEnvVar('codex'),
    args: (filesDir) => [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--json',
      '--color', 'never',
      '--model', options.modelId,
      // Unquoted values aren't valid TOML, so Codex takes them as plain strings
      ...(options.instructions ? ['-c', `model_instructions_file=${join(filesDir, INSTRUCTIONS_FILE)}`] : []),
      ...options.disabledFeatures.flatMap((feature) => ['-c', `features.${feature}=false`]),
      '-c', 'web_search=disabled',
      ...input.images.map((file) => `--image=${join(filesDir, file)}`),
      '--output-last-message', LAST_MESSAGE_FILE,
      '-', // prompt on stdin
    ],
    files,
    outputFiles: [LAST_MESSAGE_FILE],
    stdin: input.prompt,
    signal: options.signal,
  })

  const output = parseOutput(stdout, outputFiles[LAST_MESSAGE_FILE])
  if (output.error) {
    throw new CliError(`Codex request failed: ${output.error}`)
  }
  if (exitCode !== 0) {
    const detail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
    console.error(`[Codex] exited with code ${exitCode}. stderr: ${stderr.trim()}`)
    throw new CliError(`Codex failed (exit code ${exitCode})${detail ? `: ${detail}` : ''}`)
  }
  return output
}

/** Where Codex saves the images a session generates */
function generatedImagesDir(threadId: string): string {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', threadId)
}

/** Reads and deletes the images Codex generated in a session */
async function collectGeneratedImages(threadId: string): Promise<GeneratedImage[]> {
  const dir = generatedImagesDir(threadId)
  const names = await readdir(dir).catch(() => [] as string[])
  const images: GeneratedImage[] = []
  for (const name of names.sort()) {
    const mimeType = MIME_TYPES[extname(name).toLowerCase()]
    if (!mimeType) continue
    images.push({ mimeType, data: (await readFile(join(dir, name))).toString('base64') })
  }
  await rm(dir, { recursive: true, force: true }).catch(() => {})
  return images
}

const isAvailable = () => cliStatus('codex').available
const unavailableReason = () => cliUnavailableReason('codex')
function errorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message
  return 'Codex request failed. Check the server logs for details.'
}

export const codexProvider: TextProvider = {
  name: 'Codex',
  models: CODEX_MODELS,
  isAvailable,
  unavailableReason,
  errorMessage,

  async generate(request) {
    const modelId = MODEL_IDS[request.model as CodexModel]
    logRequest(this.name, request, modelId)
    const input = buildInput(request.parts)
    const started = Date.now()
    const output = await runCodex({
      modelId,
      input,
      instructions: request.system || DEFAULT_SYSTEM_PROMPT,
      // PDFs can only be read with the shell
      disabledFeatures: input.hasPdf ? TEXT_FEATURES : [...TEXT_FEATURES, ...SHELL_FEATURES],
      signal: request.signal,
    })
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    logResponse(this.name, request.operation, `${usageSummary(output.usage)} | ${seconds}s | result: ${output.text.length} chars`)
    return output.text
  },
}

const IMAGE_INSTRUCTIONS =
  'Generate an image for the request below with your image generation tool. Any attached images are ' +
  'reference material for it. Do not write files or run commands; just generate the image, then reply ' +
  'with one short sentence.'

export const codexImageProvider: ImageProvider = {
  name: 'Codex',
  models: CODEX_IMAGE_MODELS,
  isAvailable,
  unavailableReason,
  errorMessage,

  async generate(request) {
    logRequest(this.name, request, IMAGE_MODEL_ID)
    const input = buildInput([{ type: 'text', text: IMAGE_INSTRUCTIONS }, ...request.parts])
    const started = Date.now()
    const output = await runCodex({
      modelId: IMAGE_MODEL_ID,
      input,
      disabledFeatures: AGENT_FEATURES,
      signal: request.signal,
    })
    const images = output.threadId ? await collectGeneratedImages(output.threadId) : []
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    logResponse(this.name, request.operation, `${usageSummary(output.usage)} | ${seconds}s | result: ${images.length} images`)
    if (images.length === 0) {
      throw new CliError(`Codex didn't generate an image${output.text ? `: ${output.text.slice(0, 300)}` : '.'}`)
    }
    return images
  },
}
