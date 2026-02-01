import { useState } from 'react'
import { Z_MENU } from '../../../constants/canvas'

interface CanvasContextMenuProps {
  position: { x: number; y: number }
  onPaste: () => void
  onAddText?: () => void
  onAddPrompt?: () => void
  onAddImageGenPrompt?: () => void
  onAddHtmlGenPrompt?: () => void
  onClose: () => void
}

export default function CanvasContextMenu({
  position,
  onPaste,
  onAddText,
  onAddPrompt,
  onAddImageGenPrompt,
  onAddHtmlGenPrompt,
  onClose,
}: CanvasContextMenuProps) {
  const [newSubmenuOpen, setNewSubmenuOpen] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: Z_MENU,
        minWidth: 120,
      }}
    >
      <button
        onClick={onPaste}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 14,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Paste
      </button>
      {/* New submenu */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setNewSubmenuOpen(true)}
        onMouseLeave={() => setNewSubmenuOpen(false)}
      >
        <button
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 16px',
            border: 'none',
            background: newSubmenuOpen ? '#f0f0f0' : 'none',
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          New &rarr;
        </button>
        {newSubmenuOpen && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              minWidth: 140,
              zIndex: Z_MENU + 1,
            }}
          >
            <button
              onClick={() => { onAddText?.(); onClose() }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              Text Block
            </button>
            <button
              onClick={() => { onAddPrompt?.(); onClose() }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              LLM Prompt
            </button>
            <button
              onClick={() => { onAddImageGenPrompt?.(); onClose() }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              ImageGen Prompt
            </button>
            <button
              onClick={() => { onAddHtmlGenPrompt?.(); onClose() }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              HTMLGen Prompt
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
