import { ACTIVE_WORKSPACE } from './workspace'
import { ContentItem, toBackendItems } from './llm'
import { AgentPermissions, CodingAgent, LLMModel } from '../types'

/**
 * Client for the backend's persistent agent sessions (backend/src/routes/agentSessions.ts): a
 * headless Claude Code or Codex conversation the server runs and keeps, with an event log the UI
 * replays and follows. Online mode only.
 */

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/agent-sessions`

export type AgentTurnStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/** An entry in a session's event log, numbered from 1 */
export type AgentEvent = { seq: number; turnId: string; time: string } & (
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id?: string; tool: string; input: string }
  | { type: 'tool_result'; id?: string; output: string; isError?: boolean }
  | { type: 'notice'; text: string }
  | { type: 'turn_started'; prompt: string }
  | { type: 'turn_completed'; result: string }
  | { type: 'turn_failed'; error: string }
  | { type: 'turn_interrupted' }
)

export interface AgentSessionSummary {
  id: string
  agent: CodingAgent
  model: string | null
  permissions: AgentPermissions
  cwd: string
  cliSessionId: string | null
  status: 'idle' | 'running'
}

/** Thrown for a session the server doesn't have (deleted, or another server's) */
export class AgentSessionNotFoundError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    const message = data.error || `Agent session request failed: ${response.status} ${response.statusText}`
    if (response.status === 404) throw new AgentSessionNotFoundError(message)
    throw new Error(message)
  }
  return response.json()
}

export async function createAgentSession(options: {
  sceneId: string
  itemId: string
  title: string
  agent: CodingAgent
  model: LLMModel | null
  permissions: AgentPermissions
  cwd: string | null
}): Promise<AgentSessionSummary> {
  const data = await request<{ session: AgentSessionSummary }>('', { method: 'POST', body: JSON.stringify(options) })
  return data.session
}

/** Sessions that belong to a scene object, oldest first */
export async function listAgentSessions(filter: { sceneId: string; itemId: string }): Promise<AgentSessionSummary[]> {
  const query = new URLSearchParams(filter).toString()
  const data = await request<{ sessions: AgentSessionSummary[] }>(`?${query}`)
  return data.sessions
}

export async function getAgentSession(id: string): Promise<AgentSessionSummary> {
  const data = await request<{ session: AgentSessionSummary }>(`/${encodeURIComponent(id)}`)
  return data.session
}

export async function deleteAgentSession(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Starts a turn; follow it with getAgentEvents / streamAgentEvents */
export async function sendAgentMessage(id: string, prompt: string, items: ContentItem[]): Promise<void> {
  await request(`/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ prompt, items: toBackendItems(items) }),
  })
}

export async function interruptAgentSession(id: string): Promise<boolean> {
  const data = await request<{ interrupted: boolean }>(`/${encodeURIComponent(id)}/interrupt`, { method: 'POST' })
  return data.interrupted
}

/** Events after seq `after` (0 for all), and whether a turn is running */
export async function getAgentEvents(id: string, after = 0): Promise<{ status: 'idle' | 'running'; events: AgentEvent[] }> {
  return request(`/${encodeURIComponent(id)}/events?after=${after}`)
}

/**
 * Calls `onEvent` with each event after seq `after`, then live ones, until closed. EventSource
 * reconnects by itself, resuming after the last event it got.
 */
export function streamAgentEvents(id: string, after: number, onEvent: (event: AgentEvent) => void): () => void {
  const source = new EventSource(`${API_BASE}/${encodeURIComponent(id)}/stream?after=${after}`)
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as AgentEvent)
    } catch (err) {
      console.error('Bad agent session event:', err)
    }
  }
  return () => source.close()
}

/** No folder dialog can be shown on the server (no desktop, or not allowed); type the path instead */
export class FolderPickerUnavailableError extends Error {}

/**
 * Opens a folder dialog on the server's desktop (the browser never reveals a picked folder's path).
 * Resolves with the chosen path, or null if cancelled; waits as long as the dialog is open.
 */
export async function pickServerFolder(start: string | null): Promise<string | null> {
  const response = await fetch(`${API_BASE}/pick-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start }),
  })
  const data = await response.json().catch(() => ({})) as { path?: string | null; error?: string }
  if (response.status === 501 || response.status === 403) {
    throw new FolderPickerUnavailableError(data.error || 'No folder dialog is available on the server')
  }
  if (!response.ok) throw new Error(data.error || `Folder dialog failed: ${response.statusText}`)
  return data.path ?? null
}

/** Shows a folder in the server's file manager (only for a browser on the server machine) */
export async function openServerFolder(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}/open-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || `Could not open the folder: ${response.statusText}`)
  }
}

/** Opens a terminal on the server that resumes the session in its CLI (browser on the server machine only) */
export async function openAgentSessionTerminal(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}/open-terminal`, { method: 'POST' })
}
