import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { CodingRobotItem, ChatMessage, ActivityMessage, CodingAgent, AgentPermissions, LLMModel } from '../../../types'
import { CodingRobotSessionView } from '../../../hooks/useCodingRobotManager'
import CodingRobotFolderPopup from './CodingRobotFolderPopup'
import { browserIsOnServer, copyText } from '../../../utils/robotFolder'
import { openAgentSessionTerminal } from '../../../api/agentSessions'
import ChatMarkdown from './ChatMarkdown'
import {
  CODING_ROBOT_HEADER_HEIGHT,
  CODING_ROBOT_BORDER_WIDTH,
  CODING_ROBOT_INPUT_HEIGHT,
  CODING_ROBOT_SEND_BUTTON_WIDTH,
  CODING_ROBOT_THEME,
  CODING_ROBOT_ACTIVITY_PANEL_WIDTH,
  CODING_ROBOT_ACTIVITY_PANEL_GAP,
  Z_IFRAME_OVERLAY,
  BUTTON_HEIGHT,
  CODING_AGENT_LABELS,
  CODING_AGENT_MODELS,
  LLM_MODEL_LABELS,
} from '../../../constants/canvas'

const ACTIVITY_BORDER_COLORS: Record<ActivityMessage['type'], string> = {
  tool_use: '#3b82f6',
  tool_result: '#6b7280',
  assistant_text: '#22c55e',
  status: '#f59e0b',
  error: '#ef4444',
}

interface CodingRobotOverlayProps {
  item: CodingRobotItem
  stageScale: number
  stagePos: { x: number; y: number }
  isRunning: boolean
  isSelected: boolean
  isAnyDragActive: boolean
  transform?: { x: number; y: number; width: number; height: number }
  selectedTextContent: string
  contextSummaryLines?: string[]
  sessionView?: CodingRobotSessionView
  onSendMessage: (itemId: string, message: string, messageFromSelection: boolean) => void
  onStopMessage?: (itemId: string) => void
  onNewSession?: (itemId: string) => void
  /** The folder popup, when open for this robot */
  folderPrompt?: { notice: string | null; mode: 'edit' | 'locked' | 'message' } | null
  onOpenFolderPrompt?: (itemId: string) => void
  onCloseFolderPrompt?: () => void
  onUpdateItem: (id: string, changes: Partial<CodingRobotItem>) => void
  onSelectItems: (ids: string[]) => void
  selectedIds: string[]
}

export default function CodingRobotOverlay({
  item,
  stageScale,
  stagePos,
  isRunning,
  isSelected,
  isAnyDragActive,
  transform,
  selectedTextContent,
  contextSummaryLines,
  sessionView,
  onSendMessage,
  onStopMessage,
  onNewSession,
  folderPrompt,
  onOpenFolderPrompt,
  onCloseFolderPrompt,
  onUpdateItem,
  onSelectItems,
  selectedIds,
}: CodingRobotOverlayProps) {
  const mainContainerRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const activityContainerRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const activityScrollRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(stageScale)
  const chatAtBottomRef = useRef(true)
  const activityAtBottomRef = useRef(true)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [sessionIdHover, setSessionIdHover] = useState(false)
  const [sessionIdCopied, setSessionIdCopied] = useState(false)
  // A problem from a menu action, shown with the session's own notices
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [inputText, setInputText] = useState(item.text)
  const [viewStepIndex, setViewStepIndex] = useState(0)
  const prevStepCountRef = useRef(0)
  const [liveWidthPx, setLiveWidthPx] = useState<number | null>(null) // transient during drag
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const showActivity = item.showActivity ?? false
  const setShowActivity = (val: boolean | ((v: boolean) => boolean)) => {
    const newVal = typeof val === 'function' ? val(showActivity) : val
    onUpdateItem(item.id, { showActivity: newVal })
  }

  const theme = CODING_ROBOT_THEME
  const agent: CodingAgent = item.agent ?? 'claude-code'
  const agentLabel = CODING_AGENT_LABELS[agent]
  const session = sessionView?.session ?? null
  // Settings apply to a session when it starts
  const settingsLocked = !!item.agentSessionId || isRunning
  const activitySteps = sessionView?.activitySteps ?? []
  const chatMessages = [...item.chatHistory, ...(sessionView?.messages ?? [])]
  const notice = localNotice ?? sessionView?.notice ?? null
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width
  const height = transform?.height ?? item.height

  const displayWidth = width * stageScale
  const displayHeight = height * stageScale
  const left = x * stageScale + stagePos.x
  const top = (y + CODING_ROBOT_HEADER_HEIGHT) * stageScale + stagePos.y
  // Clear of the inner half of the canvas border on the sides and bottom
  const borderInset = (CODING_ROBOT_BORDER_WIDTH / 2) * stageScale

  const totalSteps = activitySteps.length
  const currentMessages = totalSteps > 0 ? activitySteps[viewStepIndex] || [] : []

  // When a new step is added, auto-navigate to it
  useEffect(() => {
    if (totalSteps > prevStepCountRef.current && totalSteps > 0) {
      setViewStepIndex(totalSteps - 1)
    }
    prevStepCountRef.current = totalSteps
  }, [totalSteps])

  // Sync local input when item.text is cleared externally (after send)
  useEffect(() => {
    if (item.text === '' && inputText !== '') {
      setInputText('')
    }
  }, [item.text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    const el = chatEndRef.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMessages.length])

  // Auto-scroll activity panel when viewing latest step
  useEffect(() => {
    if (viewStepIndex === totalSteps - 1) {
      const el = activityEndRef.current?.parentElement
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [currentMessages.length, viewStepIndex, totalSteps])

  // Maintain scroll position ratio when stageScale changes (zoom in/out).
  // Without this, scrollTop stays at its old pixel value while content rescales,
  // causing the view to drift away from where it was.
  useLayoutEffect(() => {
    if (prevScaleRef.current !== stageScale) {
      const ratio = stageScale / prevScaleRef.current
      const pairs: [HTMLDivElement | null, React.RefObject<boolean>][] = [
        [chatScrollRef.current, chatAtBottomRef],
        [activityScrollRef.current, activityAtBottomRef],
      ]
      for (const [el, atBottom] of pairs) {
        if (!el) continue
        if (atBottom.current) {
          el.scrollTop = el.scrollHeight
        } else {
          el.scrollTop = el.scrollTop * ratio
        }
      }
      prevScaleRef.current = stageScale
    }
  }, [stageScale])

  // Forward wheel events to the Konva stage: always when not selected,
  // and on Ctrl+Wheel when selected (to zoom canvas instead of browser zoom).
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!isSelected || e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        const stageContainer = document.querySelector('.konvajs-content')
        if (stageContainer) {
          stageContainer.dispatchEvent(new WheelEvent('wheel', e))
        }
      }
    }
    const mainEl = mainContainerRef.current
    const activityEl = activityContainerRef.current
    mainEl?.addEventListener('wheel', handler, { passive: false })
    activityEl?.addEventListener('wheel', handler, { passive: false })
    return () => {
      mainEl?.removeEventListener('wheel', handler)
      activityEl?.removeEventListener('wheel', handler)
    }
  }, [isSelected, showActivity])

  // Clear text selection when deselected
  useEffect(() => {
    if (!isSelected && mainContainerRef.current) {
      const sel = window.getSelection()
      if (sel && (mainContainerRef.current.contains(sel.anchorNode) ||
          activityContainerRef.current?.contains(sel.anchorNode))) {
        sel.removeAllRanges()
      }
    }
  }, [isSelected])

  const canSend = !isRunning && (!!inputText.trim() || !!selectedTextContent)

  const handleSend = () => {
    if (!canSend) return
    // Typed text, or else the selected text
    const typed = inputText.trim()
    const message = typed || selectedTextContent
    if (!message) return
    setLocalNotice(null)
    onSendMessage(item.id, message, !typed)
    setInputText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
  }

  const copyToClipboard = (text: string | null | undefined) => {
    if (!text) return
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    })
  }

  const copySessionId = () => {
    if (!session?.cliSessionId) return
    void copyText(session.cliSessionId).then((ok) => {
      if (!ok) return
      setSessionIdCopied(true)
      setTimeout(() => setSessionIdCopied(false), 1200)
    })
  }

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const currentCanvasWidth = item.activityPanelWidth ?? CODING_ROBOT_ACTIVITY_PANEL_WIDTH
    const startWidth = currentCanvasWidth * stageScale
    resizeDragRef.current = { startX, startWidth }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return
      const delta = ev.clientX - resizeDragRef.current.startX
      const newWidthPx = Math.max(150 * stageScale, resizeDragRef.current.startWidth + delta)
      setLiveWidthPx(newWidthPx)
    }
    const onMouseUp = () => {
      if (resizeDragRef.current) {
        // Persist in canvas units
        setLiveWidthPx((current) => {
          if (current !== null) {
            const canvasWidth = Math.round(current / stageScale)
            onUpdateItem(item.id, { activityPanelWidth: canvasWidth })
          }
          return null
        })
      }
      resizeDragRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [item.activityPanelWidth, item.id, stageScale, onUpdateItem])

  const statusBarHeight = 18 * stageScale
  const inputAreaHeight = CODING_ROBOT_INPUT_HEIGHT * stageScale
  const chatAreaHeight = displayHeight - borderInset - inputAreaHeight - statusBarHeight

  const activityPanelWidth = liveWidthPx ?? (item.activityPanelWidth ?? CODING_ROBOT_ACTIVITY_PANEL_WIDTH) * stageScale
  const activityPanelGap = CODING_ROBOT_ACTIVITY_PANEL_GAP * stageScale
  const activityPanelLeft = left + displayWidth + activityPanelGap

  const selectStyle: React.CSSProperties = {
    height: `${14 * stageScale}px`,
    fontSize: `${9 * stageScale}px`,
    padding: 0,
    border: '1px solid #bbb',
    borderRadius: `${3 * stageScale}px`,
    background: 'transparent',
    color: '#666',
    minWidth: 0,
    cursor: 'pointer',
  }
  const menuItemStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    border: 'none',
    background: 'transparent',
    cursor: disabled ? 'default' : 'pointer',
    padding: `${4 * stageScale}px ${8 * stageScale}px`,
    fontSize: `${9 * stageScale}px`,
    color: disabled ? '#aaa' : '#333',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  })

  const navBtnStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: `${10 * stageScale}px`,
    padding: `0 ${2 * stageScale}px`,
    lineHeight: 1,
  }
  const navBtnDisabledStyle: React.CSSProperties = {
    ...navBtnStyle,
    color: '#444',
    cursor: 'default',
  }

  return (
    <>
      <div
        ref={mainContainerRef}
        onMouseDown={(e) => {
          if (e.button !== 0 || isSelected) return
          e.stopPropagation()
          // The input row leaves the selection alone: selected items are the message's context
          if (inputAreaRef.current?.contains(e.target as Node)) return
          // Elsewhere, select like a click on the header: replace, or add with Shift/Ctrl
          const add = e.shiftKey || e.ctrlKey || e.metaKey
          onSelectItems(add ? [...selectedIds, item.id] : [item.id])
        }}
        style={{
          position: 'absolute',
          left: left + borderInset,
          top,
          width: displayWidth - 2 * borderInset,
          height: displayHeight - borderInset,
          overflow: 'hidden',
          borderRadius: '0 0 4px 4px',
          zIndex: Z_IFRAME_OVERLAY,
          pointerEvents: isAnyDragActive ? 'none' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Session ID status bar */}
        {(
          <div
            style={{
              height: statusBarHeight,
              display: 'flex',
              alignItems: 'center',
              padding: `0 ${4 * stageScale}px`,
              background: '#e8e8e8',
              borderBottom: `1px solid ${theme.border}`,
              fontSize: `${9 * stageScale}px`,
              color: '#999',
              gap: `${3 * stageScale}px`,
              flexShrink: 0,
            }}
          >
            {settingsLocked ? (
              <span
                title={session ? `Folder: ${session.cwd}${session.cliSessionId ? `\nSession: ${session.cliSessionId}` : ''}` : undefined}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              >
                {agentLabel} · {item.agentModel ? LLM_MODEL_LABELS[item.agentModel] : 'default model'} · {(item.permissions ?? 'safe') === 'full' ? 'full access' : 'safe'}
                {session?.cliSessionId && (
                  <>
                    {' · '}
                    <span
                      onClick={copySessionId}
                      onMouseEnter={() => setSessionIdHover(true)}
                      onMouseLeave={() => setSessionIdHover(false)}
                      title={`${session.cliSessionId}\nClick to copy the ${agentLabel} session id (to resume the session in the CLI)`}
                      style={{ cursor: 'pointer', color: sessionIdHover ? '#444' : undefined }}
                    >
                      {sessionIdCopied ? 'Copied' : session.cliSessionId}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: `${3 * stageScale}px`, flex: 1, minWidth: 0 }}>
                <select
                  value={agent}
                  onChange={(e) => onUpdateItem(item.id, { agent: e.target.value as CodingAgent, agentModel: null })}
                  title="Which agent CLI runs the session"
                  style={selectStyle}
                >
                  {(Object.keys(CODING_AGENT_LABELS) as CodingAgent[]).map((a) => (
                    <option key={a} value={a}>{CODING_AGENT_LABELS[a]}</option>
                  ))}
                </select>
                <select
                  value={item.agentModel ?? ''}
                  onChange={(e) => onUpdateItem(item.id, { agentModel: (e.target.value || null) as LLMModel | null })}
                  title="Model (default: the CLI's configured model)"
                  style={selectStyle}
                >
                  <option value="">Default model</option>
                  {CODING_AGENT_MODELS[agent].map((m) => (
                    <option key={m} value={m}>{LLM_MODEL_LABELS[m]}</option>
                  ))}
                </select>
                <select
                  value={item.permissions ?? 'safe'}
                  onChange={(e) => onUpdateItem(item.id, { permissions: e.target.value as AgentPermissions })}
                  title={'Safe: Claude Code approves routine actions and blocks risky ones; Codex edits only inside its folder, with sandboxed commands.\nFull access: no checks or sandbox.'}
                  style={selectStyle}
                >
                  <option value="safe">Safe</option>
                  <option value="full">Full access</option>
                </select>
              </div>
            )}
            <div ref={menuRef} style={{ position: 'relative', flexShrink: 0, marginRight: `${4 * stageScale}px` }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  border: `1px solid #bbb`,
                  borderRadius: `${3 * stageScale}px`,
                  background: 'transparent',
                  cursor: 'pointer',
                  height: `${14 * stageScale}px`,
                  padding: `0 ${3 * stageScale}px`,
                  fontSize: `${9 * stageScale}px`,
                  color: menuOpen ? '#3b82f6' : '#999',
                  letterSpacing: `${1 * stageScale}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {copyFeedback ? 'Copied' : '...'}
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: `${3 * stageScale}px`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  minWidth: `${80 * stageScale}px`,
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => { copyToClipboard(session?.cliSessionId); setMenuOpen(false) }}
                    disabled={!session?.cliSessionId}
                    title={`The ${agentLabel} session id, to resume it in the CLI`}
                    style={menuItemStyle(!session?.cliSessionId)}
                    onMouseEnter={(e) => { if (session?.cliSessionId) (e.currentTarget).style.background = '#f0f0f0' }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                  >
                    Copy Session ID
                  </button>
                  <button
                    onClick={() => { copyToClipboard(session?.cwd); setMenuOpen(false) }}
                    disabled={!session}
                    title={session?.cwd}
                    style={menuItemStyle(!session)}
                    onMouseEnter={(e) => { if (session) (e.currentTarget).style.background = '#f0f0f0' }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                  >
                    Copy Folder Path
                  </button>
                  {browserIsOnServer() && (() => {
                    const disabled = !session?.cliSessionId || isRunning
                    return (
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          if (!session) return
                          setLocalNotice(null)
                          openAgentSessionTerminal(session.id).catch((error) => {
                            setLocalNotice(`Could not open the session in a terminal: ${error instanceof Error ? error.message : 'unknown error'}`)
                          })
                        }}
                        disabled={disabled}
                        title={isRunning
                          ? 'Wait for the running turn to finish first'
                          : `Continue this conversation in ${agentLabel} in a terminal window on this computer`}
                        style={menuItemStyle(disabled)}
                        onMouseEnter={(e) => { if (!disabled) (e.currentTarget).style.background = '#f0f0f0' }}
                        onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                      >
                        Open Session Locally
                      </button>
                    )
                  })()}
                  {!item.agentSessionId && (
                    <>
                      <button
                        onClick={() => { setMenuOpen(false); onOpenFolderPrompt?.(item.id) }}
                        title="Type the path of the folder the agent works in"
                        style={menuItemStyle(false)}
                        onMouseEnter={(e) => { (e.currentTarget).style.background = '#f0f0f0' }}
                        onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                      >
                        Type Folder Path...
                      </button>
                      <button
                        onClick={() => { onUpdateItem(item.id, { rootDirectory: '' }); setMenuOpen(false) }}
                        disabled={!item.rootDirectory}
                        title="Give the session a new folder of its own"
                        style={menuItemStyle(!item.rootDirectory)}
                        onMouseEnter={(e) => { if (item.rootDirectory) (e.currentTarget).style.background = '#f0f0f0' }}
                        onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                      >
                        Use Own Folder
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      if (window.confirm(`Start a new session? This conversation will be deleted from the server.`)) {
                        onNewSession?.(item.id)
                      }
                    }}
                    disabled={isRunning}
                    style={{ ...menuItemStyle(isRunning), color: isRunning ? '#aaa' : '#c00' }}
                    onMouseEnter={(e) => { if (!isRunning) (e.currentTarget).style.background = '#f0f0f0' }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent' }}
                  >
                    New Session
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowActivity((v) => !v)}
              title={showActivity ? 'Hide activity' : 'Show activity'}
              style={{
                border: `1px solid ${showActivity ? '#3b82f6' : '#bbb'}`,
                borderRadius: `${3 * stageScale}px`,
                background: 'transparent',
                cursor: 'pointer',
                height: `${14 * stageScale}px`,
                padding: `0 ${3 * stageScale}px`,
                fontSize: `${9 * stageScale}px`,
                color: showActivity ? '#3b82f6' : '#999',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Activity
            </button>
          </div>
        )}

        {/* Chat history area */}
        <div
          ref={chatScrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            chatAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 2
          }}
          style={{
            flex: 1,
            height: chatAreaHeight,
            overflowY: 'auto',
            padding: `${4 * stageScale}px`,
            fontSize: `${12 * stageScale}px`,
            background: theme.itemBg,
          }}
        >
          {chatMessages.length === 0 && !notice && (
            <div style={{
              color: '#999',
              fontStyle: 'italic',
              textAlign: 'center',
              marginTop: `${20 * stageScale}px`,
              fontSize: `${11 * stageScale}px`,
            }}>
              Send a message to start a {agentLabel} session
            </div>
          )}
          {chatMessages.map((msg: ChatMessage, i: number) => (
            <div
              key={i}
              style={{
                marginBottom: `${4 * stageScale}px`,
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: `${4 * stageScale}px ${8 * stageScale}px`,
                  borderRadius: `${6 * stageScale}px`,
                  background: msg.role === 'user' ? '#6a6a6a' : '#e0e0e0',
                  color: msg.role === 'user' ? '#fff' : '#333',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                }}
              >
                {msg.role === 'assistant' ? <ChatMarkdown text={msg.content} /> : msg.content}
              </div>
            </div>
          ))}
          {isRunning && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: `${4 * stageScale}px`,
            }}>
              <div style={{
                padding: `${4 * stageScale}px ${8 * stageScale}px`,
                borderRadius: `${6 * stageScale}px`,
                background: '#e0e0e0',
                color: '#999',
                fontStyle: 'italic',
              }}>
                Thinking...
              </div>
            </div>
          )}
          {notice && (
            <div style={{
              margin: `${4 * stageScale}px 0`,
              padding: `${4 * stageScale}px ${8 * stageScale}px`,
              borderRadius: `${4 * stageScale}px`,
              background: '#fdecec',
              color: '#a11',
              fontSize: `${11 * stageScale}px`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {notice}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div
          ref={inputAreaRef}
          style={{
            height: inputAreaHeight,
            display: 'flex',
            alignItems: 'stretch',
            gap: `${2 * stageScale}px`,
            padding: `${3 * stageScale}px`,
            background: theme.headerBg,
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1,
              resize: 'none',
              border: `1px solid ${theme.border}`,
              borderRadius: `${4 * stageScale}px`,
              padding: `${4 * stageScale}px ${6 * stageScale}px`,
              fontSize: `${12 * stageScale}px`,
              fontFamily: 'inherit',
              background: '#fff',
              color: '#333',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${2 * stageScale}px` }}>
            <button
              onClick={handleSend}
              disabled={!canSend}
              title={contextSummaryLines?.join('\n')}
              style={{
                width: CODING_ROBOT_SEND_BUTTON_WIDTH * stageScale,
                height: BUTTON_HEIGHT * stageScale,
                border: '1px solid #444',
                borderRadius: `${4 * stageScale}px`,
                background: canSend ? theme.runButton : '#787878',
                color: '#fff',
                fontSize: `${12 * stageScale}px`,
                fontWeight: 'bold',
                cursor: canSend ? 'pointer' : 'default',
              }}
            >
              Send
            </button>
            <button
              onClick={() => onStopMessage?.(item.id)}
              disabled={!isRunning}
              style={{
                width: CODING_ROBOT_SEND_BUTTON_WIDTH * stageScale,
                height: BUTTON_HEIGHT * stageScale,
                border: '1px solid #444',
                borderRadius: `${4 * stageScale}px`,
                background: isRunning ? '#dc2626' : '#787878',
                color: '#fff',
                fontSize: `${12 * stageScale}px`,
                fontWeight: 'bold',
                cursor: isRunning ? 'pointer' : 'default',
              }}
            >
              Stop
            </button>
          </div>
        </div>
      </div>

      {folderPrompt && (
        <CodingRobotFolderPopup
          current={item.rootDirectory ?? ''}
          anchor={{ left, top, width: displayWidth }}
          notice={folderPrompt.notice}
          mode={folderPrompt.mode}
          onApply={(folder) => onUpdateItem(item.id, { rootDirectory: folder })}
          onClose={() => onCloseFolderPrompt?.()}
        />
      )}

      {/* Activity panel */}
      {showActivity && (
        <div
          ref={activityContainerRef}
          style={{
            position: 'absolute',
            left: activityPanelLeft,
            top,
            width: activityPanelWidth,
            height: displayHeight,
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: `${4 * stageScale}px`,
            zIndex: Z_IFRAME_OVERLAY,
            pointerEvents: isAnyDragActive ? 'none' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
            overflow: 'hidden',
          }}
        >
          {/* Panel header with step navigation */}
          <div style={{
            padding: `${4 * stageScale}px ${8 * stageScale}px`,
            background: '#2d2d2d',
            borderBottom: '1px solid #333',
            fontSize: `${10 * stageScale}px`,
            color: '#aaa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {totalSteps > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: `${3 * stageScale}px` }}>
                <button
                  onClick={() => setViewStepIndex((i) => Math.max(0, i - 1))}
                  disabled={viewStepIndex <= 0}
                  style={viewStepIndex <= 0 ? navBtnDisabledStyle : navBtnStyle}
                  title="Previous step"
                >
                  &lt;
                </button>
                <span>{viewStepIndex + 1}/{totalSteps}</span>
                <button
                  onClick={() => setViewStepIndex((i) => Math.min(totalSteps - 1, i + 1))}
                  disabled={viewStepIndex >= totalSteps - 1}
                  style={viewStepIndex >= totalSteps - 1 ? navBtnDisabledStyle : navBtnStyle}
                  title="Next step"
                >
                  &gt;
                </button>
              </div>
            ) : (
              <span>Activity</span>
            )}
            <button
              onClick={() => setShowActivity(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#666',
                cursor: 'pointer',
                fontSize: `${10 * stageScale}px`,
                padding: 0,
              }}
            >
              X
            </button>
          </div>

          {/* Activity messages */}
          <div
            ref={activityScrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              activityAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 2
            }}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: `${4 * stageScale}px`,
            }}
          >
            {currentMessages.length === 0 && (
              <div style={{
                color: '#555',
                fontStyle: 'italic',
                textAlign: 'center',
                marginTop: `${20 * stageScale}px`,
                fontSize: `${9 * stageScale}px`,
              }}>
                {isRunning ? 'Waiting for activity...' : 'No activity yet'}
              </div>
            )}
            {currentMessages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  borderLeft: `${3 * stageScale}px solid ${ACTIVITY_BORDER_COLORS[msg.type]}`,
                  padding: `${3 * stageScale}px ${6 * stageScale}px`,
                  marginBottom: `${3 * stageScale}px`,
                  fontSize: `${9 * stageScale}px`,
                  color: '#ccc',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.3,
                }}
              >
                {msg.content}
              </div>
            ))}
            <div ref={activityEndRef} />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: `${4 * stageScale}px`,
              height: '100%',
              cursor: 'col-resize',
              background: 'transparent',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#555' }}
            onMouseLeave={(e) => { if (!resizeDragRef.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          />
        </div>
      )}
    </>
  )
}
