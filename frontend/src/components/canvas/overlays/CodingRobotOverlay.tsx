import { useRef, useEffect } from 'react'
import { CodingRobotItem, ChatMessage } from '../../../types'
import {
  CODING_ROBOT_HEADER_HEIGHT,
  CODING_ROBOT_INPUT_HEIGHT,
  CODING_ROBOT_SEND_BUTTON_WIDTH,
  CODING_ROBOT_THEME,
  Z_IFRAME_OVERLAY,
} from '../../../constants/canvas'

interface CodingRobotOverlayProps {
  item: CodingRobotItem
  stageScale: number
  stagePos: { x: number; y: number }
  isRunning: boolean
  isAnyDragActive: boolean
  transform?: { x: number; y: number; width: number; height: number }
  selectedTextContent: string
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
  onSendMessage,
  onUpdateItem,
}: CodingRobotOverlayProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const theme = CODING_ROBOT_THEME
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width
  const height = transform?.height ?? item.height

  const displayWidth = width * stageScale
  const displayHeight = height * stageScale
  const left = x * stageScale + stagePos.x
  const top = (y + CODING_ROBOT_HEADER_HEIGHT) * stageScale + stagePos.y

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [item.chatHistory.length])

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

  const inputAreaHeight = CODING_ROBOT_INPUT_HEIGHT * stageScale
  const chatAreaHeight = displayHeight - inputAreaHeight

  return (
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
                background: msg.role === 'user' ? '#e05020' : '#f0ebe0',
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
              background: '#f0ebe0',
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
            border: 'none',
            borderRadius: `${4 * stageScale}px`,
            background: canSend ? theme.runButton : '#ccc',
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
  )
}
