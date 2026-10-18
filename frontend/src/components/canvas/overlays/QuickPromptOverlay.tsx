import { useState, useRef, useEffect } from 'react'
import { PROMPT_THEME, IMAGE_GEN_PROMPT_THEME } from '../../../constants/canvas'
import { STATUS_BAR_HEIGHT } from '../../StatusBar'

export type QuickPromptMode = 'prompt' | 'image-gen-prompt'

// Space between the popup and the status bar (which is fixed over the bottom of the window)
const BOTTOM_GAP = 20

interface QuickPromptOverlayProps {
  mode: QuickPromptMode
  /** The canvas area; the popup opens centered at its bottom */
  viewportRef: React.RefObject<HTMLDivElement>
  contextSummaryLines?: string[]
  onRun: (text: string) => void
  onRunAndSave: (text: string) => void
  onClose: () => void
}

export default function QuickPromptOverlay({
  mode,
  viewportRef,
  contextSummaryLines,
  onRun,
  onRunAndSave,
  onClose,
}: QuickPromptOverlayProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // Where the user dragged the popup to by its header; null until then
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null)
  const endDragRef = useRef<(() => void) | null>(null)

  // Stop listening for a drag in progress if the popup closes mid-drag
  useEffect(() => () => endDragRef.current?.(), [])

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !popupRef.current) return
    // Keep focus (and the caret) in the textarea
    e.preventDefault()
    const rect = popupRef.current.getBoundingClientRect()
    const grabX = e.clientX - rect.left
    const grabY = e.clientY - rect.top
    const onMove = (ev: MouseEvent) => {
      // Keep the whole popup on screen
      setDragPos({
        left: Math.min(Math.max(0, ev.clientX - grabX), window.innerWidth - rect.width),
        top: Math.min(Math.max(0, ev.clientY - grabY), window.innerHeight - rect.height),
      })
    }
    const endDrag = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', endDrag)
      endDragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', endDrag)
    endDragRef.current = endDrag
  }

  const theme = mode === 'prompt' ? PROMPT_THEME : IMAGE_GEN_PROMPT_THEME
  const title = mode === 'prompt' ? 'Quick Prompt' : 'Quick Image Prompt'
  const placeholder = mode === 'prompt'
    ? 'Enter your prompt...'
    : 'Describe the image you want to generate...'

  // Auto-focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const handleRun = () => {
    if (!text.trim()) return
    onRun(text.trim())
    onClose()
  }

  const handleRunAndSave = () => {
    if (!text.trim()) return
    onRunAndSave(text.trim())
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      handleRun()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      handleRunAndSave()
    }
  }

  // Centered over the canvas area, just above the status bar, anchored by its bottom edge so it
  // grows upward (the textarea resizes); where it was dragged to, once moved
  const width = 720
  const viewport = viewportRef.current?.getBoundingClientRect()
  const placement: React.CSSProperties = dragPos
    ? { left: dragPos.left, top: dragPos.top }
    : {
        left: Math.max(16, viewport ? viewport.left + (viewport.width - width) / 2 : (window.innerWidth - width) / 2),
        bottom: STATUS_BAR_HEIGHT + BOTTOM_GAP,
      }

  return (
    <>
      {/* Transparent backdrop to catch clicks outside */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Popup */}
      <div
        ref={popupRef}
        style={{
          position: 'fixed',
          ...placement,
          width,
          zIndex: 1000,
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `2px solid ${theme.border}`,
          backgroundColor: theme.itemBg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: drag it to move the popup */}
        <div
          onMouseDown={handleHeaderMouseDown}
          title="Drag to move"
          style={{
            cursor: 'move',
            userSelect: 'none',
            padding: '6px 12px',
            backgroundColor: theme.headerBg,
            color: theme.headerText,
            fontWeight: 600,
            fontSize: 13,
            fontFamily: 'sans-serif',
          }}
        >
          {title}
        </div>

        {/* Context summary */}
        {contextSummaryLines && contextSummaryLines.length > 0 && contextSummaryLines[0] !== 'No context selected' && (
          <div
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontFamily: 'sans-serif',
              color: theme.headerText,
              backgroundColor: theme.headerBg,
              opacity: 0.8,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            Context: {contextSummaryLines.join(', ')}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            margin: '8px 8px 0 8px',
            padding: 8,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            backgroundColor: theme.textareaBg,
            color: theme.contentText,
            fontFamily: 'sans-serif',
            fontSize: 14,
            resize: 'vertical',
            minHeight: 80,
            maxHeight: 300,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Buttons */}
        <div
          style={{
            padding: '8px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: '#888', alignSelf: 'center', marginRight: 'auto', fontFamily: 'sans-serif' }}>
            Ctrl+Enter / Ctrl+Shift+Enter
          </span>
          <button
            onClick={handleRunAndSave}
            disabled={!text.trim()}
            style={{
              padding: '5px 12px',
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              backgroundColor: theme.headerBg,
              color: theme.headerText,
              cursor: text.trim() ? 'pointer' : 'default',
              fontFamily: 'sans-serif',
              fontSize: 13,
              fontWeight: 500,
              opacity: text.trim() ? 1 : 0.5,
            }}
          >
            Run &amp; Save
          </button>
          <button
            onClick={handleRun}
            disabled={!text.trim()}
            style={{
              padding: '5px 12px',
              border: 'none',
              borderRadius: 4,
              backgroundColor: text.trim() ? theme.runButton : '#ccc',
              color: '#fff',
              cursor: text.trim() ? 'pointer' : 'default',
              fontFamily: 'sans-serif',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Run
          </button>
        </div>
      </div>
    </>
  )
}
