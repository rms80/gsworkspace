import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { CanvasItem, ChatMessage, ActivityMessage, CodingRobotItem, Scene } from '../types'
import { ContentItem } from '../api/llm'
import {
  AgentEvent,
  AgentSessionNotFoundError,
  AgentSessionSummary,
  createAgentSession,
  deleteAgentSession,
  getAgentEvents,
  getAgentSession,
  listAgentSessions,
  interruptAgentSession,
  sendAgentMessage,
  streamAgentEvents,
} from '../api/agentSessions'
import { playNotificationSound } from '../utils/sound'

/**
 * Connects Coding Robot items to backend agent sessions: headless Claude Code / Codex conversations
 * that the server runs and keeps. The server holds the transcript as an event log; this hook loads
 * it for each robot in the scene and follows it live while a turn runs.
 */

/** What a robot's overlay shows, derived from its session's event log */
export interface CodingRobotSessionView {
  messages: ChatMessage[]
  /** One step per turn */
  activitySteps: ActivityMessage[][]
  session: AgentSessionSummary | null
  /** A problem with the session itself (couldn't load, couldn't send) */
  notice: string | null
}

interface RobotState {
  sessionId: string
  events: AgentEvent[]
  session: AgentSessionSummary | null
  /** The server doesn't have this session; the next message starts a new one */
  missing: boolean
  notice: string | null
}

interface UseCodingRobotManagerParams {
  activeSceneId: string | null
  activeScene: Scene | undefined
  items: CanvasItem[]
  selectedIds: string[]
  updateActiveSceneItems: (updater: (items: CanvasItem[]) => CanvasItem[]) => void
}

interface UseCodingRobotManagerResult {
  runningCodingRobotIds: Set<string>
  codingRobotSessions: Map<string, CodingRobotSessionView>
  handleSendCodingRobotMessage: (itemId: string, message: string, messageFromSelection: boolean) => void
  handleStopCodingRobot: (itemId: string) => void
  handleNewCodingRobotSession: (itemId: string) => void
}

const lastSeq = (events: AgentEvent[]) => (events.length > 0 ? events[events.length - 1].seq : 0)

const isTerminal = (event: AgentEvent) =>
  event.type === 'turn_completed' || event.type === 'turn_failed' || event.type === 'turn_interrupted'

function isTurnRunning(events: AgentEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    if (isTerminal(events[i])) return false
    if (events[i].type === 'turn_started') return true
  }
  return false
}

function toActivity(event: AgentEvent): ActivityMessage | null {
  const base = { id: String(event.seq), timestamp: event.time }
  switch (event.type) {
    case 'turn_started': return { ...base, type: 'status', content: `Prompt: ${event.prompt}` }
    case 'text': return { ...base, type: 'assistant_text', content: event.text }
    case 'tool_use': return { ...base, type: 'tool_use', content: event.input ? `${event.tool}: ${event.input}` : event.tool }
    case 'tool_result': return event.output ? { ...base, type: event.isError ? 'error' : 'tool_result', content: event.output } : null
    case 'notice': return { ...base, type: 'status', content: event.text }
    case 'turn_completed': return null
    case 'turn_failed': return { ...base, type: 'error', content: event.error }
    case 'turn_interrupted': return { ...base, type: 'status', content: 'Interrupted' }
  }
}

function toView(state: RobotState): CodingRobotSessionView {
  const messages: ChatMessage[] = []
  const activitySteps: ActivityMessage[][] = []
  for (const event of state.events) {
    if (event.type === 'turn_started') {
      messages.push({ role: 'user', content: event.prompt, timestamp: event.time })
      activitySteps.push([])
    } else if (event.type === 'turn_completed') {
      messages.push({ role: 'assistant', content: event.result || '(no reply)', timestamp: event.time })
    } else if (event.type === 'turn_failed') {
      messages.push({ role: 'assistant', content: `Error: ${event.error}`, timestamp: event.time })
    } else if (event.type === 'turn_interrupted') {
      messages.push({ role: 'assistant', content: '(Interrupted)', timestamp: event.time })
    }
    const activity = toActivity(event)
    if (activity && activitySteps.length > 0) activitySteps[activitySteps.length - 1].push(activity)
  }
  return { messages, activitySteps, session: state.session, notice: state.notice }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error')

export function useCodingRobotManager({
  activeSceneId,
  activeScene,
  items,
  selectedIds,
  updateActiveSceneItems,
}: UseCodingRobotManagerParams): UseCodingRobotManagerResult {
  // Robot states live in a ref so async code reads the latest; `version` re-renders on change
  const statesRef = useRef(new Map<string, RobotState>())
  const [version, setVersion] = useState(0)
  // Robots between pressing Send and their turn starting
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const streamsRef = useRef(new Map<string, () => void>())
  // Bumped when the hook unmounts, so loads started before then are dropped
  const generationRef = useRef(0)
  // Robots already checked for a session to relink to
  const relinkCheckedRef = useRef(new Set<string>())

  const setState = useCallback((itemId: string, update: (state: RobotState | undefined) => RobotState | undefined) => {
    const next = update(statesRef.current.get(itemId))
    if (next) statesRef.current.set(itemId, next)
    else statesRef.current.delete(itemId)
    setVersion((v) => v + 1)
  }, [])

  const closeStream = useCallback((itemId: string) => {
    streamsRef.current.get(itemId)?.()
    streamsRef.current.delete(itemId)
  }, [])

  const refreshSummary = useCallback(async (itemId: string, sessionId: string) => {
    try {
      const session = await getAgentSession(sessionId)
      setState(itemId, (s) => (s?.sessionId === sessionId ? { ...s, session } : s))
    } catch {
      // The summary only adds the CLI session id and folder; the transcript still shows
    }
  }, [setState])

  /** Follows the session live from its last known event until the running turn ends */
  const openStream = useCallback((itemId: string, sessionId: string) => {
    closeStream(itemId)
    const after = lastSeq(statesRef.current.get(itemId)?.events ?? [])
    const close = streamAgentEvents(sessionId, after, (event) => {
      const state = statesRef.current.get(itemId)
      if (!state || state.sessionId !== sessionId) return
      if (event.seq <= lastSeq(state.events)) return
      setState(itemId, (s) => s && { ...s, events: [...s.events, event] })
      if (event.type === 'turn_started') {
        setSendingIds((prev) => {
          if (!prev.has(itemId)) return prev
          const next = new Set(prev)
          next.delete(itemId)
          return next
        })
      } else if (isTerminal(event)) {
        closeStream(itemId)
        void refreshSummary(itemId, sessionId)
        if (event.type === 'turn_completed') playNotificationSound()
      }
    })
    streamsRef.current.set(itemId, close)
  }, [closeStream, setState, refreshSummary])

  // Load the sessions of the scene's robots, and let go of robots no longer in it
  const robots = useMemo(
    () => (activeScene?.items ?? []).filter((item): item is CodingRobotItem => item.type === 'coding-robot'),
    [activeScene]
  )
  const robotSessionKey = robots.map((r) => `${r.id}:${r.agentSessionId ?? ''}`).join(',')

  useEffect(() => {
    const generation = generationRef.current
    const current = new Map(robots.map((r) => [r.id, r.agentSessionId ?? null]))

    for (const [itemId, state] of statesRef.current) {
      if (current.get(itemId) !== state.sessionId) {
        closeStream(itemId)
        setState(itemId, () => undefined)
      }
    }

    // A robot without a session may have lost the link to one the server still has for it (e.g. a
    // save that dropped it); relink to its newest. Checked once per robot.
    for (const [itemId, sessionId] of current) {
      if (sessionId || relinkCheckedRef.current.has(itemId) || !activeSceneId) continue
      relinkCheckedRef.current.add(itemId)
      listAgentSessions({ sceneId: activeSceneId, itemId })
        .then((sessions) => {
          const newest = sessions[sessions.length - 1]
          if (!newest || generationRef.current !== generation || statesRef.current.has(itemId)) return
          console.log(`[CodingRobot] Relinking ${itemId} to its session ${newest.id}`)
          updateActiveSceneItems((prev) => prev.map((item) =>
            item.id === itemId && item.type === 'coding-robot' && !item.agentSessionId
              ? { ...item, agentSessionId: newest.id }
              : item
          ))
        })
        .catch(() => {
          // Nothing to relink to (or no server); the robot starts a new session as usual
        })
    }

    for (const [itemId, sessionId] of current) {
      if (!sessionId || statesRef.current.has(itemId)) continue
      setState(itemId, () => ({ sessionId, events: [], session: null, missing: false, notice: null }))
      void (async () => {
        try {
          const [{ status, events }, session] = await Promise.all([getAgentEvents(sessionId), getAgentSession(sessionId)])
          if (generationRef.current !== generation || statesRef.current.get(itemId)?.sessionId !== sessionId) return
          setState(itemId, (s) => s && { ...s, events, session })
          if (status === 'running') openStream(itemId, sessionId)
        } catch (error) {
          if (generationRef.current !== generation) return
          const missing = error instanceof AgentSessionNotFoundError
          setState(itemId, (s) => s && {
            ...s,
            missing,
            notice: missing
              ? 'This session is no longer on the server. Sending a message starts a new one.'
              : `Could not load the session: ${errorMessage(error)}`,
          })
        }
      })()
    }
  }, [robotSessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const streams = streamsRef.current
    const states = statesRef.current
    const relinkChecked = relinkCheckedRef.current
    return () => {
      generationRef.current++
      streams.forEach((close) => close())
      streams.clear()
      states.clear()
      relinkChecked.clear()
    }
  }, [])

  const handleSendCodingRobotMessage = useCallback(async (itemId: string, message: string, messageFromSelection: boolean) => {
    const robot = items.find((item): item is CodingRobotItem => item.id === itemId && item.type === 'coding-robot')
    if (!robot || !activeSceneId) return

    // Selected items (other than the robot) go along as context
    const contentItems: ContentItem[] = items
      .filter((item) => selectedIds.includes(item.id) && item.id !== itemId)
      .map((item): ContentItem => {
        if (item.type === 'text') {
          // A message taken from the selected text already has it
          return { type: 'text', text: messageFromSelection ? '' : item.text }
        } else if (item.type === 'image') {
          return { type: 'image', id: item.id, sceneId: activeSceneId, useEdited: !!item.cropRect }
        } else if (item.type === 'pdf') {
          return { type: 'pdf', id: item.id, sceneId: activeSceneId }
        } else if (item.type === 'text-file') {
          return { type: 'text-file', id: item.id, sceneId: activeSceneId, fileFormat: item.fileFormat }
        } else if (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt' || item.type === 'coding-robot') {
          return { type: 'text', text: `[${item.label}]: ${item.text}` }
        } else if (item.type === 'html') {
          return { type: 'text', text: `[HTML Content]:\n${item.html}` }
        }
        return { type: 'text', text: '' }
      })
      .filter((item) => item.text || item.id)

    setSendingIds((prev) => new Set(prev).add(itemId))
    const doneSending = () => setSendingIds((prev) => {
      const next = new Set(prev)
      next.delete(itemId)
      return next
    })

    let sessionId = robot.agentSessionId ?? null
    try {
      if (!sessionId || statesRef.current.get(itemId)?.missing) {
        const session = await createAgentSession({
          sceneId: activeSceneId,
          itemId,
          title: robot.label,
          agent: robot.agent ?? 'claude-code',
          model: robot.agentModel ?? null,
          permissions: robot.permissions ?? 'safe',
          cwd: robot.rootDirectory?.trim() || null,
        })
        sessionId = session.id
        // Set before the item changes, so the load effect sees it's already loaded
        setState(itemId, () => ({ sessionId: session.id, events: [], session, missing: false, notice: null }))
        updateActiveSceneItems((prev) => prev.map((item) =>
          item.id === itemId ? { ...item, agentSessionId: session.id } : item
        ))
      } else {
        setState(itemId, (s) => s && { ...s, notice: null })
      }
      await sendAgentMessage(sessionId, message, contentItems)
      openStream(itemId, sessionId)
    } catch (error) {
      console.error('Failed to send coding robot message:', error)
      doneSending()
      const notice = `Could not send the message: ${errorMessage(error)}`
      if (sessionId && statesRef.current.get(itemId)?.sessionId === sessionId) {
        setState(itemId, (s) => s && { ...s, notice })
      } else {
        // No session to hang it on; show it until the next try
        setState(itemId, () => ({ sessionId: '', events: [], session: null, missing: true, notice }))
      }
    }
  }, [items, selectedIds, activeSceneId, updateActiveSceneItems, setState, openStream])

  const handleStopCodingRobot = useCallback((itemId: string) => {
    const state = statesRef.current.get(itemId)
    if (!state?.sessionId) return
    interruptAgentSession(state.sessionId).catch((error) => console.error('Failed to stop coding robot:', error))
  }, [])

  const handleNewCodingRobotSession = useCallback(async (itemId: string) => {
    const state = statesRef.current.get(itemId)
    // Don't relink to the session being deleted
    relinkCheckedRef.current.add(itemId)
    closeStream(itemId)
    setState(itemId, () => undefined)
    updateActiveSceneItems((prev) => prev.map((item) => {
      if (item.id !== itemId || item.type !== 'coding-robot') return item
      return { ...item, agentSessionId: null, chatHistory: [] }
    }))
    if (state?.sessionId && !state.missing) {
      await deleteAgentSession(state.sessionId).catch((error) => {
        if (!(error instanceof AgentSessionNotFoundError)) console.error('Failed to delete agent session:', error)
      })
    }
  }, [closeStream, setState, updateActiveSceneItems])

  const runningCodingRobotIds = useMemo(() => {
    const running = new Set(sendingIds)
    for (const [itemId, state] of statesRef.current) {
      if (isTurnRunning(state.events)) running.add(itemId)
    }
    return running
  }, [version, sendingIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const codingRobotSessions = useMemo(() => {
    const views = new Map<string, CodingRobotSessionView>()
    for (const [itemId, state] of statesRef.current) views.set(itemId, toView(state))
    return views
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    runningCodingRobotIds,
    codingRobotSessions,
    handleSendCodingRobotMessage,
    handleStopCodingRobot,
    handleNewCodingRobotSession,
  }
}
