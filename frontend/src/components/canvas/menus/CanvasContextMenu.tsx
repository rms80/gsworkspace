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
  onClose,
}: CanvasContextMenuProps) {
  const [newSubmenuOpen, setNewSubmenuOpen] = useState(false)

  const buttonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '5px 12px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 12,
    color: '#ddd',
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.y,
    left: position.x,
    background: '#3a3a3a',
    border: '1px solid #555',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: Z_MENU,
    minWidth: 150,
  }

  const submenuStyle: React.CSSProperties = {
    position: 'absolute',
    left: '100%',
    top: 0,
    background: '#3a3a3a',
    border: '1px solid #555',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    minWidth: 150,
    zIndex: Z_MENU + 1,
  }

  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#4a4a4a'
  }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'none'
  }

  return (
    <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
      {/* New submenu */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setNewSubmenuOpen(true)}
        onMouseLeave={() => setNewSubmenuOpen(false)}
      >
        <button
          style={{
            ...buttonStyle,
            background: newSubmenuOpen ? '#4a4a4a' : 'none',
          }}
        >
          New...
        </button>
        {newSubmenuOpen && (
          <div style={submenuStyle}>
            <button
              onClick={() => { onAddText?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
              style={buttonStyle}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              Text Block
            </button>
            <button
              onClick={() => { onAddPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
              style={buttonStyle}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              LLM Prompt
            </button>
            <button
              onClick={() => { onAddImageGenPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
              style={buttonStyle}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              ImageGen Prompt
            </button>
            <button
              onClick={() => { onAddHtmlGenPrompt?.(canvasPosition?.x, canvasPosition?.y); onClose() }}
              style={buttonStyle}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              HTMLGen Prompt
            </button>
          </div>
        )}
      </div>
      <button
        onClick={onPaste}
        style={buttonStyle}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
      >
        Paste
      </button>
    </div>
  )
}
