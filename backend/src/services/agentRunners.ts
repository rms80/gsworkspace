import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { toAnthropicContent } from './claude.js'
import { CliName, cliCommand, cliCommandEnvVar } from './cliDetection.js'
import { CliError, runCli } from './cliRunner.js'
import { PromptPart } from './llmProvider.js'

/**
 * Runs one turn of a persistent agent session through an agent CLI. Unlike the single-shot
 * providers, a session runs in its own working directory with everything a normal session has (all
 * tools, MCP servers, skills, the user's settings), and each turn resumes the CLI's saved session.
 * Output is streamed as AgentEventBody events while the turn runs.
 */

export type PermissionLevel = 'safe' | 'full'

/** What happened during a turn, in a form common to all agents */
export type AgentEventBody =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id?: string; tool: string; input: string }
  | { type: 'tool_result'; id?: string; output: string; isError?: boolean }
  | { type: 'notice'; text: string }

export interface TurnRequest {
  /** The agent's working directory */
  cwd: string
  /** Where to keep attachments the agent reads by path (outside cwd, so they don't clutter it) */
  attachmentsDir: string
  /** The CLI's model id or alias; null for the CLI's default */
  model: string | null
  permissions: PermissionLevel
  /** The CLI's session to resume; null for the first turn */
  cliSessionId: string | null
  parts: PromptPart[]
  signal: AbortSignal
  timeoutMs: number
  onEvent(event: AgentEventBody): void
  /** Called as soon as the CLI reports its session id */
  onCliSessionId(id: string): void
}

/** Token counts the CLI reports as running totals for the whole session */
export interface SessionTokenTotals {
  input: number
  cachedInput: number
  output: number
}

export interface TurnOutcome {
  /** The agent's final reply */
  result: string
  /** One-line usage summary of this turn, for logs and the transcript */
  usage?: string
  /** For CLIs that report session totals instead (Codex); the session works out the turn's share */
  sessionTotals?: SessionTokenTotals
}

export interface AgentRunner {
  runTurn(request: TurnRequest): Promise<TurnOutcome>
}

// Keeps transcripts a manageable size; the CLI's own session keeps the full output
const MAX_EVENT_TEXT = 4000

function truncate(text: string): string {
  return text.length > MAX_EVENT_TEXT ? `${text.slice(0, MAX_EVENT_TEXT)}\n... (${text.length - MAX_EVENT_TEXT} more characters)` : text
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim().startsWith('{')) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function failureDetail(stderr: string): string {
  return stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
}

// --- Claude Code ---

interface ClaudeContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((block) => (block?.type === 'text' ? block.text : `[${block?.type ?? 'content'}]`)).join('\n')
  }
  return stringify(content)
}

const claudeCodeRunner: AgentRunner = {
  async runTurn(request) {
    let result: Record<string, unknown> | null = null

    const onLine = (line: string) => {
      const message = parseJsonLine(line)
      if (!message) return
      if (message.type === 'system' && message.subtype === 'init' && typeof message.session_id === 'string') {
        request.onCliSessionId(message.session_id)
      } else if (message.type === 'assistant' || message.type === 'user') {
        const content = (message.message as { content?: ClaudeContentBlock[] })?.content
        if (!Array.isArray(content)) return
        for (const block of content) {
          if (block.type === 'text' && block.text?.trim()) {
            request.onEvent({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            request.onEvent({ type: 'tool_use', id: block.id, tool: block.name ?? 'tool', input: truncate(stringify(block.input)) })
          } else if (block.type === 'tool_result') {
            request.onEvent({ type: 'tool_result', id: block.tool_use_id, output: truncate(toolResultText(block.content)), isError: !!block.is_error })
          }
        }
      } else if (message.type === 'result') {
        result = message
      }
    }

    const { stderr, exitCode } = await runCli({
      name: 'Claude Code',
      command: cliCommand('claude-code'),
      commandEnvVar: cliCommandEnvVar('claude-code'),
      cwd: request.cwd,
      args: [
        '--print',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose', // required by stream-json output
        // safe: a classifier approves routine actions and blocks risky ones
        '--permission-mode', request.permissions === 'full' ? 'bypassPermissions' : 'auto',
        // Nobody can answer a prompt, so anything that would ask is denied
        '--permission-prompts', 'none',
        ...(request.model ? ['--model', request.model] : []),
        ...(request.cliSessionId ? ['--resume', request.cliSessionId] : []),
      ],
      stdin: JSON.stringify({ type: 'user', message: { role: 'user', content: toAnthropicContent(request.parts) } }) + '\n',
      // Use the CLI's logged-in account, not an API key from the server's environment
      env: { ANTHROPIC_API_KEY: undefined },
      onStdoutLine: onLine,
      signal: request.signal,
      timeoutMs: request.timeoutMs,
    })

    const final = result as Record<string, unknown> | null
    if (!final) {
      console.error(`[Agent] Claude Code exited with code ${exitCode} and no result. stderr: ${stderr.trim()}`)
      const detail = failureDetail(stderr)
      throw new CliError(`Claude Code failed (exit code ${exitCode})${detail ? `: ${detail}` : ''}`)
    }
    if (final.is_error || final.subtype !== 'success') {
      throw new CliError(`Claude Code: ${final.result || final.subtype}`)
    }
    const usage = final.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined
    const cost = typeof final.total_cost_usd === 'number' ? ` | cost: $${final.total_cost_usd.toFixed(4)}` : ''
    return {
      result: String(final.result ?? ''),
      usage: usage ? `${usage.input_tokens ?? '?'} in / ${usage.output_tokens ?? '?'} out / ${usage.cache_read_input_tokens ?? 0} cache-read${cost}` : undefined,
    }
  },
}

// --- Codex ---

interface CodexItem {
  id?: string
  type: string
  text?: string
  command?: string
  aggregated_output?: string
  exit_code?: number | null
  changes?: { path?: string; kind?: string }[]
  server?: string
  tool?: string
  arguments?: unknown
  result?: unknown
  error?: unknown
  query?: string
  message?: string
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/** Codex errors wrap API errors as JSON in the message */
function readableError(message: string): string {
  try {
    const parsed = JSON.parse(message)
    return parsed?.error?.message ?? parsed?.message ?? message
  } catch {
    return message
  }
}

const codexRunner: AgentRunner = {
  async runTurn(request) {
    // Images go in with -i (Codex keeps them in the session); PDFs are saved for Codex to read by path
    const files: Record<string, Buffer> = {}
    const images: string[] = []
    const texts: string[] = []
    for (const part of request.parts) {
      if (part.type === 'image') {
        const file = `image-${images.length + 1}.${IMAGE_EXTENSIONS[part.mimeType] ?? 'png'}`
        files[file] = Buffer.from(part.base64, 'base64')
        images.push(file)
        texts.push(`[Attached image ${images.length}]`)
      } else if (part.type === 'pdf') {
        await mkdir(request.attachmentsDir, { recursive: true })
        const path = join(request.attachmentsDir, `document-${Date.now()}-${texts.length}.pdf`)
        await writeFile(path, Buffer.from(part.base64, 'base64'))
        texts.push(`[PDF document: ${path}]`)
      } else {
        texts.push(part.text)
      }
    }

    let lastMessage = ''
    let sessionTotals: SessionTokenTotals | undefined
    let failure: string | null = null
    let lastError: string | null = null

    const onLine = (line: string) => {
      const event = parseJsonLine(line)
      if (!event) return
      const item = event.item as CodexItem | undefined
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
        request.onCliSessionId(event.thread_id)
      } else if (event.type === 'turn.completed') {
        // Totals for the whole thread so far, not just this turn
        const u = event.usage as { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number } | undefined
        if (u) sessionTotals = { input: u.input_tokens ?? 0, cachedInput: u.cached_input_tokens ?? 0, output: u.output_tokens ?? 0 }
      } else if (event.type === 'turn.failed') {
        failure = readableError((event.error as { message?: string })?.message ?? 'turn failed')
      } else if (event.type === 'error') {
        // Not necessarily fatal (e.g. a retried connection); turn.failed or the exit code says if it was
        lastError = readableError(String(event.message ?? 'error'))
        request.onEvent({ type: 'notice', text: lastError })
      } else if (event.type === 'item.started' && item) {
        if (item.type === 'command_execution') {
          request.onEvent({ type: 'tool_use', id: item.id, tool: 'shell', input: truncate(item.command ?? '') })
        } else if (item.type === 'mcp_tool_call') {
          request.onEvent({ type: 'tool_use', id: item.id, tool: `${item.server}.${item.tool}`, input: truncate(stringify(item.arguments ?? {})) })
        }
      } else if (event.type === 'item.completed' && item) {
        if (item.type === 'agent_message' && item.text?.trim()) {
          lastMessage = item.text
          request.onEvent({ type: 'text', text: item.text })
        } else if (item.type === 'command_execution') {
          request.onEvent({ type: 'tool_result', id: item.id, output: truncate(item.aggregated_output ?? ''), isError: item.exit_code !== 0 })
        } else if (item.type === 'mcp_tool_call') {
          const failed = item.error !== undefined && item.error !== null
          request.onEvent({ type: 'tool_result', id: item.id, output: truncate(stringify(failed ? item.error : item.result ?? '')), isError: failed })
        } else if (item.type === 'file_change') {
          const changes = (item.changes ?? []).map((c) => `${c.kind ?? 'change'} ${c.path ?? ''}`).join('\n')
          request.onEvent({ type: 'tool_use', id: item.id, tool: 'edit', input: truncate(changes) })
        } else if (item.type === 'web_search') {
          request.onEvent({ type: 'tool_use', id: item.id, tool: 'web_search', input: item.query ?? '' })
        } else if (item.type === 'error' && item.message) {
          request.onEvent({ type: 'notice', text: item.message })
        }
      }
    }

    const resume = request.cliSessionId
    const { stderr, exitCode } = await runCli({
      name: 'Codex',
      command: cliCommand('codex'),
      commandEnvVar: cliCommandEnvVar('codex'),
      cwd: request.cwd,
      args: (filesDir) => [
        'exec',
        ...(resume ? ['resume'] : []),
        '--json',
        '--skip-git-repo-check',
        // safe: edits only inside the working directory, sandboxed commands
        ...(request.permissions === 'full' ? ['--dangerously-bypass-approvals-and-sandbox'] : ['-c', 'sandbox_mode=workspace-write']),
        ...(request.model ? ['--model', request.model] : []),
        ...images.map((file) => `--image=${join(filesDir, file)}`),
        ...(resume ? [resume] : []),
        '-', // prompt on stdin
      ],
      files,
      stdin: texts.join('\n\n'),
      onStdoutLine: onLine,
      signal: request.signal,
      timeoutMs: request.timeoutMs,
    })

    if (failure) throw new CliError(`Codex: ${failure}`)
    if (exitCode !== 0) {
      console.error(`[Agent] Codex exited with code ${exitCode}. stderr: ${stderr.trim()}`)
      const detail = lastError ?? failureDetail(stderr)
      throw new CliError(`Codex failed (exit code ${exitCode})${detail ? `: ${detail}` : ''}`)
    }
    return { result: lastMessage, sessionTotals }
  },
}

export const AGENT_RUNNERS: Record<CliName, AgentRunner> = {
  'claude-code': claudeCodeRunner,
  codex: codexRunner,
}
