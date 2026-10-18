import { NextFunction, Request, Response, Router } from 'express'
import {
  AgentSessionError,
  createSession,
  deleteSession,
  getEvents,
  getSession,
  interruptSession,
  listSessions,
  openSessionInTerminal,
  sendMessage,
  subscribe,
  summarize,
  updateSession,
} from '../services/agentSessions.js'
import { FolderNotFoundError, FolderPickerBusyError, FolderPickerUnavailableError, openFolder, pickFolder } from '../services/folderPicker.js'
import { itemsToParts } from '../services/llmProvider.js'
import { TerminalUnavailableError } from '../services/terminal.js'
import { LLMRequestItem, resolveItems } from '../services/llmTypes.js'

/**
 * Persistent Claude Code / Codex sessions (see services/agentSessions.ts).
 *
 *   GET    /                     list sessions (?sceneId=&itemId=)
 *   POST   /                     create { sceneId, itemId?, title?, agent, model?, permissions?, cwd? }
 *   GET    /:id                  the session with its turns (?events=true adds the event log)
 *   PATCH  /:id                  { title?, itemId? }
 *   DELETE /:id                  delete (stops a running turn; deletes the session's own folder)
 *   POST   /:id/messages         { prompt, items? } starts a turn -> 202 { turn }
 *   POST   /:id/interrupt        stop the running turn -> { interrupted }
 *   GET    /:id/events?after=N   events after seq N, as JSON
 *   GET    /:id/stream?after=N   events after seq N, then live, as server-sent events
 *   POST   /pick-folder          { start? } opens a folder dialog on the server -> { path | null }
 *   POST   /open-folder          { path } shows a folder in the server's file manager
 *   POST   /:id/open-terminal    resumes the session in the CLI in a terminal on the server
 *
 * Sessions run tools on the server (shell commands, file edits, MCP servers), so these routes only
 * answer requests from the server's own machine unless GSWS_AGENT_SESSIONS_ALLOW_REMOTE=true.
 */

const router = Router({ mergeParams: true })

const HEARTBEAT_MS = 15000

function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function requireAllowedClient(req: Request, res: Response, next: NextFunction) {
  if (process.env.GSWS_AGENT_SESSIONS_ALLOW_REMOTE === 'true' || isLocalRequest(req)) return next()
  res.status(403).json({ error: 'Agent sessions are only available from the server machine. Set GSWS_AGENT_SESSIONS_ALLOW_REMOTE=true in the backend .env file to allow remote access.' })
}

router.use(requireAllowedClient)

// The server's desktop is only any use to a browser on the same machine
function requireLocalClient(req: Request, res: Response, next: NextFunction) {
  if (isLocalRequest(req)) return next()
  res.status(403).json({ error: 'Only available from the server machine.' })
}

const workspaceOf = (req: Request) => (req.params as Record<string, string>).workspace

function sendError(res: Response, label: string, error: unknown) {
  if (error instanceof AgentSessionError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  console.error(`[Agent] Error ${label}:`, error)
  res.status(500).json({ error: error instanceof Error ? error.message : `Failed ${label}` })
}

function afterParam(req: Request): number {
  // An EventSource reconnecting sends the last id it got, which is newer than the URL's `after`
  const header = req.headers['last-event-id']
  const value = Number(typeof header === 'string' && header ? header : req.query.after ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

router.get('/', async (req, res) => {
  try {
    const { sceneId, itemId } = req.query as { sceneId?: string; itemId?: string }
    res.json({ sessions: await listSessions(workspaceOf(req), { sceneId, itemId }) })
  } catch (error) {
    sendError(res, 'listing sessions', error)
  }
})

router.post('/', async (req, res) => {
  try {
    const session = await createSession(workspaceOf(req), req.body ?? {})
    res.status(201).json({ session: summarize(session) })
  } catch (error) {
    sendError(res, 'creating session', error)
  }
})

// Opens a folder dialog on the server's desktop -> { path } (null if cancelled)
router.post('/pick-folder', requireLocalClient, async (req, res) => {
  try {
    const { start } = (req.body ?? {}) as { start?: string | null }
    res.json({ path: await pickFolder(typeof start === 'string' && start ? start : null) })
  } catch (error) {
    if (error instanceof FolderPickerUnavailableError) {
      return res.status(501).json({ error: `No folder dialog is available on the server: ${error.message}` })
    }
    if (error instanceof FolderPickerBusyError) return res.status(409).json({ error: error.message })
    sendError(res, 'picking folder', error)
  }
})

router.post('/open-folder', requireLocalClient, async (req, res) => {
  try {
    const { path } = (req.body ?? {}) as { path?: string }
    if (!path || typeof path !== 'string') return res.status(400).json({ error: 'path is required' })
    await openFolder(path)
    res.json({ success: true })
  } catch (error) {
    if (error instanceof FolderNotFoundError) return res.status(400).json({ error: error.message })
    if (error instanceof FolderPickerUnavailableError) {
      return res.status(501).json({ error: `No file manager is available on the server: ${error.message}` })
    }
    sendError(res, 'opening folder', error)
  }
})

router.get('/:id', async (req, res) => {
  try {
    const session = await getSession(workspaceOf(req), req.params.id)
    res.json({ session: req.query.events === 'true' ? session : summarize(session) })
  } catch (error) {
    sendError(res, 'getting session', error)
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { title, itemId } = (req.body ?? {}) as { title?: string | null; itemId?: string | null }
    const session = await updateSession(workspaceOf(req), req.params.id, { title, itemId })
    res.json({ session: summarize(session) })
  } catch (error) {
    sendError(res, 'updating session', error)
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await deleteSession(workspaceOf(req), req.params.id)
    res.json({ success: true })
  } catch (error) {
    sendError(res, 'deleting session', error)
  }
})

router.post('/:id/messages', async (req, res) => {
  try {
    const { prompt, items } = (req.body ?? {}) as { prompt?: string; items?: LLMRequestItem[] }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' })
    }
    const workspace = workspaceOf(req)
    // Check the session exists before loading attachments
    await getSession(workspace, req.params.id)
    const resolved = await resolveItems(workspace, Array.isArray(items) ? items : [])
    const parts = [...itemsToParts(resolved), { type: 'text' as const, text: prompt }]
    const turn = await sendMessage(workspace, req.params.id, prompt, parts)
    res.status(202).json({ turn })
  } catch (error) {
    sendError(res, 'sending message', error)
  }
})

router.post('/:id/open-terminal', requireLocalClient, async (req, res) => {
  try {
    await openSessionInTerminal(workspaceOf(req), req.params.id)
    res.json({ success: true })
  } catch (error) {
    if (error instanceof TerminalUnavailableError) {
      return res.status(501).json({ error: `No terminal is available on the server: ${error.message}` })
    }
    sendError(res, 'opening terminal', error)
  }
})

router.post('/:id/interrupt', async (req, res) => {
  try {
    res.json({ interrupted: await interruptSession(workspaceOf(req), req.params.id) })
  } catch (error) {
    sendError(res, 'interrupting session', error)
  }
})

router.get('/:id/events', async (req, res) => {
  try {
    const workspace = workspaceOf(req)
    const session = await getSession(workspace, req.params.id)
    res.json({ status: session.status, events: await getEvents(workspace, req.params.id, afterParam(req)) })
  } catch (error) {
    sendError(res, 'getting events', error)
  }
})

router.get('/:id/stream', async (req, res) => {
  const workspace = workspaceOf(req)
  const id = req.params.id
  try {
    await getSession(workspace, id)
  } catch (error) {
    return sendError(res, 'streaming events', error)
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (event: { seq: number }) => res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)

  // Subscribe, then replay from the log. Events are logged before they're emitted, so ones that
  // arrive before the replay are in it; the listener only sends what comes after.
  let lastSent = afterParam(req)
  let replaying = true
  const unsubscribe = await subscribe(workspace, id, (event) => {
    if (replaying || event.seq <= lastSent) return
    lastSent = event.seq
    send(event)
  })
  const session = await getSession(workspace, id)
  for (const event of session.events) {
    if (event.seq <= lastSent) continue
    lastSent = event.seq
    send(event)
  }
  replaying = false

  // Comments keep proxies from closing an idle stream
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  res.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

export default router
