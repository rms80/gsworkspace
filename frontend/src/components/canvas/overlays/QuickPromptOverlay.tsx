import { useState, useRef, useEffect } from 'react'
import { PROMPT_THEME, IMAGE_GEN_PROMPT_THEME } from '../../../constants/canvas'

export type QuickPromptMode = 'prompt' | 'image-gen-prompt'

interface QuickPromptOverlayProps {
  mode: QuickPromptMode
  screenPos: { x: number; y: number }
  contextSummaryLines?: string[]
  onRun: (text: string) => void
  onRunAndSave: (text: string) => void
  onClose: () => void
}

export default function QuickPromptOverlay({
  mode,
  screenPos,
  contextSummaryLines,
  onRun,
  onRunAndSave,
  onClose,
}: QuickPromptOverlayProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Position the popup so it doesn't overflow the viewport
  const width = 360
  const estimatedHeight = 200
  let left = screenPos.x
  let top = screenPos.y
  if (left + width > window.innerWidth - 16) {
    left = window.innerWidth - width - 16
  }
  if (top + estimatedHeight > window.innerHeight - 16) {
    top = window.innerHeight - estimatedHeight - 16
  }
  if (left < 16) left = 16
  if (top < 16) top = 16

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
        style={{
          position: 'fixed',
          left,
          top,
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
        {/* Header */}
        <div
          style={{
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
