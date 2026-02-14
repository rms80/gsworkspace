import { useState } from 'react'
import { Z_MENU } from '../../../constants/canvas'

interface CanvasContextMenuProps {
  position: { x: number; y: number }
  canvasPosition?: { x: number; y: number }
  onPaste: () => void
  onAddText?: (x?: number, y?: number) => void
  onAddPrompt?: (x?: number, y?: number) => void
  onAddImageGenPrompt?: (x?: number, y?: number) => void
  onAddHtmlGenPrompt?: (x?: number, y?: number) => void
  onAddCodingRobot?: (x?: number, y?: number) => void
  onClose: () => void
}

export default function CanvasContextMenu({
  position,
  canvasPosition,
  onPaste,
  onAddText,
  onAddPrompt,
  onAddImageGenPrompt,
  onAddHtmlGenPrompt,
  onAddCodingRobot,
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
          New...
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
              onClick={() => { onAddText?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
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
              onClick={() => { onAddPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
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
              onClick={() => { onAddImageGenPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
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
              onClick={() => { onAddHtmlGenPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
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
            <button
              onClick={() => { onAddCodingRobot?.(); onClose() }}
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
              Coding Robot
            </button>
          </div>
        )}
      </div>
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
    </div>
  )
}
