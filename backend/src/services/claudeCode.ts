import { query, Query } from '@anthropic-ai/claude-agent-sdk'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, resolve, relative } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { ResolvedContentItem } from './llmTypes.js'

// Track active conversations by requestId so they can be interrupted
const activeConversations = new Map<string, Query>()
const interruptedRequests = new Set<string>()

// Resolve cwd to the repo root (one directory up from backend/)
const __dirname = dirname(fileURLToPath(import.meta.url))
const CLAUDE_CODE_CWD = resolve(__dirname, '..', '..', '..')

export interface ClaudeCodeResult {
  result: string
  sessionId: string | null
}

export interface ActivityEvent {
  type: 'tool_use' | 'assistant_text' | 'status' | 'error'
  content: string
}

export function interruptQuery(requestId: string): boolean {
  const conversation = activeConversations.get(requestId)
  if (!conversation) return false
  interruptedRequests.add(requestId)
  conversation.interrupt()
  return true
}

export async function generateWithClaudeCode(
  items: ResolvedContentItem[],
  prompt: string,
  sessionId?: string | null,
  onActivity?: (event: ActivityEvent) => void,
  requestId?: string
): Promise<ClaudeCodeResult> {
  // Build a text prompt with content blocks described inline
  const parts: string[] = []

  // Save images to temp files so Claude Code can read them via its Read tool
  const tempDir = join(tmpdir(), 'canvas-images')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  for (const item of items) {
    if (item.type === 'text' && item.text) {
      parts.push(`[Text block]: ${item.text}`)
    } else if (item.type === 'image' && item.imageData) {
      const ext = item.imageData.mimeType.split('/')[1] || 'png'
      const tempFile = join(tempDir, `image-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
      writeFileSync(tempFile, Buffer.from(item.imageData.base64, 'base64'))
      console.log('[ClaudeCode] Saved image to temp file:', tempFile)
      parts.push(`[Image saved to: ${tempFile}] — Use the Read tool to view this image.`)
    }
  }

  parts.push(`\nUser request: ${prompt}`)

  const fullPrompt = parts.join('\n\n')

  console.log('[ClaudeCode] Starting query with prompt length:', fullPrompt.length)

  console.log('[ClaudeCode] Using cwd:', CLAUDE_CODE_CWD)

  const queryOptions: Record<string, unknown> = {
    cwd: CLAUDE_CODE_CWD,
    maxTurns: 50,
    systemPrompt: 'You are a coding assistant integrated into an infinite canvas application. The user sends you text and image content from their canvas along with a request. Respond with helpful, concise results. If the user asks you to create or modify files, do so. Return your final answer as plain text.',
    permissionMode: 'acceptEdits',
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task', 'WebSearch', 'WebFetch'],
    stderr: (data: string) => {
      console.error('[ClaudeCode stderr]', data.trim())
    },
  }

  if (sessionId) {
    console.log('[ClaudeCode] Resuming session:', sessionId)
    ;(queryOptions as Record<string, unknown>).resume = sessionId
  }

  const conversation = query({
    prompt: fullPrompt,
    options: queryOptions,
  })

  // Track the conversation so it can be interrupted
  if (requestId) {
    activeConversations.set(requestId, conversation)
  }

  let resultText = ''
  let capturedSessionId: string | null = null

  try {
  for await (const message of conversation) {
    console.log('[ClaudeCode] Message type:', message.type, 'subtype' in message ? message.subtype : '')

    // Capture session_id from any message that has it
    if ('session_id' in message && typeof (message as Record<string, unknown>).session_id === 'string') {
      capturedSessionId = (message as Record<string, unknown>).session_id as string
      console.log('[ClaudeCode] Captured session_id:', capturedSessionId)
    }

    if (message.type === 'result') {
      if (message.subtype === 'success') {
        resultText = message.result
        if ('session_id' in message && typeof (message as Record<string, unknown>).session_id === 'string') {
          capturedSessionId = (message as Record<string, unknown>).session_id as string
        }

        // Log full usage data for debugging
        console.log('[ClaudeCode] Usage:', JSON.stringify(message.usage))
        console.log('[ClaudeCode] ModelUsage:', JSON.stringify(message.modelUsage))
        console.log('[ClaudeCode] total_cost_usd:', message.total_cost_usd)

        // Emit usage summary
        if (onActivity) {
          const durationSec = (message.duration_ms / 1000).toFixed(1)
          const cost = message.total_cost_usd.toFixed(4)
          const turns = message.num_turns

          const modelLines: string[] = []
          for (const [model, usage] of Object.entries(message.modelUsage)) {
            // Shorten model ID: claude-sonnet-4-5-20250929 → sonnet-4-5
            const shortModel = model
              .replace(/^claude-/, '')
              .replace(/-\d{8}$/, '')
            const parts = [`${usage.inputTokens.toLocaleString()}in`, `${usage.outputTokens.toLocaleString()}out`]
            // Include cache tokens if present
            if (usage.cacheReadInputTokens > 0) parts.push(`${usage.cacheReadInputTokens.toLocaleString()}cache-read`)
            if (usage.cacheCreationInputTokens > 0) parts.push(`${usage.cacheCreationInputTokens.toLocaleString()}cache-write`)
            modelLines.push(`  ${shortModel}: ${parts.join(' / ')}`)
          }

          const summary = [
            `${turns} turns, ${durationSec}s, $${cost}`,
            ...modelLines,
          ].join('\n')

          onActivity({ type: 'status', content: summary })
        }
      } else {
        console.error('[ClaudeCode] Error result:', JSON.stringify(message, null, 2))
        // For max_turns, there may still be useful partial output in the last assistant message
        if (requestId && interruptedRequests.has(requestId)) {
          console.log('[ClaudeCode] Query interrupted — returning partial result')
          onActivity?.({ type: 'status', content: 'Stopped' })
          if (!resultText) resultText = '(Stopped by user)'
          break
        }
        if (message.subtype === 'error_max_turns') {
          console.log('[ClaudeCode] Hit max turns — returning whatever result text we have')
          onActivity?.({ type: 'status', content: 'Hit max turns limit' })
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
        onActivity?.({ type: 'assistant_text', content: resultText })
      }
      // Emit tool_use summaries from content blocks
      if (onActivity) {
        type ToolBlock = { type: 'tool_use'; name?: string; input?: Record<string, unknown> }
        const toolBlocks: ToolBlock[] = message.message.content
          .filter((b: { type: string }) => b.type === 'tool_use')
          .map((b: unknown) => b as ToolBlock)

        // Group consecutive Read calls into a single activity
        const readBlocks = toolBlocks.filter((b: ToolBlock) => b.name === 'Read')
        const otherBlocks = toolBlocks.filter((b: ToolBlock) => b.name !== 'Read')

        if (readBlocks.length > 0) {
          const lines = readBlocks.map((b: ToolBlock) => {
            const input = b.input || {}
            const filePath = String(input.file_path || '')
            const relPath = '/' + relative(CLAUDE_CODE_CWD, filePath).replace(/\\/g, '/')
            const limit = input.limit ? ` [${input.limit}]` : ''
            return relPath + limit
          })
          if (lines.length === 1) {
            onActivity({ type: 'tool_use', content: `Read: ${lines[0]}` })
          } else {
            onActivity({ type: 'tool_use', content: `Read:\n${lines.map((l: string) => `  ${l}`).join('\n')}` })
          }
        }

        for (const block of otherBlocks) {
          const name = block.name || 'tool'
          const input = block.input || {}

          if (name === 'Edit') {
            const filePath = String(input.file_path || '')
            const relPath = '/' + relative(CLAUDE_CODE_CWD, filePath).replace(/\\/g, '/')
            const oldStr = String(input.old_string || '')
            const newStr = String(input.new_string || '')
            const removed = oldStr ? oldStr.split('\n').length : 0
            const added = newStr ? newStr.split('\n').length : 0
            onActivity({ type: 'tool_use', content: `Edit: ${relPath} [-${removed}/+${added}]` })
          } else if (name === 'Bash') {
            const desc = input.description ? String(input.description) : ''
            const cmd = input.command ? String(input.command) : ''
            const parts = [desc, cmd].filter(Boolean)
            onActivity({ type: 'tool_use', content: `Bash: ${parts.join('\n')}` })
          } else {
            const inputStr = JSON.stringify(input)
            const summary = inputStr.length > 120 ? inputStr.slice(0, 120) + '...' : inputStr
            onActivity({ type: 'tool_use', content: `${name}: ${summary}` })
          }
        }
      }
    } else if (message.type === 'system' && 'subtype' in message) {
      const subtype = (message as Record<string, unknown>).subtype as string
      if (subtype === 'init') {
        onActivity?.({ type: 'status', content: 'Session initialized' })
      } else {
        onActivity?.({ type: 'status', content: subtype })
      }
    }
  }

  } finally {
    if (requestId) {
      activeConversations.delete(requestId)
      interruptedRequests.delete(requestId)
    }
  }

  console.log('[ClaudeCode] Result length:', resultText.length, 'sessionId:', capturedSessionId)
  return { result: resultText, sessionId: capturedSessionId }
}
