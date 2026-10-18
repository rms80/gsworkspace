import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { existsSync, statSync } from 'fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { MODEL_ALIASES as CLAUDE_CODE_MODELS } from './claudeCode.js'
import { MODEL_IDS as CODEX_MODELS } from './codex.js'
import { AGENT_RUNNERS, AgentEventBody, PermissionLevel, SessionTokenTotals, TurnOutcome } from './agentRunners.js'
import { CLI_NAMES, CliName, cliCommand, cliLabel, cliStatus, detectClis } from './cliDetection.js'
import { CliError, INHERITED_SESSION_ENV } from './cliRunner.js'
import { PromptPart } from './llmProvider.js'
import { openTerminal } from './terminal.js'

/**
 * Persistent agent sessions: a conversation with Claude Code or Codex that belongs to an object in a
 * scene, where each message continues the conversation. Each turn runs the CLI headless and resumes
 * its saved session, so sessions survive server restarts.
 *
 * Session records (settings, turns and an event log) are JSON files on the server's disk, under
 * GSWS_AGENT_SESSIONS_DIR (default ~/.gsworkspace-agents), next to the working folders of sessions
 * that weren't given a directory. They're kept out of the workspace storage, as they only make sense
 * on the machine whose CLIs hold the sessions.
 */

const DEFAULT_TURN_TIMEOUT_SECONDS = 3600
const SAVE_INTERVAL_MS = 2000

export type TurnStatus = 'running' | 'completed' | 'failed' | 'interrupted'

export interface AgentTurn {
  id: string
  prompt: string
  status: TurnStatus
  startedAt: string
  finishedAt?: string
  result?: string
  error?: string
  usage?: string
}

/** Turn lifecycle plus what the agent did */
export type AgentEventData =
  | AgentEventBody
  | { type: 'turn_started'; prompt: string }
  | { type: 'turn_completed'; result: string }
  | { type: 'turn_failed'; error: string }
  | { type: 'turn_interrupted' }

/** An entry in the session's event log, numbered from 1 */
export type AgentEvent = { seq: number; turnId: string; time: string } & AgentEventData

export interface AgentSession {
  id: string
  workspace: string
  sceneId: string
  /** The scene object the session belongs to */
  itemId: string | null
  title: string | null
  agent: CliName
  /** App model name (e.g. claude-sonnet, gpt-sol); null for the CLI's default */
  model: string | null
  permissions: PermissionLevel
  cwd: string
  /** Whether cwd is the session's own folder (deleted with the session) */
  ownCwd: boolean
  /** The CLI's id for the conversation, set by the first turn */
  cliSessionId: string | null
  /** The session token totals the CLI last reported, for CLIs that report totals (Codex) */
  cliTokenTotals?: SessionTokenTotals | null
  status: 'idle' | 'running'
  createdAt: string
  updatedAt: string
  turns: AgentTurn[]
  events: AgentEvent[]
}

/** A session without its event log */
export type AgentSessionSummary = Omit<AgentSession, 'events'> & { eventCount: number }

/** An error with an HTTP status, for the routes */
export class AgentSessionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function rootDir(): string {
  return process.env.GSWS_AGENT_SESSIONS_DIR || join(homedir(), '.gsworkspace-agents')
}

const sessionsDir = () => join(rootDir(), 'sessions')
const sessionFile = (id: string) => join(sessionsDir(), `${id}.json`)
const ownWorkdir = (id: string) => join(rootDir(), 'workdirs', id)
const attachmentsDir = (id: string) => join(rootDir(), 'attachments', id)

function turnTimeoutMs(): number {
  const seconds = Number(process.env.GSWS_AGENT_TURN_TIMEOUT_SECONDS)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TURN_TIMEOUT_SECONDS) * 1000
}

// App model names each agent takes, mapped to the CLI's model names
const AGENT_MODELS: Record<CliName, Record<string, string>> = {
  'claude-code': CLAUDE_CODE_MODELS,
  codex: CODEX_MODELS,
}

const SESSION_ID_RE = /^[0-9a-f-]{36}$/

// --- Store ---

let sessions: Map<string, AgentSession> | null = null
let loading: Promise<Map<string, AgentSession>> | null = null
const running = new Map<string, { turnId: string; controller: AbortController }>()
const emitters = new Map<string, EventEmitter>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function loadAll(): Promise<Map<string, AgentSession>> {
  if (sessions) return sessions
  loading ??= (async () => {
    const map = new Map<string, AgentSession>()
    await mkdir(sessionsDir(), { recursive: true })
    for (const name of await readdir(sessionsDir())) {
      if (!name.endsWith('.json')) continue
      try {
        const session = JSON.parse(await readFile(join(sessionsDir(), name), 'utf-8')) as AgentSession
        // A turn still marked running was cut off when the server stopped
        if (session.status === 'running') {
          for (const turn of session.turns.filter((t) => t.status === 'running')) {
            turn.status = 'failed'
            turn.error = 'The server stopped while this turn was running.'
            turn.finishedAt = session.updatedAt
          }
          session.status = 'idle'
          await writeSession(session)
        }
        map.set(session.id, session)
      } catch (error) {
        console.error(`[Agent] Could not read session file ${name}:`, error)
      }
    }
    sessions = map
    return map
  })()
  return loading
}

/** Writes the session's file atomically */
async function writeSession(session: AgentSession): Promise<void> {
  await mkdir(sessionsDir(), { recursive: true })
  const file = sessionFile(session.id)
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(session, null, 1))
  await rename(temp, file)
}

async function save(session: AgentSession): Promise<void> {
  const timer = saveTimers.get(session.id)
  if (timer) clearTimeout(timer)
  saveTimers.delete(session.id)
  session.updatedAt = new Date().toISOString()
  await writeSession(session).catch((error) => console.error(`[Agent] Could not save session ${session.id}:`, error))
}

/** Saves soon, coalescing the many changes during a running turn */
function saveSoon(session: AgentSession): void {
  if (saveTimers.has(session.id)) return
  saveTimers.set(session.id, setTimeout(() => void save(session), SAVE_INTERVAL_MS))
}

function emitter(id: string): EventEmitter {
  let e = emitters.get(id)
  if (!e) {
    e = new EventEmitter()
    e.setMaxListeners(0)
    emitters.set(id, e)
  }
  return e
}

function addEvent(session: AgentSession, turnId: string, data: AgentEventData): AgentEvent {
  const event: AgentEvent = { ...data, seq: session.events.length + 1, turnId, time: new Date().toISOString() }
  session.events.push(event)
  emitter(session.id).emit('event', event)
  return event
}

export function summarize(session: AgentSession): AgentSessionSummary {
  const { events, ...rest } = session
  return { ...rest, eventCount: events.length }
}

async function find(workspace: string, id: string): Promise<AgentSession> {
  const map = await loadAll()
  const session = SESSION_ID_RE.test(id) ? map.get(id) : undefined
  if (!session || session.workspace !== workspace) throw new AgentSessionError('Session not found', 404)
  return session
}

// --- API ---

export async function listSessions(workspace: string, filter: { sceneId?: string; itemId?: string }): Promise<AgentSessionSummary[]> {
  const map = await loadAll()
  return [...map.values()]
    .filter((s) => s.workspace === workspace)
    .filter((s) => !filter.sceneId || s.sceneId === filter.sceneId)
    .filter((s) => !filter.itemId || s.itemId === filter.itemId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(summarize)
}

export async function getSession(workspace: string, id: string): Promise<AgentSession> {
  return find(workspace, id)
}

export interface CreateSessionOptions {
  sceneId: string
  itemId?: string | null
  title?: string | null
  agent: string
  model?: string | null
  permissions?: string
  /** An existing directory on the server; if omitted, the session gets its own folder */
  cwd?: string | null
}

export async function createSession(workspace: string, options: CreateSessionOptions): Promise<AgentSession> {
  if (!options.sceneId || typeof options.sceneId !== 'string') {
    throw new AgentSessionError('sceneId is required', 400)
  }
  if (!CLI_NAMES.includes(options.agent as CliName)) {
    throw new AgentSessionError(`agent must be one of: ${CLI_NAMES.join(', ')}`, 400)
  }
  const agent = options.agent as CliName
  const model = options.model || null
  if (model && !(model in AGENT_MODELS[agent])) {
    throw new AgentSessionError(`${cliLabel(agent)} sessions take these models: ${Object.keys(AGENT_MODELS[agent]).join(', ')}`, 400)
  }
  const permissions = (options.permissions || 'safe') as PermissionLevel
  if (permissions !== 'safe' && permissions !== 'full') {
    throw new AgentSessionError('permissions must be "safe" or "full"', 400)
  }

  await detectClis()
  const status = cliStatus(agent)
  if (!status.available) {
    throw new AgentSessionError(`${cliLabel(agent)} isn't available on this server: ${status.problem}`, 503)
  }

  const id = randomUUID()
  let cwd: string
  let ownCwd = false
  if (options.cwd) {
    if (!isAbsolute(options.cwd)) throw new AgentSessionError('cwd must be an absolute path', 400)
    cwd = resolve(options.cwd)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      throw new AgentSessionError(`Directory does not exist: ${cwd}`, 400)
    }
  } else {
    cwd = ownWorkdir(id)
    await mkdir(cwd, { recursive: true })
    ownCwd = true
  }

  const now = new Date().toISOString()
  const session: AgentSession = {
    id,
    workspace,
    sceneId: options.sceneId,
    itemId: options.itemId || null,
    title: options.title || null,
    agent,
    model,
    permissions,
    cwd,
    ownCwd,
    cliSessionId: null,
    cliTokenTotals: null,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    turns: [],
    events: [],
  }
  ;(await loadAll()).set(id, session)
  await save(session)
  console.log(`[Agent] Created ${cliLabel(agent)} session ${id} (${permissions}) in ${cwd}`)
  return session
}

export async function updateSession(workspace: string, id: string, changes: { title?: string | null; itemId?: string | null }): Promise<AgentSession> {
  const session = await find(workspace, id)
  if (changes.title !== undefined) session.title = changes.title || null
  if (changes.itemId !== undefined) session.itemId = changes.itemId || null
  await save(session)
  return session
}

export async function deleteSession(workspace: string, id: string): Promise<void> {
  const session = await find(workspace, id)
  running.get(id)?.controller.abort()
  ;(await loadAll()).delete(id)
  const timer = saveTimers.get(id)
  if (timer) clearTimeout(timer)
  saveTimers.delete(id)
  emitters.delete(id)
  await rm(sessionFile(id), { force: true })
  await rm(attachmentsDir(id), { recursive: true, force: true })
  // Only the session's own folder; a directory it was given belongs to someone else
  if (session.ownCwd) await rm(session.cwd, { recursive: true, force: true }).catch(() => {})
  console.log(`[Agent] Deleted session ${id}`)
}

/** Starts a turn; it runs in the background, reporting through the event log */
export async function sendMessage(workspace: string, id: string, prompt: string, parts: PromptPart[]): Promise<AgentTurn> {
  const session = await find(workspace, id)
  if (session.status === 'running') {
    throw new AgentSessionError('The session is already running a turn. Wait for it or interrupt it.', 409)
  }
  await detectClis()
  const status = cliStatus(session.agent)
  if (!status.available) {
    throw new AgentSessionError(`${cliLabel(session.agent)} isn't available on this server: ${status.problem}`, 503)
  }
  if (!existsSync(session.cwd)) {
    throw new AgentSessionError(`The session's directory no longer exists: ${session.cwd}`, 409)
  }

  const turn: AgentTurn = { id: randomUUID(), prompt, status: 'running', startedAt: new Date().toISOString() }
  const controller = new AbortController()
  session.turns.push(turn)
  session.status = 'running'
  running.set(id, { turnId: turn.id, controller })
  addEvent(session, turn.id, { type: 'turn_started', prompt })
  await save(session)

  void runTurn(session, turn, parts, controller)
  return turn
}

async function runTurn(session: AgentSession, turn: AgentTurn, parts: PromptPart[], controller: AbortController) {
  const label = `${cliLabel(session.agent)} session ${session.id}`
  console.log(`[Agent] ${label}: turn ${turn.id} started`)
  try {
    const outcome = await AGENT_RUNNERS[session.agent].runTurn({
      cwd: session.cwd,
      attachmentsDir: attachmentsDir(session.id),
      model: session.model ? AGENT_MODELS[session.agent][session.model] : null,
      permissions: session.permissions,
      cliSessionId: session.cliSessionId,
      parts,
      signal: controller.signal,
      timeoutMs: turnTimeoutMs(),
      onEvent: (body) => {
        addEvent(session, turn.id, body)
        saveSoon(session)
      },
      onCliSessionId: (cliSessionId) => {
        session.cliSessionId = cliSessionId
      },
    })
    turn.status = 'completed'
    turn.result = outcome.result
    turn.usage = turnUsage(session, outcome)
    addEvent(session, turn.id, { type: 'turn_completed', result: outcome.result })
    console.log(`[Agent] ${label}: turn ${turn.id} completed${turn.usage ? ` | ${turn.usage}` : ''}`)
  } catch (error) {
    if (controller.signal.aborted) {
      turn.status = 'interrupted'
      addEvent(session, turn.id, { type: 'turn_interrupted' })
      console.log(`[Agent] ${label}: turn ${turn.id} interrupted`)
    } else {
      const message = error instanceof CliError ? error.message : `${cliLabel(session.agent)} failed. Check the server logs for details.`
      turn.status = 'failed'
      turn.error = message
      addEvent(session, turn.id, { type: 'turn_failed', error: message })
      console.error(`[Agent] ${label}: turn ${turn.id} failed:`, error)
    }
  } finally {
    turn.finishedAt = new Date().toISOString()
    session.status = 'idle'
    running.delete(session.id)
    // Skip if the session was deleted while running
    if ((await loadAll()).has(session.id)) await save(session)
  }
}

/**
 * This turn's usage summary. For a CLI that reports session totals, it's the change since the last
 * totals; a turn that failed or was interrupted reports none, so its usage lands in the next turn's.
 */
function turnUsage(session: AgentSession, outcome: TurnOutcome): string | undefined {
  const totals = outcome.sessionTotals
  if (!totals) return outcome.usage
  const previous = session.cliTokenTotals
  session.cliTokenTotals = totals
  // Lower totals than last time mean the CLI started counting again
  const fresh = !previous || totals.input < previous.input
  const input = fresh ? totals.input : totals.input - previous.input
  const cachedInput = fresh ? totals.cachedInput : totals.cachedInput - previous.cachedInput
  const output = fresh ? totals.output : totals.output - previous.output
  return `${input} in / ${output} out / ${cachedInput} cached`
}

/** Stops the running turn, if any */
export async function interruptSession(workspace: string, id: string): Promise<boolean> {
  await find(workspace, id)
  const run = running.get(id)
  if (!run) return false
  run.controller.abort()
  return true
}

/**
 * Opens a terminal on the server's desktop that resumes the session in the CLI, interactively, in
 * the session's folder. Turns taken there continue the CLI's session, but aren't in this one's log.
 */
export async function openSessionInTerminal(workspace: string, id: string): Promise<void> {
  const session = await find(workspace, id)
  if (!session.cliSessionId) throw new AgentSessionError('The session has no conversation to resume yet. Send a message first.', 409)
  if (!/^[\w-]+$/.test(session.cliSessionId)) throw new AgentSessionError('The session id is not valid.', 500)
  // Two clients on one conversation at once would interleave turns
  if (session.status === 'running') throw new AgentSessionError('Wait for the running turn to finish (or stop it) first.', 409)
  if (!existsSync(session.cwd)) throw new AgentSessionError(`The session's folder no longer exists: ${session.cwd}`, 409)

  const isClaude = session.agent === 'claude-code'
  await openTerminal({
    title: `${cliLabel(session.agent)}: ${session.title || 'session'}`,
    cwd: session.cwd,
    command: cliCommand(session.agent),
    args: isClaude ? ['--resume', session.cliSessionId] : ['resume', session.cliSessionId],
    // Like headless turns, use the CLI's logged-in account rather than the server's API key
    unset: [...INHERITED_SESSION_ENV, ...(isClaude ? ['ANTHROPIC_API_KEY'] : [])],
  }, `${session.agent}-${session.id}`)
  console.log(`[Agent] Opened ${cliLabel(session.agent)} session ${session.id} in a terminal`)
}

/** Events after `afterSeq` (0 for all) */
export async function getEvents(workspace: string, id: string, afterSeq: number): Promise<AgentEvent[]> {
  const session = await find(workspace, id)
  return session.events.filter((e) => e.seq > afterSeq)
}

/** Calls `listener` with each new event; returns the unsubscribe function */
export async function subscribe(workspace: string, id: string, listener: (event: AgentEvent) => void): Promise<() => void> {
  await find(workspace, id)
  const e = emitter(id)
  e.on('event', listener)
  return () => e.off('event', listener)
}
