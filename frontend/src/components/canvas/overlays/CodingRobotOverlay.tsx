import { useRef, useEffect, useState } from 'react'
import { CodingRobotItem, ChatMessage, ActivityMessage } from '../../../types'
import {
  CODING_ROBOT_HEADER_HEIGHT,
  CODING_ROBOT_INPUT_HEIGHT,
  CODING_ROBOT_SEND_BUTTON_WIDTH,
  CODING_ROBOT_THEME,
  CODING_ROBOT_ACTIVITY_PANEL_WIDTH,
  CODING_ROBOT_ACTIVITY_PANEL_GAP,
  Z_IFRAME_OVERLAY,
  BUTTON_HEIGHT,
} from '../../../constants/canvas'

const ACTIVITY_BORDER_COLORS: Record<ActivityMessage['type'], string> = {
  tool_use: '#3b82f6',
  assistant_text: '#22c55e',
  status: '#f59e0b',
  error: '#ef4444',
}

interface CodingRobotOverlayProps {
  item: CodingRobotItem
  stageScale: number
  stagePos: { x: number; y: number }
  isRunning: boolean
  isAnyDragActive: boolean
  transform?: { x: number; y: number; width: number; height: number }
  selectedTextContent: string
  activityMessages: ActivityMessage[]
  onSendMessage: (itemId: string, message: string) => void
  onUpdateItem: (id: string, changes: Partial<CodingRobotItem>) => void
}

export default function CodingRobotOverlay({
  item,
  stageScale,
  stagePos,
  isRunning,
  isAnyDragActive,
  transform,
  selectedTextContent,
  activityMessages,
  onSendMessage,
  onUpdateItem,
}: CodingRobotOverlayProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const prevIsRunningRef = useRef(false)

  const theme = CODING_ROBOT_THEME
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width
  const height = transform?.height ?? item.height

  const displayWidth = width * stageScale
  const displayHeight = height * stageScale
  const left = x * stageScale + stagePos.x
  const top = (y + CODING_ROBOT_HEADER_HEIGHT) * stageScale + stagePos.y

  // Auto-open activity panel when running starts
  useEffect(() => {
    if (isRunning && !prevIsRunningRef.current) {
      setShowActivity(true)
    }
    prevIsRunningRef.current = isRunning
  }, [isRunning])

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [item.chatHistory.length])

  // Auto-scroll activity panel
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activityMessages.length])

  const canSend = !isRunning && (!!item.text.trim() || !!selectedTextContent)

  const handleSend = () => {
    if (!canSend) return
    // If there are selected text blocks, use their content as the message
    const message = selectedTextContent || item.text.trim()
    if (!message) return
    onSendMessage(item.id, message)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateItem(item.id, { text: e.target.value })
  }

  const handleCopySessionId = () => {
    if (!item.sessionId) return
    navigator.clipboard.writeText(item.sessionId).then(() => {
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    })
  }

  const showNoSessionBar = !item.sessionId && (isRunning || activityMessages.length > 0)
  const statusBarHeight = (item.sessionId || showNoSessionBar) ? 18 * stageScale : 0
  const inputAreaHeight = CODING_ROBOT_INPUT_HEIGHT * stageScale
  const chatAreaHeight = displayHeight - inputAreaHeight - statusBarHeight

  const activityPanelWidth = CODING_ROBOT_ACTIVITY_PANEL_WIDTH * stageScale
  const activityPanelGap = CODING_ROBOT_ACTIVITY_PANEL_GAP * stageScale
  const activityPanelLeft = left + displayWidth + activityPanelGap

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: displayWidth,
          height: displayHeight,
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
        {item.sessionId && (
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
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              Session: {item.sessionId}
            </span>
            <button
              onClick={() => setShowActivity((v) => !v)}
              title={showActivity ? 'Hide activity' : 'Show activity'}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: `0 ${2 * stageScale}px`,
                fontSize: `${9 * stageScale}px`,
                color: showActivity ? '#3b82f6' : '#999',
                flexShrink: 0,
              }}
            >
              Activity
            </button>
            <button
              onClick={handleCopySessionId}
              title="Copy session ID"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: `0 ${2 * stageScale}px`,
                fontSize: `${9 * stageScale}px`,
                color: copyFeedback ? '#22c55e' : '#999',
                flexShrink: 0,
              }}
            >
              {copyFeedback ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {/* Activity toggle when no session yet but running */}
        {!item.sessionId && (isRunning || activityMessages.length > 0) && (
          <div
            style={{
              height: 18 * stageScale,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: `0 ${4 * stageScale}px`,
              background: '#e8e8e8',
              borderBottom: `1px solid ${theme.border}`,
              fontSize: `${9 * stageScale}px`,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setShowActivity((v) => !v)}
              title={showActivity ? 'Hide activity' : 'Show activity'}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: `0 ${2 * stageScale}px`,
                fontSize: `${9 * stageScale}px`,
                color: showActivity ? '#3b82f6' : '#999',
              }}
            >
              Activity
            </button>
          </div>
        )}

        {/* Chat history area */}
        <div
          style={{
            flex: 1,
            height: chatAreaHeight,
            overflowY: 'auto',
            padding: `${4 * stageScale}px`,
            fontSize: `${12 * stageScale}px`,
            background: theme.itemBg,
          }}
        >
          {item.chatHistory.length === 0 && (
            <div style={{
              color: '#999',
              fontStyle: 'italic',
              textAlign: 'center',
              marginTop: `${20 * stageScale}px`,
              fontSize: `${11 * stageScale}px`,
            }}>
              Send a message to start a conversation with Claude Code
            </div>
          )}
          {item.chatHistory.map((msg: ChatMessage, i: number) => (
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
                {msg.content}
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
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div
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
            value={item.text}
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
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              width: CODING_ROBOT_SEND_BUTTON_WIDTH * stageScale,
              height: BUTTON_HEIGHT * stageScale,
              border: `${1 * stageScale}px solid #000`,
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
        </div>
      </div>

      {/* Activity panel */}
      {showActivity && activityMessages.length > 0 && (
        <div
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
          {/* Panel header */}
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
            <span>Activity</span>
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
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: `${4 * stageScale}px`,
          }}>
            {activityMessages.map((msg) => (
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
        </div>
      )}
    </>
  )
}
