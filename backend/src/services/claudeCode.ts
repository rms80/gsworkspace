import { CLAUDE_MODELS, ClaudeModel, toAnthropicContent } from './claude.js'
import { cliCommand, cliCommandEnvVar, cliStatus, cliUnavailableReason } from './cliDetection.js'
import { CliError, runCli } from './cliRunner.js'
import { TextProvider, logRequest, logResponse } from './llmProvider.js'

/**
 * Claude models through the Claude Code CLI in headless mode (`claude -p`), using whatever account
 * the CLI on the server is logged in with instead of an API key.
 *
 * Each request is a single-shot query: no tools, MCP servers or skills, nothing saved as a session.
 * The prompt goes in on stdin as one stream-json user message, which takes the same content blocks
 * as the Anthropic API, so images and PDFs pass straight through.
 */

// Aliases resolve to the latest model of each tier
const MODEL_ALIASES: Record<ClaudeModel, string> = {
  'claude-haiku': 'haiku',
  'claude-sonnet': 'sonnet',
  'claude-opus': 'opus',
}

// Replaces Claude Code's own coding-agent system prompt when the request has none
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'

const SYSTEM_PROMPT_FILE = 'system-prompt.txt'

interface ResultMessage {
  type: 'result'
  subtype: string
  is_error: boolean
  result?: string
  api_error_status?: number | null
  duration_ms?: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
}

/** The CLI's final message, which holds the answer (or the error) */
function findResult(stdout: string): ResultMessage | null {
  const lines = stdout.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const message = JSON.parse(line)
      if (message.type === 'result') return message
    } catch {
      // Not a JSON line
    }
  }
  return null
}

function usageSummary(result: ResultMessage): string {
  const usage = result.usage ?? {}
  const parts = [`${usage.input_tokens ?? '?'} in`, `${usage.output_tokens ?? '?'} out`]
  if (usage.cache_read_input_tokens) parts.push(`${usage.cache_read_input_tokens} cache-read`)
  if (usage.cache_creation_input_tokens) parts.push(`${usage.cache_creation_input_tokens} cache-write`)
  const cost = result.total_cost_usd !== undefined ? ` | cost: $${result.total_cost_usd.toFixed(4)}` : ''
  const duration = result.duration_ms !== undefined ? ` | ${(result.duration_ms / 1000).toFixed(1)}s` : ''
  return `tokens: ${parts.join(' / ')}${cost}${duration}`
}

export const claudeCodeProvider: TextProvider = {
  name: 'Claude Code',
  models: CLAUDE_MODELS,

  isAvailable: () => cliStatus('claude-code').available,

  unavailableReason: () => cliUnavailableReason('claude-code'),

  async generate(request) {
    const model = MODEL_ALIASES[request.model as ClaudeModel]
    logRequest(this.name, request, model)

    const input = { type: 'user', message: { role: 'user', content: toAnthropicContent(request.parts) } }
    const { stdout, stderr, exitCode } = await runCli({
      name: this.name,
      command: cliCommand('claude-code'),
      commandEnvVar: cliCommandEnvVar('claude-code'),
      args: [
        '--print',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose', // required by stream-json output
        '--no-session-persistence',
        '--tools', '',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--model', model,
        '--system-prompt-file', SYSTEM_PROMPT_FILE,
      ],
      files: { [SYSTEM_PROMPT_FILE]: request.system || DEFAULT_SYSTEM_PROMPT },
      stdin: JSON.stringify(input) + '\n',
      // Claude Code prefers an ANTHROPIC_API_KEY in its environment over its logged-in account; the
      // point of this provider is to use the account, so don't pass on one from the server's env
      env: { ANTHROPIC_API_KEY: undefined },
      signal: request.signal,
    })

    const result = findResult(stdout)
    if (!result) {
      const detail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
      console.error(`[Claude Code] exited with code ${exitCode} and no result. stderr: ${stderr.trim()}`)
      throw new CliError(`Claude Code failed (exit code ${exitCode})${detail ? `: ${detail}` : ''}`)
    }
    if (result.is_error || result.subtype !== 'success') {
      const status = result.api_error_status ? ` (status ${result.api_error_status})` : ''
      throw new CliError(`Claude Code request failed${status}: ${result.result || result.subtype}`)
    }

    const text = result.result ?? ''
    logResponse(this.name, request.operation, `${usageSummary(result)} | result: ${text.length} chars`)
    return text
  },

  errorMessage(error) {
    if (error instanceof CliError) return error.message
    return 'Claude Code request failed. Check the server logs for details.'
  },
}
